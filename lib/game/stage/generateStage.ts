// lib/game/stage/generateStage.ts
import { ROAD, VEHICLE } from "../constants";
import { createRng, deriveSeed } from "../random";
import { gateHalfWidth, placeBarriers, placeCones, scatterGrass, scatterRocks, scatterTrees, type ScatterContext } from "./props";
import { RoadIndex, poseAt } from "./roadIndex";
import { generateRoadLayout, validateRoadLayout, type RoadLayout } from "./roadLayout";
import { applyRoadElevation, buildTerrain } from "./terrain";
import type { StageData } from "./types";

/** Salts separating the random streams of each pipeline pass. */
const SALT = {
  LAYOUT: 1,
  TERRAIN: 2,
  TREES: 3,
  ROCKS: 4,
  GRASS: 5,
  STRUCTURES: 6,
} as const;

/**
 * Finds the first layout attempt that validates. Attempts are derived from the
 * seed, so every client converges on the same attempt.
 * @param seed - Stage seed.
 * @returns Layout and the attempt number used.
 */
function findValidLayout(seed: number): { layout: RoadLayout; attempt: number } {
  for (let attempt = 0; attempt < ROAD.MAX_GENERATION_ATTEMPTS; attempt++) {
    const rng = createRng(deriveSeed(deriveSeed(seed, SALT.LAYOUT), attempt));
    const layout = generateRoadLayout(rng);
    if (validateRoadLayout(layout)) return { layout, attempt };
  }
  throw new Error(`Road generation failed validation for seed ${seed} after ${ROAD.MAX_GENERATION_ATTEMPTS} attempts`);
}

/**
 * Full generation pipeline from spec section 25:
 * seed -> road path -> validate -> terrain -> props -> checkpoints.
 * @param seed - Stage seed.
 * @returns Complete stage description.
 */
export function generateStage(seed: number): StageData {
  const { layout, attempt } = findValidLayout(seed);
  const samples = layout.samples;
  const terrainSeed = deriveSeed(seed, SALT.TERRAIN);
  applyRoadElevation(samples, terrainSeed);

  const index = new RoadIndex(samples);
  const terrain = buildTerrain(samples, index, terrainSeed);
  const length = samples[samples.length - 1].s;

  const startS = ROAD.START_LINE_OFFSET;
  const finishS = length - ROAD.FINISH_LINE_OFFSET;
  const checkpointS = Array.from(
    { length: ROAD.CHECKPOINT_COUNT },
    (_, k) => startS + ((finishS - startS) * (k + 1)) / (ROAD.CHECKPOINT_COUNT + 1),
  );
  const gatePoints: Array<[number, number]> = [startS, ...checkpointS, finishS].flatMap((s) => {
    const pose = poseAt(samples, s);
    const half = gateHalfWidth();
    const lx = Math.cos(pose.heading);
    const lz = -Math.sin(pose.heading);
    return [
      [pose.x + lx * half, pose.z + lz * half],
      [pose.x - lx * half, pose.z - lz * half],
    ] as Array<[number, number]>;
  });

  /**
   * @param salt - Pass salt.
   * @returns Scatter context with its own random stream.
   */
  const contextFor = (salt: number): ScatterContext => ({
    rng: createRng(deriveSeed(seed, salt)),
    samples,
    index,
    terrain,
    gatePoints,
  });

  const spawnPose = poseAt(samples, startS - VEHICLE.SPAWN_BEHIND_START);

  return {
    seed,
    attempt,
    samples,
    length,
    corners: layout.corners,
    terrain,
    startS,
    finishS,
    checkpointS,
    trees: scatterTrees(contextFor(SALT.TREES)),
    rocks: scatterRocks(contextFor(SALT.ROCKS)),
    grass: scatterGrass(contextFor(SALT.GRASS)),
    barriers: placeBarriers(contextFor(SALT.STRUCTURES), layout.corners),
    cones: placeCones(contextFor(SALT.STRUCTURES), layout.corners),
    spawn: spawnPose,
  };
}
