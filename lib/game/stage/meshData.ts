// lib/game/stage/meshData.ts
import { paletteLinear, mixRgb } from "../color";
import { ROAD, TERRAIN } from "../constants";
import { smoothstep } from "../math";
import { valueNoise2D } from "../noise";
import { deriveSeed } from "../random";
import { leftVector } from "./roadIndex";
import { SHOULDER_EDGE } from "./terrain";
import type { RoadSample, StageData, TerrainData } from "./types";

/**
 * Engine-agnostic triangle mesh. The same arrays feed the three.js geometry and
 * the Rapier trimesh collider, so what you see is exactly what you drive on.
 */
export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
  colors: Float32Array;
}

const COLOR_SALT = 7;
const ROAD_COLOR_VARIATION = 0.35;
/** Noise frequency along and across the road, in sample/column units, for patchy gravel. */
const ROAD_COLOR_FREQ_ALONG = 0.7;
const ROAD_COLOR_FREQ_ACROSS = 1.3;
const COMPONENTS = 3;

/** Cross-section columns: [lateral offset, height offset, isShoulder]. */
const ROAD_PROFILE: ReadonlyArray<readonly [number, number, boolean]> = [
  [SHOULDER_EDGE, -ROAD.SHOULDER_DROP, true],
  [ROAD.WIDTH / 2, 0, false],
  [-ROAD.WIDTH / 2, 0, false],
  [-SHOULDER_EDGE, -ROAD.SHOULDER_DROP, true],
];

/**
 * Builds the road ribbon: driving surface plus sloped gravel shoulders that meet
 * the ditch in the terrain.
 * @param samples - Elevated centreline samples.
 * @param seed - Stage seed (colour variation).
 * @returns Mesh arrays.
 */
export function buildRoadMesh(samples: ReadonlyArray<RoadSample>, seed: number): MeshData {
  const columns = ROAD_PROFILE.length;
  const positions = new Float32Array(samples.length * columns * COMPONENTS);
  const colors = new Float32Array(samples.length * columns * COMPONENTS);
  const gravel = paletteLinear("gravel");
  const gravelDark = paletteLinear("gravelDark");
  const shoulder = paletteLinear("shoulder");
  const colorSeed = deriveSeed(seed, COLOR_SALT);

  samples.forEach((sample, row) => {
    const [lx, lz] = leftVector(sample.heading);
    ROAD_PROFILE.forEach(([lateral, dy, isShoulder], col) => {
      const v = (row * columns + col) * COMPONENTS;
      positions[v] = sample.x + lx * lateral;
      positions[v + 1] = sample.y + dy;
      positions[v + 2] = sample.z + lz * lateral;
      const variation = (valueNoise2D(row * ROAD_COLOR_FREQ_ALONG, col * ROAD_COLOR_FREQ_ACROSS, colorSeed) + 1) / 2;
      const color = isShoulder ? shoulder : mixRgb(gravel, gravelDark, variation * ROAD_COLOR_VARIATION);
      colors.set(color, v);
    });
  });

  const quads = (samples.length - 1) * (columns - 1);
  const indices = new Uint32Array(quads * 6);
  let k = 0;
  for (let row = 0; row < samples.length - 1; row++) {
    for (let col = 0; col < columns - 1; col++) {
      const a = row * columns + col;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.set([a, b, c, b, d, c], k);
      k += 6;
    }
  }
  return { positions, indices, colors };
}

/** Side roads sit this far above the main road so overlapping ribbons never z-fight. */
const BRANCH_LIFT = 0.012;

/**
 * Builds one road mesh for the whole network: the reference route plus every branch.
 * @param stage - Stage with elevated samples and branches.
 * @returns Merged mesh arrays (also used for the physics collider).
 */
export function buildNetworkRoadMesh(stage: Pick<StageData, "samples" | "branches" | "seed">): MeshData {
  const parts = [
    buildRoadMesh(stage.samples, stage.seed),
    ...stage.branches.map((branch) => {
      const part = buildRoadMesh(branch.samples, stage.seed + branch.id);
      for (let i = 1; i < part.positions.length; i += COMPONENTS) part.positions[i] += BRANCH_LIFT;
      return part;
    }),
  ];
  if (parts.length === 1) return parts[0];
  const positions = new Float32Array(parts.reduce((sum, part) => sum + part.positions.length, 0));
  const colors = new Float32Array(positions.length);
  const indices = new Uint32Array(parts.reduce((sum, part) => sum + part.indices.length, 0));
  let positionOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    positions.set(part.positions, positionOffset);
    colors.set(part.colors, positionOffset);
    const vertexBase = positionOffset / COMPONENTS;
    for (let i = 0; i < part.indices.length; i++) indices[indexOffset + i] = part.indices[i] + vertexBase;
    positionOffset += part.positions.length;
    indexOffset += part.indices.length;
  }
  return { positions, indices, colors };
}

/**
 * Builds the terrain mesh with grass colour variation and dirt on steep slopes.
 * @param terrain - Heightfield.
 * @param seed - Stage seed (colour variation).
 * @returns Mesh arrays.
 */
export function buildTerrainMesh(terrain: TerrainData, seed: number): MeshData {
  const { originX, originZ, cellSize, cols, rows, heights } = terrain;
  const count = cols * rows;
  const positions = new Float32Array(count * COMPONENTS);
  const colors = new Float32Array(count * COMPONENTS);
  const grass = paletteLinear("grass");
  const grassDark = paletteLinear("grassDark");
  const dirt = paletteLinear("dirt");
  const colorSeed = deriveSeed(seed, COLOR_SALT);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const x = originX + col * cellSize;
      const z = originZ + row * cellSize;
      const h = heights[i];
      positions.set([x, h, z], i * COMPONENTS);

      const hx = heights[row * cols + Math.min(cols - 1, col + 1)] - heights[row * cols + Math.max(0, col - 1)];
      const hz = heights[Math.min(rows - 1, row + 1) * cols + col] - heights[Math.max(0, row - 1) * cols + col];
      const slope = Math.hypot(hx, hz) / (2 * cellSize);
      const variation =
        (valueNoise2D(x / TERRAIN.COLOR_NOISE_WAVELENGTH, z / TERRAIN.COLOR_NOISE_WAVELENGTH, colorSeed) + 1) / 2;
      const base = mixRgb(grass, grassDark, variation * TERRAIN.COLOR_NOISE_STRENGTH);
      const color = mixRgb(base, dirt, smoothstep(TERRAIN.STEEP_SLOPE_START, TERRAIN.STEEP_SLOPE_FULL, slope));
      colors.set(color, i * COMPONENTS);
    }
  }

  const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let k = 0;
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // Diagonal b-c matches terrainHeightAt so props sit exactly on the surface.
      indices.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  return { positions, indices, colors };
}
