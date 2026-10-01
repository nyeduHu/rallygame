// lib/game/stage/props.ts
import { BARRIER_MODEL_PATHS, ROCK_MODEL_PATHS, TREE_MODEL_PATHS } from "../assets";
import { GATES, PROPS, ROAD } from "../constants";
import type { Rng } from "../random";
import { leftVector, poseAt, type RoadIndex } from "./roadIndex";
import { SHOULDER_EDGE, terrainHeightAt } from "./terrain";
import type { CornerInfo, PropPlacement, RoadSample, TerrainData } from "./types";

/** Shared inputs for every scatter pass. */
export interface ScatterContext {
  rng: Rng;
  samples: ReadonlyArray<RoadSample>;
  index: RoadIndex;
  terrain: TerrainData;
  /** World-space XZ of every gate, kept clear of clutter. */
  gatePoints: ReadonlyArray<[number, number]>;
}

/** Barrier models/colliders are long along local X; this turns X onto the road tangent. */
export const BARRIER_YAW_OFFSET = Math.PI / 2;

/** Trees sink slightly so their trunks never float on sloped ground. */
const TREE_SINK = 0.25;
const ROCK_SINK = 0.15;

/**
 * @param context - Scatter context.
 * @param x - World x.
 * @param z - World z.
 * @param radius - Clear radius.
 * @returns True when the point is near a gate.
 */
function nearGate(context: ScatterContext, x: number, z: number, radius: number): boolean {
  return context.gatePoints.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < radius);
}

/**
 * Scatters trees on a jittered grid, keeping a clear corridor along the road.
 * @param context - Scatter context.
 * @returns Tree placements.
 */
export function scatterTrees(context: ScatterContext): PropPlacement[] {
  const { rng, terrain, index } = context;
  const trees: PropPlacement[] = [];
  const minDistance = SHOULDER_EDGE + PROPS.TREE_CLEARANCE;
  const width = (terrain.cols - 1) * terrain.cellSize;
  const depth = (terrain.rows - 1) * terrain.cellSize;
  const gridCols = Math.floor(width / PROPS.TREE_GRID);
  const gridRows = Math.floor(depth / PROPS.TREE_GRID);
  const halfJitter = (PROPS.TREE_GRID * PROPS.TREE_JITTER) / 2;

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      // Always draw the same number of values per cell so one rejected cell never shifts the rest.
      const fill = rng.chance(PROPS.TREE_FILL_CHANCE);
      const jx = rng.range(-halfJitter, halfJitter);
      const jz = rng.range(-halfJitter, halfJitter);
      const variant = rng.int(0, TREE_MODEL_PATHS.length - 1);
      const height = rng.range(PROPS.TREE_HEIGHT_MIN, PROPS.TREE_HEIGHT_MAX);
      const yaw = rng.range(0, Math.PI * 2);
      if (!fill) continue;

      const x = terrain.originX + (col + 0.5) * PROPS.TREE_GRID + jx;
      const z = terrain.originZ + (row + 0.5) * PROPS.TREE_GRID + jz;
      const projection = index.nearest(x, z, PROPS.TREE_MAX_DISTANCE);
      if (!projection || projection.distance < minDistance) continue;
      if (nearGate(context, x, z, PROPS.GATE_CLEAR_RADIUS)) continue;

      trees.push({
        x,
        y: terrainHeightAt(terrain, x, z) - TREE_SINK,
        z,
        yaw,
        scale: height,
        variant,
        hasCollider: projection.distance < PROPS.TREE_COLLIDER_DISTANCE,
      });
    }
  }
  return trees;
}

/**
 * Scatters props along both road sides (rocks with colliders, grass without).
 * @param context - Scatter context.
 * @param options - Density, offset and size ranges.
 * @returns Placements.
 */
function scatterRoadside(
  context: ScatterContext,
  options: {
    chance: number;
    offsetMin: number;
    offsetMax: number;
    sizeMin: number;
    sizeMax: number;
    variants: number;
    sink: number;
    hasCollider: boolean;
    clearRadius: number;
  },
): PropPlacement[] {
  const { rng, samples, terrain } = context;
  const placements: PropPlacement[] = [];
  for (const sample of samples) {
    const place = rng.chance(options.chance);
    const side = rng.sign();
    const offset = SHOULDER_EDGE + rng.range(options.offsetMin, options.offsetMax);
    const along = rng.range(-ROAD.SAMPLE_SPACING / 2, ROAD.SAMPLE_SPACING / 2);
    const size = rng.range(options.sizeMin, options.sizeMax);
    const variant = rng.int(0, options.variants - 1);
    const yaw = rng.range(0, Math.PI * 2);
    if (!place) continue;

    const [lx, lz] = leftVector(sample.heading);
    const x = sample.x + lx * offset * side + Math.sin(sample.heading) * along;
    const z = sample.z + lz * offset * side + Math.cos(sample.heading) * along;
    // Reject spots that land too close to a different leg of the road (hairpins).
    const projection = context.index.nearest(x, z, offset);
    if (projection && projection.distance < SHOULDER_EDGE + options.offsetMin) continue;
    if (nearGate(context, x, z, options.clearRadius)) continue;

    placements.push({
      x,
      y: terrainHeightAt(terrain, x, z) - options.sink,
      z,
      yaw,
      scale: size,
      variant,
      hasCollider: options.hasCollider,
    });
  }
  return placements;
}

/**
 * @param context - Scatter context.
 * @returns Rock placements.
 */
export function scatterRocks(context: ScatterContext): PropPlacement[] {
  return scatterRoadside(context, {
    chance: PROPS.ROCK_CHANCE_PER_SAMPLE,
    offsetMin: PROPS.ROCK_OFFSET_MIN,
    offsetMax: PROPS.ROCK_OFFSET_MAX,
    sizeMin: PROPS.ROCK_SIZE_MIN,
    sizeMax: PROPS.ROCK_SIZE_MAX,
    variants: ROCK_MODEL_PATHS.length,
    sink: ROCK_SINK,
    hasCollider: true,
    clearRadius: PROPS.GATE_CLEAR_RADIUS,
  });
}

/**
 * @param context - Scatter context.
 * @returns Grass tuft placements.
 */
export function scatterGrass(context: ScatterContext): PropPlacement[] {
  return scatterRoadside(context, {
    chance: PROPS.GRASS_CHANCE_PER_SAMPLE,
    offsetMin: PROPS.GRASS_OFFSET_MIN,
    offsetMax: PROPS.GRASS_OFFSET_MAX,
    sizeMin: PROPS.GRASS_SIZE_MIN,
    sizeMax: PROPS.GRASS_SIZE_MAX,
    variants: 1,
    sink: 0,
    hasCollider: false,
    clearRadius: 0,
  });
}

/**
 * Lines the outside of tight corners with barriers, alternating red and white.
 * @param context - Scatter context.
 * @param corners - Generated corners.
 * @returns Barrier placements (scale 1; dimensions come from constants).
 */
export function placeBarriers(context: ScatterContext, corners: ReadonlyArray<CornerInfo>): PropPlacement[] {
  const barriers: PropPlacement[] = [];
  const offset = SHOULDER_EDGE + PROPS.BARRIER_OUTSIDE_OFFSET;
  const lead = PROPS.BARRIER_LENGTH * 2;
  for (const corner of corners) {
    if (corner.radius >= PROPS.BARRIER_RADIUS_THRESHOLD) continue;
    const outside = -corner.direction;
    // The outside line is longer than the centreline; shrink the s-step so barriers touch.
    const step = (PROPS.BARRIER_LENGTH * corner.radius) / (corner.radius + offset);
    let count = 0;
    for (let s = corner.startS - lead; s <= corner.endS + lead; s += step) {
      const pose = poseAt(context.samples, s);
      const [lx, lz] = leftVector(pose.heading);
      const x = pose.x + lx * offset * outside;
      const z = pose.z + lz * offset * outside;
      const projection = context.index.nearest(x, z, offset);
      if (projection && projection.distance < offset - ROAD.SAMPLE_SPACING) continue;
      barriers.push({
        x,
        y: terrainHeightAt(context.terrain, x, z),
        z,
        yaw: pose.heading,
        scale: 1,
        variant: count % BARRIER_MODEL_PATHS.length,
        hasCollider: true,
      });
      count++;
    }
  }
  return barriers;
}

/**
 * Places knock-over cones on the inside of hairpin apexes.
 * @param context - Scatter context.
 * @param corners - Generated corners.
 * @returns Cone placements.
 */
export function placeCones(context: ScatterContext, corners: ReadonlyArray<CornerInfo>): PropPlacement[] {
  const cones: PropPlacement[] = [];
  const offset = ROAD.WIDTH / 2 + ROAD.SHOULDER_WIDTH / 2;
  for (const corner of corners) {
    if (corner.classId !== "hairpin") continue;
    for (let k = 0; k < PROPS.CONES_PER_HAIRPIN; k++) {
      const s = corner.apexS + (k - (PROPS.CONES_PER_HAIRPIN - 1) / 2) * PROPS.CONE_SPACING;
      const pose = poseAt(context.samples, s);
      const [lx, lz] = leftVector(pose.heading);
      const x = pose.x + lx * offset * corner.direction;
      const z = pose.z + lz * offset * corner.direction;
      cones.push({ x, y: pose.y, z, yaw: pose.heading, scale: 1, variant: 0, hasCollider: true });
    }
  }
  return cones;
}

/**
 * Lateral offset of gate-side props, exported so render and physics agree.
 * @returns Half width of a gate gantry.
 */
export function gateHalfWidth(): number {
  return SHOULDER_EDGE + GATES.SIDE_MARGIN;
}

/**
 * Removes props within a radius of given arc positions on the road (start and finish areas).
 * @param props - Props to filter.
 * @param samples - Road samples (for positions).
 * @param arcs - Arc lengths to keep clear.
 * @param radius - Clear radius in metres.
 * @returns Props outside every clear zone.
 */
export function clearAroundArcs(props: PropPlacement[], samples: ReadonlyArray<{ x: number; z: number; s: number }>, arcs: ReadonlyArray<number>, radius: number): PropPlacement[] {
  const centres = arcs.map((arc) => samples.reduce((best, sample) => (Math.abs(sample.s - arc) < Math.abs(best.s - arc) ? sample : best), samples[0]));
  const radiusSq = radius * radius;
  return props.filter((prop) => centres.every((c) => (prop.x - c.x) ** 2 + (prop.z - c.z) ** 2 > radiusSq));
}
