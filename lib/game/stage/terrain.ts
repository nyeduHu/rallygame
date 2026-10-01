// lib/game/stage/terrain.ts
import { ROAD, TERRAIN } from "../constants";
import { lerp, smoothstep } from "../math";
import { fbm2D } from "../noise";
import type { RoadSample, TerrainData } from "./types";

const TERRAIN_NOISE_OPTIONS = {
  wavelength: TERRAIN.BASE_WAVELENGTH,
  octaves: TERRAIN.OCTAVES,
  persistence: TERRAIN.PERSISTENCE,
  lacunarity: TERRAIN.LACUNARITY,
} as const;

/** Anything that answers "nearest road point" (a single road or the whole network). */
export interface RoadLookup {
  nearest(x: number, z: number, maxDistance: number): { y: number; distance: number } | null;
}

/** Distance from centreline where the shoulder ends. */
export const SHOULDER_EDGE = ROAD.WIDTH / 2 + ROAD.SHOULDER_WIDTH;
/** Distance from centreline where the terrain stops being pinned to road height. */
const FLAT_ZONE = SHOULDER_EDGE + TERRAIN.FLAT_EXTRA;
/** Furthest distance at which the road influences terrain height. */
export const ROAD_INFLUENCE = FLAT_ZONE + TERRAIN.BLEND_DISTANCE;

/**
 * Untouched landscape height before the road is carved in.
 * @param x - World x.
 * @param z - World z.
 * @param seed - Terrain seed.
 * @returns Height in metres.
 */
export function naturalHeight(x: number, z: number, seed: number): number {
  return TERRAIN.AMPLITUDE * fbm2D(x, z, seed, TERRAIN_NOISE_OPTIONS);
}

/**
 * Gives the road its elevation: follow the landscape, then smooth and grade-limit
 * so climbs and crests stay gentle and drivable.
 * @param samples - Layout samples (y is overwritten).
 * @param seed - Terrain seed.
 */
export function applyRoadElevation(samples: RoadSample[], seed: number): void {
  const raw = samples.map((sample) => naturalHeight(sample.x, sample.z, seed));
  const halfWindow = Math.max(1, Math.round(ROAD.ELEVATION_SMOOTH_WINDOW / ROAD.SAMPLE_SPACING / 2));
  let heights = raw;
  for (let pass = 0; pass < ROAD.ELEVATION_SMOOTH_PASSES; pass++) {
    const source = heights;
    heights = source.map((_, i) => {
      let sum = 0;
      let count = 0;
      for (let k = Math.max(0, i - halfWindow); k <= Math.min(source.length - 1, i + halfWindow); k++) {
        sum += source[k];
        count++;
      }
      return sum / count;
    });
  }

  // Alternating passes converge on a profile that respects the grade both ways.
  for (let pass = 0; pass < ROAD.GRADE_LIMIT_PASSES; pass++) {
    for (let i = 1; i < heights.length; i++) {
      const maxStep = ROAD.MAX_GRADE * (samples[i].s - samples[i - 1].s);
      heights[i] = Math.min(heights[i - 1] + maxStep, Math.max(heights[i - 1] - maxStep, heights[i]));
    }
    for (let i = heights.length - 2; i >= 0; i--) {
      const maxStep = ROAD.MAX_GRADE * (samples[i + 1].s - samples[i].s);
      heights[i] = Math.min(heights[i + 1] + maxStep, Math.max(heights[i + 1] - maxStep, heights[i]));
    }
  }
  samples.forEach((sample, i) => {
    sample.y = heights[i];
  });
}

/**
 * Builds the heightfield. Near the road the terrain is pinned just below road
 * level (hidden by the ribbon and forming a shallow ditch), then blends out to
 * the natural landscape.
 * @param samples - Elevated centreline samples of every road (reference and branches), for the bounds.
 * @param index - Nearest-road lookup over all roads.
 * @param seed - Terrain seed.
 * @returns Terrain data.
 */
export function buildTerrain(samples: ReadonlyArray<RoadSample>, index: RoadLookup, seed: number): TerrainData {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const sample of samples) {
    minX = Math.min(minX, sample.x);
    maxX = Math.max(maxX, sample.x);
    minZ = Math.min(minZ, sample.z);
    maxZ = Math.max(maxZ, sample.z);
  }
  const cellSize = TERRAIN.CELL_SIZE;
  const originX = Math.floor((minX - TERRAIN.MARGIN) / cellSize) * cellSize;
  const originZ = Math.floor((minZ - TERRAIN.MARGIN) / cellSize) * cellSize;
  const cols = Math.ceil((maxX + TERRAIN.MARGIN - originX) / cellSize) + 1;
  const rows = Math.ceil((maxZ + TERRAIN.MARGIN - originZ) / cellSize) + 1;
  const heights = new Float32Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    const z = originZ + row * cellSize;
    for (let col = 0; col < cols; col++) {
      const x = originX + col * cellSize;
      const natural = naturalHeight(x, z, seed);
      const projection = index.nearest(x, z, ROAD_INFLUENCE);
      let height = natural;
      if (projection) {
        const roadBase = projection.y - ROAD.SHOULDER_DROP;
        const blend = smoothstep(FLAT_ZONE, ROAD_INFLUENCE, projection.distance);
        height = lerp(roadBase, natural, blend);
      }
      heights[row * cols + col] = height;
    }
  }
  return { originX, originZ, cellSize, cols, rows, heights };
}

/**
 * Samples terrain height using the exact triangle split the mesh uses, so props
 * sit flush on the rendered surface.
 * @param terrain - Terrain data.
 * @param x - World x.
 * @param z - World z.
 * @returns Height at the point (edge-clamped).
 */
export function terrainHeightAt(terrain: TerrainData, x: number, z: number): number {
  const { originX, originZ, cellSize, cols, rows, heights } = terrain;
  const gx = Math.min(cols - 1.0001, Math.max(0, (x - originX) / cellSize));
  const gz = Math.min(rows - 1.0001, Math.max(0, (z - originZ) / cellSize));
  const col = Math.floor(gx);
  const row = Math.floor(gz);
  const fx = gx - col;
  const fz = gz - row;
  const a = heights[row * cols + col];
  const b = heights[row * cols + col + 1];
  const c = heights[(row + 1) * cols + col];
  const d = heights[(row + 1) * cols + col + 1];
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}
