// lib/game/map/networkMap.ts
import type { RoadSample, StageData } from "../stage/types";
import type { MapPoint, MapViewport } from "./mapRenderer";

/** One drawable road of the network. */
export interface MapPath {
  /** Branch id, or null for the reference route. */
  id: number | null;
  samples: ReadonlyArray<RoadSample>;
}

/** Which road samples the co-driver has seen so far (fog of war). */
export interface RevealState {
  paths: MapPath[];
  revealed: Uint8Array[];
  /** Total revealed samples; changes whenever new road is uncovered. */
  count: number;
}

/**
 * All roads of a stage, reference route first.
 * @param stage - Stage with branches.
 * @returns Drawable paths.
 */
export function pathsOf(stage: Pick<StageData, "samples" | "branches">): MapPath[] {
  return [{ id: null, samples: stage.samples }, ...stage.branches.map((branch) => ({ id: branch.id, samples: branch.samples }))];
}

/**
 * Starts with nothing revealed.
 * @param stage - Stage with branches.
 * @returns Empty reveal state.
 */
export function createReveal(stage: Pick<StageData, "samples" | "branches">): RevealState {
  const paths = pathsOf(stage);
  return { paths, revealed: paths.map((path) => new Uint8Array(path.samples.length)), count: 0 };
}

/**
 * Reveals every road sample within a radius of the car.
 * @param state - Reveal state (mutated).
 * @param x - Car world x.
 * @param z - Car world z.
 * @param radius - View radius in metres.
 * @returns True when something new was revealed.
 */
export function updateReveal(state: RevealState, x: number, z: number, radius: number): boolean {
  const radiusSq = radius * radius;
  let added = 0;
  state.paths.forEach((path, pathIndex) => {
    const flags = state.revealed[pathIndex];
    path.samples.forEach((sample, i) => {
      if (flags[i] === 1) return;
      const dx = sample.x - x;
      const dz = sample.z - z;
      if (dx * dx + dz * dz <= radiusSq) {
        flags[i] = 1;
        added++;
      }
    });
  });
  state.count += added;
  return added > 0;
}

/**
 * Splits a path into runs of revealed samples so unseen road is never drawn.
 * @param path - Road path.
 * @param flags - Revealed flags for the path.
 * @returns Contiguous revealed runs.
 */
export function revealedRuns(path: MapPath, flags: Uint8Array): RoadSample[][] {
  const runs: RoadSample[][] = [];
  let run: RoadSample[] = [];
  path.samples.forEach((sample, i) => {
    if (flags[i] === 1) {
      run.push(sample);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length > 0) runs.push(run);
  return runs;
}

/**
 * Whether the road near an arc length on a path has been seen.
 * @param path - Road path.
 * @param flags - Revealed flags.
 * @param s - Arc length on that path.
 * @returns True when the nearest sample is revealed.
 */
export function isRevealedAt(path: MapPath, flags: Uint8Array, s: number): boolean {
  let best = 0;
  let bestGap = Infinity;
  path.samples.forEach((sample, i) => {
    const gap = Math.abs(sample.s - s);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  return flags[best] === 1;
}

/** Scale and centre mapping world coordinates to a padded top-down map. */
export interface MapFit {
  scale: number;
  centerX: number;
  centerZ: number;
  width: number;
  height: number;
}

/**
 * Fits the whole network into the map viewport.
 * @param paths - All roads.
 * @param viewport - Map pixel size.
 * @param margin - Edge padding.
 * @returns Fit parameters.
 */
export function computeFit(paths: ReadonlyArray<MapPath>, viewport: MapViewport, margin: number): MapFit {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const path of paths) {
    for (const sample of path.samples) {
      minX = Math.min(minX, sample.x);
      maxX = Math.max(maxX, sample.x);
      minZ = Math.min(minZ, sample.z);
      maxZ = Math.max(maxZ, sample.z);
    }
  }
  const worldWidth = Math.max(maxX - minX, 1);
  const worldHeight = Math.max(maxZ - minZ, 1);
  const scale = Math.min((viewport.width - margin * 2) / worldWidth, (viewport.height - margin * 2) / worldHeight);
  return { scale, centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2, width: viewport.width, height: viewport.height };
}

/**
 * Maps a world point through a fit (north up: +z is up the screen).
 * @param fit - Fit parameters.
 * @param x - World x.
 * @param z - World z.
 * @param s - Arc length carried through.
 * @param heading - Heading carried through.
 * @returns Canvas point.
 */
export function fitPoint(fit: MapFit, x: number, z: number, s: number, heading: number): MapPoint {
  return { x: fit.width / 2 + (x - fit.centerX) * fit.scale, y: fit.height / 2 - (z - fit.centerZ) * fit.scale, s, heading };
}

/**
 * Straight-line distance and bearing from the car to the finish.
 * @param car - Car position.
 * @param finish - Finish position.
 * @returns Distance in metres and the finish point pushed far along that direction (for projecting an arrow).
 */
export function finishDirection(car: { x: number; z: number }, finish: { x: number; z: number }): { distance: number; far: { x: number; z: number } } {
  const dx = finish.x - car.x;
  const dz = finish.z - car.z;
  const distance = Math.hypot(dx, dz);
  const unit = distance > 0 ? 1 / distance : 0;
  return { distance, far: { x: car.x + dx * unit * ARROW_REACH_M, z: car.z + dz * unit * ARROW_REACH_M } };
}

const ARROW_REACH_M = 1000;
