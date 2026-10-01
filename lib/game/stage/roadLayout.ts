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
 * Validates minimum corner variety and that road parts far apart along the route
 * never come close in space, ruling out unplayable routes and crossings.
 * @param layout - Road layout candidate.
 * @returns True when the layout is usable.
 */
export function validateRoadLayout(layout: RoadLayout): boolean {
  const { samples, corners } = layout;
  const severeCornerCount = corners.filter((corner) => corner.classId === "hairpin" || corner.classId === "tight").length;
  if (corners.length < ROAD.MIN_CORNERS || severeCornerCount < ROAD.MIN_SEVERE_CORNERS) return false;

  const minSeparationSq = ROAD.MIN_SEPARATION * ROAD.MIN_SEPARATION;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    for (let j = i + 1; j < samples.length; j++) {
      const b = samples[j];
      if (b.s - a.s < ROAD.SEPARATION_ARC_EXEMPT) continue;
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      if (dx * dx + dz * dz < minSeparationSq) return false;
    }
  }
  return true;
}
