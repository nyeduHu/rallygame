// lib/game/stage/pitStop.ts
import { PIT, ROAD } from "../constants";
import { poseAt } from "./roadIndex";
import type { CornerInfo, PitInfo, PropPlacement, RoadSample } from "./types";

interface Interval {
  from: number;
  to: number;
}

/** Road edge distance from the centreline including the shoulder. */
const ROAD_EDGE = ROAD.WIDTH / 2 + ROAD.SHOULDER_WIDTH;

/**
 * Finds straight stretches inside the pit band that are at least `MIN_CLEARANCE` from every
 * corner, longest first.
 * @param corners - Stage corners.
 * @param bandFrom - Band start (arc length).
 * @param bandTo - Band end (arc length).
 * @param clearance - Required distance from corners.
 * @returns Candidate intervals sorted by length, descending.
 */
function straightCandidates(
  corners: ReadonlyArray<CornerInfo>,
  bandFrom: number,
  bandTo: number,
  clearance: number = PIT.MIN_CLEARANCE_FROM_CORNER_M,
): Interval[] {
  const blocked: Interval[] = corners
    .map((corner) => ({ from: corner.startS - clearance, to: corner.endS + clearance }))
    .sort((a, b) => a.from - b.from);
  const free: Interval[] = [];
  let cursor = bandFrom;
  for (const gap of blocked) {
    if (gap.to <= cursor) continue;
    if (gap.from >= bandTo) break;
    if (gap.from > cursor) free.push({ from: cursor, to: Math.min(gap.from, bandTo) });
    cursor = Math.max(cursor, gap.to);
  }
  if (cursor < bandTo) free.push({ from: cursor, to: bandTo });
  return free.sort((a, b) => b.to - b.from - (a.to - a.from));
}

/**
 * Places the pit box on a straight in the middle of the stage. The box sits on the right-hand
 * side of the direction of travel so the co-driver's door (passenger, -x) faces the pump.
 * @param samples - Road samples.
 * @param corners - Stage corners.
 * @param startS - Start line arc length.
 * @param finishS - Finish line arc length.
 * @returns The pit, or null when no straight is long enough.
 */
export function placePit(
  samples: ReadonlyArray<RoadSample>,
  corners: ReadonlyArray<CornerInfo>,
  startS: number,
  finishS: number,
): PitInfo | null {
  const span = finishS - startS;
  const bandFrom = startS + span * PIT.BAND_START;
  const bandTo = startS + span * PIT.BAND_END;
  const preferred = straightCandidates(corners, bandFrom, bandTo)[0];
  // Generated roads rarely have a 120 m + 2 x 60 m clear straight in the band, so fall back to the
  // longest raw gap between corners, as long as the box keeps a minimum clearance.
  const fallback = straightCandidates(corners, bandFrom, bandTo, 0)[0];
  const full = preferred && preferred.to - preferred.from >= Math.max(PIT.MIN_STRAIGHT_METRES, PIT.BOX_SIZE.z);
  const best = full ? preferred : fallback;
  if (!best) return null;
  if (!full && (best.to - best.from - PIT.BOX_SIZE.z) / 2 < PIT.FALLBACK_CLEARANCE_M) return null;

  const s = (best.from + best.to) / 2;
  const pose = poseAt(samples, s);
  // Left of travel is (cos h, -sin h); the box goes to the right, outside the shoulder.
  const lx = Math.cos(pose.heading);
  const lz = -Math.sin(pose.heading);
  const halfWidth = PIT.BOX_SIZE.x / 2;
  const centreOffset = ROAD_EDGE + PIT.BOX_GAP + halfWidth;
  const pumpOffset = centreOffset + halfWidth + PIT.PUMP_OFFSET;
  return {
    s,
    x: pose.x - lx * centreOffset,
    y: pose.y,
    z: pose.z - lz * centreOffset,
    heading: pose.heading,
    halfLength: PIT.BOX_SIZE.z / 2,
    halfWidth,
    pump: { x: pose.x - lx * pumpOffset, z: pose.z - lz * pumpOffset },
  };
}

/**
 * Whether a world point lies inside the pit box grown by a margin.
 * @param pit - Pit box.
 * @param x - World x.
 * @param z - World z.
 * @param margin - Extra distance around the box (metres).
 * @returns True when inside.
 */
export function isInsidePitBox(pit: PitInfo, x: number, z: number, margin = 0): boolean {
  const dx = x - pit.x;
  const dz = z - pit.z;
  // Box axes: along = (sin h, cos h), across = (cos h, -sin h).
  const along = dx * Math.sin(pit.heading) + dz * Math.cos(pit.heading);
  const across = dx * Math.cos(pit.heading) - dz * Math.sin(pit.heading);
  return Math.abs(along) <= pit.halfLength + margin && Math.abs(across) <= pit.halfWidth + margin;
}

/**
 * Removes props that would sit inside the pit area (box plus the pump side).
 * @param props - Props to filter.
 * @param pit - Pit box, or null for no filtering.
 * @returns Props outside the pit area.
 */
export function clearPitArea(props: PropPlacement[], pit: PitInfo | null): PropPlacement[] {
  if (!pit) return props;
  const margin = PIT.CLEAR_MARGIN + PIT.PUMP_OFFSET + 1;
  return props.filter((prop) => !isInsidePitBox(pit, prop.x, prop.z, margin));
}
