// lib/game/stage/network.ts
import { CORNER_CLASSES, NETWORK, ROAD } from "../constants";
import type { Rng } from "../random";
import { RoadIndex, poseAt } from "./roadIndex";
import { generateSpurLayout, type RoadLayout } from "./roadLayout";
import type { CornerClassId, CornerInfo, RoadBranch, RoadSample } from "./types";

/** Interval of the reference route occupied by a fork (gates and the pit stay out of it). */
export interface ForkZone {
  from: number;
  to: number;
}

/** Side roads plus the reference intervals they occupy. */
export interface NetworkResult {
  branches: RoadBranch[];
  zones: ForkZone[];
}

/** Counts why branch candidates were rejected (read by `scripts/stageStats.ts`). */
export const networkStats = { notAllowed: 0, zoneBusy: 0, tooSharp: 0, badLength: 0, tooClose: 0, accepted: 0 };

const SAMPLES_PER_BEZIER = 400;
const SPOT_STEP_M = 5;
const MAX_TRIES = 40;
const TWO_PI = Math.PI * 2;

/**
 * Resamples a polyline to an even spacing and computes unwrapped headings.
 * @param points - Dense polyline in the x/z plane.
 * @param startHeading - Heading of the first sample (headings are unwrapped from it).
 * @returns Samples with local arc length.
 */
function resample(points: ReadonlyArray<{ x: number; z: number }>, startHeading: number): RoadSample[] {
  const samples: RoadSample[] = [{ x: points[0].x, y: 0, z: points[0].z, s: 0, heading: startHeading }];
  let carried = 0;
  let heading = startHeading;
  let last = points[0];
  for (let i = 1; i < points.length; i++) {
    const next = points[i];
    let dx = next.x - last.x;
    let dz = next.z - last.z;
    let segment = Math.hypot(dx, dz);
    while (carried + segment >= ROAD.SAMPLE_SPACING && segment > 0) {
      const take = ROAD.SAMPLE_SPACING - carried;
      const t = take / segment;
      const px = last.x + dx * t;
      const pz = last.z + dz * t;
      let h = Math.atan2(px - samples[samples.length - 1].x, pz - samples[samples.length - 1].z);
      while (h - heading > Math.PI) h -= TWO_PI;
      while (h - heading < -Math.PI) h += TWO_PI;
      heading = h;
      samples.push({ x: px, y: 0, z: pz, s: samples[samples.length - 1].s + ROAD.SAMPLE_SPACING, heading });
      last = { x: px, z: pz };
      dx = next.x - last.x;
      dz = next.z - last.z;
      segment = Math.hypot(dx, dz);
      carried = 0;
    }
    carried += segment;
    last = next;
  }
  return samples;
}

/**
 * Largest curvature (1/m) along a sampled road.
 * @param samples - Samples with headings.
 * @returns Maximum |dheading/ds|.
 */
function maxCurvature(samples: ReadonlyArray<RoadSample>): number {
  let max = 0;
  for (let i = 1; i < samples.length; i++) {
    max = Math.max(max, Math.abs(samples[i].heading - samples[i - 1].heading) / (samples[i].s - samples[i - 1].s));
  }
  return max;
}

/**
 * Chooses the corner class for a radius (nearest class range).
 * @param radius - Corner radius.
 * @returns Class id.
 */
function classFor(radius: number): CornerClassId {
  let best: CornerClassId = CORNER_CLASSES[CORNER_CLASSES.length - 1].id;
  let bestGap = Infinity;
  for (const cornerClass of CORNER_CLASSES) {
    const gap = radius < cornerClass.radiusMin ? cornerClass.radiusMin - radius : radius > cornerClass.radiusMax ? radius - cornerClass.radiusMax : 0;
    if (gap < bestGap) {
      bestGap = gap;
      best = cornerClass.id;
    }
  }
  return best;
}

/**
 * Finds corners on a free-form road from where its curvature exceeds a threshold.
 * @param samples - Branch samples.
 * @returns Corner descriptions in order.
 */
export function extractCorners(samples: ReadonlyArray<RoadSample>): CornerInfo[] {
  const corners: CornerInfo[] = [];
  let start = -1;
  let quiet = 0;
  /** Closes the current run into a corner. */
  const close = (endIndex: number): void => {
    if (start < 0) return;
    const turn = samples[endIndex].heading - samples[start].heading;
    const length = samples[endIndex].s - samples[start].s;
    if (Math.abs(turn) > 0.15 && length > 0) {
      const radius = length / Math.abs(turn);
      corners.push({
        startS: samples[start].s,
        endS: samples[endIndex].s,
        apexS: (samples[start].s + samples[endIndex].s) / 2,
        radius,
        angle: Math.abs(turn),
        direction: turn > 0 ? 1 : -1,
        classId: classFor(radius),
      });
    }
    start = -1;
  };
  for (let i = 1; i < samples.length; i++) {
    const curvature = Math.abs(samples[i].heading - samples[i - 1].heading) / (samples[i].s - samples[i - 1].s);
    if (curvature >= NETWORK.CORNER_CURVATURE) {
      if (start < 0) start = i - 1;
      quiet = 0;
    } else if (start >= 0 && ++quiet >= NETWORK.CORNER_MERGE_SAMPLES) {
      close(i - quiet);
    }
  }
  close(samples.length - 1);
  return corners;
}

/**
 * Whether a branch keeps its distance from the reference route, earlier branches and itself,
 * except close to its own ends where it meets the main road.
 * @param branch - Candidate branch.
 * @param others - Spatial indexes of everything it must keep away from.
 * @returns True when the geometry is fair.
 */
function keepsDistance(branch: RoadBranch, others: ReadonlyArray<RoadIndex>): boolean {
  for (const sample of branch.samples) {
    const nearEnd = sample.s < NETWORK.JUNCTION_ZONE_M || (branch.kind === "alternative" && sample.s > branch.length - NETWORK.JUNCTION_ZONE_M);
    if (nearEnd) continue;
    for (const index of others) {
      if (index.nearest(sample.x, sample.z, ROAD.MIN_SEPARATION)) return false;
    }
  }
  const minSq = ROAD.MIN_SEPARATION * ROAD.MIN_SEPARATION;
  for (let i = 0; i < branch.samples.length; i++) {
    for (let j = i + 1; j < branch.samples.length; j++) {
      if (branch.samples[j].s - branch.samples[i].s < ROAD.SEPARATION_ARC_EXEMPT) continue;
      const dx = branch.samples[i].x - branch.samples[j].x;
      const dz = branch.samples[i].z - branch.samples[j].z;
      if (dx * dx + dz * dz < minSq) return false;
    }
  }
  return true;
}

/**
 * Builds an alternative route from the fork to the join as a smooth curve that bulges away from
 * the main road.
 * @param rng - Generator.
 * @param reference - Reference samples.
 * @param forkS - Fork arc length.
 * @param joinS - Join arc length.
 * @returns Branch samples, or null when the curve is too sharp.
 */
function buildAlternative(rng: Rng, reference: ReadonlyArray<RoadSample>, forkS: number, joinS: number): RoadSample[] | null {
  const a = poseAt(reference, forkS);
  const b = poseAt(reference, joinS);
  const side = rng.sign();
  const angleOut = rng.range(NETWORK.FORK_ANGLE_MIN, NETWORK.FORK_ANGLE_MAX);
  const angleIn = rng.range(NETWORK.FORK_ANGLE_MIN, NETWORK.FORK_ANGLE_MAX);
  const startHeading = a.heading + side * angleOut;
  const endHeading = b.heading - side * angleIn;
  const chord = Math.hypot(b.x - a.x, b.z - a.z);
  const k1 = chord * rng.range(NETWORK.HANDLE_MIN, NETWORK.HANDLE_MAX);
  const k2 = chord * rng.range(NETWORK.HANDLE_MIN, NETWORK.HANDLE_MAX);
  const p1 = { x: a.x + Math.sin(startHeading) * k1, z: a.z + Math.cos(startHeading) * k1 };
  const p2 = { x: b.x - Math.sin(endHeading) * k2, z: b.z - Math.cos(endHeading) * k2 };
  const points = Array.from({ length: SAMPLES_PER_BEZIER + 1 }, (_, i) => {
    const t = i / SAMPLES_PER_BEZIER;
    const u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
      z: u * u * u * a.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * b.z,
    };
  });
  const samples = resample(points, startHeading);
  return maxCurvature(samples) <= 1 / NETWORK.BRANCH_MIN_RADIUS ? samples : null;
}

/**
 * Generates the side roads for a stage: alternative routes and dead ends, laid out so they keep
 * clear of the main road, each other, the gates and the start/finish.
 * @param rng - Seeded generator for this attempt.
 * @param layout - Validated reference layout.
 * @param startS - Start line arc length.
 * @param finishS - Finish line arc length.
 * @param checkpointS - Checkpoint arc lengths.
 * @returns The network, or null when the required forks could not be placed.
 */
export function generateBranches(
  rng: Rng,
  layout: RoadLayout,
  startS: number,
  finishS: number,
  checkpointS: ReadonlyArray<number>,
): NetworkResult | null {
  const reference = layout.samples;
  const referenceIndex = new RoadIndex(reference);
  const branches: RoadBranch[] = [];
  const zones: ForkZone[] = [];
  const indexes: RoadIndex[] = [referenceIndex];

  /** Whether a reference arc length may host a fork or join (straight, away from gates). */
  const allowed = (s: number): boolean => {
    if (s < startS + NETWORK.FORK_EDGE_CLEARANCE_M || s > finishS - NETWORK.FORK_EDGE_CLEARANCE_M) return false;
    if (checkpointS.some((c) => Math.abs(c - s) < NETWORK.FORK_GATE_CLEARANCE_M)) return false;
    return !layout.corners.some((c) => s > c.startS - NETWORK.FORK_CORNER_CLEARANCE_M && s < c.endS + NETWORK.FORK_CORNER_CLEARANCE_M);
  };
  /** Whether a candidate zone is clear of existing zones and gates. */
  const zoneFree = (from: number, to: number): boolean =>
    zones.every((z) => to + NETWORK.FORK_SPACING_M < z.from || from - NETWORK.FORK_SPACING_M > z.to) &&
    !checkpointS.some((c) => c > from - NETWORK.FORK_GATE_CLEARANCE_M && c < to + NETWORK.FORK_GATE_CLEARANCE_M);

  /** Registers an accepted branch. */
  const accept = (kind: RoadBranch["kind"], forkS: number, joinS: number | null, samples: RoadSample[], corners: CornerInfo[], zone: ForkZone): void => {
    const branch: RoadBranch = { id: branches.length + 1, kind, forkS, joinS, samples, corners, length: samples[samples.length - 1].s };
    branches.push(branch);
    zones.push(zone);
    indexes.push(new RoadIndex(samples));
  };

  // Every 5 m point of the reference where a fork or join may sit; picking from this list (rather
  // than rejecting random arc lengths) keeps placement fast on corner-dense roads.
  const spots: number[] = [];
  for (let s = startS; s <= finishS; s += SPOT_STEP_M) if (allowed(s)) spots.push(s);
  /** Picks and removes a random element from a list, or returns null when it is empty. */
  const take = <T>(list: T[]): T | null => (list.length === 0 ? null : list.splice(rng.int(0, list.length - 1), 1)[0]);

  const wantedAlternatives = NETWORK.ALTERNATIVE_COUNT;
  for (let n = 0; n < wantedAlternatives; n++) {
    // Every (fork, join) pair whose zone is currently free, tried in random order.
    const pairs: Array<[number, number]> = [];
    for (const forkS of spots) {
      for (const joinS of spots) {
        if (joinS < forkS + NETWORK.ALT_SPAN_MIN) continue;
        if (joinS > forkS + NETWORK.ALT_SPAN_MAX) break;
        if (zoneFree(forkS - NETWORK.FORK_ZONE_PAD_M, joinS + NETWORK.FORK_ZONE_PAD_M)) pairs.push([forkS, joinS]);
      }
    }
    let placed = false;
    for (let attempt = 0; attempt < MAX_TRIES && !placed; attempt++) {
      const pair = take(pairs);
      if (!pair) {
        networkStats.zoneBusy++;
        break;
      }
      const [forkS, joinS] = pair;
      const samples = buildAlternative(rng, reference, forkS, joinS);
      if (!samples) {
        networkStats.tooSharp++;
        continue;
      }
      const stretch = joinS - forkS;
      const length = samples[samples.length - 1].s;
      if (length < stretch * 0.6 || length > stretch * 2.2) {
        networkStats.badLength++;
        continue;
      }
      const branch: RoadBranch = { id: 0, kind: "alternative", forkS, joinS, samples, corners: extractCorners(samples), length };
      if (!keepsDistance(branch, indexes)) {
        networkStats.tooClose++;
        continue;
      }
      networkStats.accepted++;
      accept("alternative", forkS, joinS, samples, branch.corners, { from: forkS - NETWORK.FORK_ZONE_PAD_M, to: joinS + NETWORK.FORK_ZONE_PAD_M });
      placed = true;
    }
    // A second alternative is a bonus; the first is required.
    if (!placed && n === 0) return null;
    if (!placed) break;
  }

  // Dead ends fill the remaining forks (also standing in for an alternative that did not fit).
  const wantedDeadEnds = NETWORK.FORK_COUNT - branches.length;
  for (let n = 0; n < wantedDeadEnds; n++) {
    const free = spots.filter((spot) => zoneFree(spot - NETWORK.FORK_ZONE_PAD_M, spot + NETWORK.FORK_ZONE_PAD_M));
    let placed = false;
    for (let attempt = 0; attempt < MAX_TRIES && !placed; attempt++) {
      const forkS = take(free);
      if (forkS === null) break;
      const pose = poseAt(reference, forkS);
      const heading = pose.heading + rng.sign() * rng.range(NETWORK.FORK_ANGLE_MIN, NETWORK.FORK_ANGLE_MAX);
      const spur = generateSpurLayout(rng, { x: pose.x, z: pose.z, heading }, rng.range(NETWORK.DEAD_END_MIN, NETWORK.DEAD_END_MAX));
      const length = spur.samples[spur.samples.length - 1].s;
      const branch: RoadBranch = { id: 0, kind: "dead_end", forkS, joinS: null, samples: spur.samples, corners: spur.corners, length };
      if (!keepsDistance(branch, indexes)) {
        networkStats.tooClose++;
        continue;
      }
      accept("dead_end", forkS, null, spur.samples, spur.corners, { from: forkS - NETWORK.FORK_ZONE_PAD_M, to: forkS + NETWORK.FORK_ZONE_PAD_M });
      placed = true;
    }
    // At least one dead end is required; more are a bonus.
    if (!placed && n === 0) return null;
    if (!placed) break;
  }
  return { branches, zones };
}

/**
 * Shifts a branch's elevation so it meets the reference route at its fork (and join), blending
 * the correction along the branch so there is no step at the junction.
 * @param branch - Branch whose samples were elevated independently.
 * @param reference - Elevated reference samples.
 */
export function pinBranchElevation(branch: RoadBranch, reference: ReadonlyArray<RoadSample>): void {
  const first = branch.samples[0];
  const last = branch.samples[branch.samples.length - 1];
  const startShift = poseAt(reference, branch.forkS).y - first.y;
  const endShift = branch.joinS === null ? startShift : poseAt(reference, branch.joinS).y - last.y;
  for (const sample of branch.samples) {
    const t = branch.length > 0 ? sample.s / branch.length : 0;
    // Dead ends keep the fork height; alternatives blend between the two junction heights.
    sample.y += branch.joinS === null ? startShift : startShift * (1 - t) + endShift * t;
  }
}
