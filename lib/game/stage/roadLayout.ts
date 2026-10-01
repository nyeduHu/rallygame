// lib/game/stage/roadLayout.ts
import { CORNER_CLASSES, ROAD } from "../constants";
import type { Rng } from "../random";
import type { CornerInfo, RoadSample } from "./types";

/** Flat (y = 0) road layout before elevation is applied. */
export interface RoadLayout {
  samples: RoadSample[];
  corners: CornerInfo[];
}

/** Mutable cursor used while laying down segments. */
interface LayoutCursor {
  x: number;
  z: number;
  heading: number;
  s: number;
  samples: RoadSample[];
}

/**
 * Appends a straight segment, subdividing so samples stay close to SAMPLE_SPACING.
 * @param cursor - Layout cursor (mutated).
 * @param length - Segment length.
 */
function appendStraight(cursor: LayoutCursor, length: number): void {
  const steps = Math.max(1, Math.ceil(length / ROAD.SAMPLE_SPACING));
  const step = length / steps;
  const dx = Math.sin(cursor.heading) * step;
  const dz = Math.cos(cursor.heading) * step;
  for (let i = 0; i < steps; i++) {
    cursor.x += dx;
    cursor.z += dz;
    cursor.s += step;
    cursor.samples.push({ x: cursor.x, y: 0, z: cursor.z, s: cursor.s, heading: cursor.heading });
  }
}

/**
 * Appends a constant-radius arc using the exact closed-form integral of the
 * tangent, so corners have true radii (important for future pace notes).
 * @param cursor - Layout cursor (mutated).
 * @param radius - Arc radius.
 * @param angle - Total turn angle (positive).
 * @param direction - 1 = left, -1 = right.
 */
function appendArc(cursor: LayoutCursor, radius: number, angle: number, direction: 1 | -1): void {
  const arcLength = radius * angle;
  const steps = Math.max(1, Math.ceil(arcLength / ROAD.SAMPLE_SPACING));
  const step = arcLength / steps;
  const curvature = direction / radius;
  for (let i = 0; i < steps; i++) {
    const h0 = cursor.heading;
    const h1 = h0 + curvature * step;
    cursor.x += (Math.cos(h0) - Math.cos(h1)) / curvature;
    cursor.z += (Math.sin(h1) - Math.sin(h0)) / curvature;
    cursor.heading = h1;
    cursor.s += step;
    cursor.samples.push({ x: cursor.x, y: 0, z: cursor.z, s: cursor.s, heading: cursor.heading });
  }
}

/**
 * Lays out a stage as straights and constant-radius corners. Turn direction is
 * biased back toward the main heading so the stage progresses instead of coiling.
 * @param rng - Seeded generator for this attempt.
 * @returns Flat layout.
 */
export function generateRoadLayout(rng: Rng): RoadLayout {
  const mainHeading = rng.range(-Math.PI, Math.PI);
  const cursor: LayoutCursor = {
    x: 0,
    z: 0,
    heading: mainHeading,
    s: 0,
    samples: [{ x: 0, y: 0, z: 0, s: 0, heading: mainHeading }],
  };
  const corners: CornerInfo[] = [];

  appendStraight(cursor, ROAD.START_STRAIGHT);

  while (cursor.s < ROAD.TARGET_LENGTH - ROAD.FINISH_STRAIGHT) {
    const deviation = cursor.heading - mainHeading;
    const hairpinAllowed = Math.abs(deviation) < ROAD.HAIRPIN_HEADING_LIMIT;
    const candidates = CORNER_CLASSES.filter((c) => hairpinAllowed || c.id !== "hairpin");
    const cornerClass = rng.weighted(candidates);
    const radius = rng.range(cornerClass.radiusMin, cornerClass.radiusMax);
    const angle = rng.range(cornerClass.angleMin, cornerClass.angleMax);
    const randomDirection: 1 | -1 = rng.sign() > 0 ? 1 : -1;
    const direction: 1 | -1 =
      Math.abs(deviation) > ROAD.HEADING_SOFT_LIMIT ? (deviation > 0 ? -1 : 1) : randomDirection;

    const startS = cursor.s;
    appendArc(cursor, radius, angle, direction);
    corners.push({
      startS,
      endS: cursor.s,
      apexS: (startS + cursor.s) / 2,
      radius,
      angle,
      direction,
      classId: cornerClass.id,
    });

    const link = rng.chance(ROAD.SHORT_LINK_CHANCE)
      ? rng.range(ROAD.SHORT_LINK_MIN, ROAD.SHORT_LINK_MAX)
      : rng.range(ROAD.STRAIGHT_MIN, ROAD.STRAIGHT_MAX);
    appendStraight(cursor, link);
  }

  appendStraight(cursor, ROAD.FINISH_STRAIGHT);
  return { samples: cursor.samples, corners };
}

/**
 * Lays out a short side road starting at a given pose, using the same straights and corners as
 * the main route.
 * @param rng - Seeded generator.
 * @param start - Start position and heading.
 * @param length - Approximate length in metres.
 * @returns Flat layout with local arc length starting at 0.
 */
export function generateSpurLayout(
  rng: Rng,
  start: { x: number; z: number; heading: number },
  length: number,
): RoadLayout {
  const cursor: LayoutCursor = {
    x: start.x,
    z: start.z,
    heading: start.heading,
    s: 0,
    samples: [{ x: start.x, y: 0, z: start.z, s: 0, heading: start.heading }],
  };
  const corners: CornerInfo[] = [];
  appendStraight(cursor, rng.range(ROAD.STRAIGHT_MIN, ROAD.STRAIGHT_MAX / 2));
  while (cursor.s < length) {
    // Spurs are gentler than the main stage: no hairpins.
    const cornerClass = rng.weighted(CORNER_CLASSES.filter((c) => c.id !== "hairpin"));
    const radius = rng.range(cornerClass.radiusMin, cornerClass.radiusMax);
    const angle = rng.range(cornerClass.angleMin, cornerClass.angleMax);
    const direction: 1 | -1 = rng.sign() > 0 ? 1 : -1;
    const startS = cursor.s;
    appendArc(cursor, radius, angle, direction);
    corners.push({ startS, endS: cursor.s, apexS: (startS + cursor.s) / 2, radius, angle, direction, classId: cornerClass.id });
    appendStraight(cursor, rng.range(ROAD.STRAIGHT_MIN, ROAD.STRAIGHT_MAX));
  }
  return { samples: cursor.samples, corners };
}

/**
 * Minimum corner variety (the separation and other fairness checks live in `validateStage`).
 * @param layout - Candidate layout.
 * @returns True when there are enough corners and at least one severe one.
 */
export function hasEnoughCorners(layout: RoadLayout): boolean {
  const severeCornerCount = layout.corners.filter((corner) => corner.classId === "hairpin" || corner.classId === "tight").length;
  return layout.corners.length >= ROAD.MIN_CORNERS && severeCornerCount >= ROAD.MIN_SEVERE_CORNERS;
}
