// lib/game/stage/generateStage.ts
import { PROPS, ROAD, VEHICLE } from "../constants";
import { createRng, deriveSeed } from "../random";
import { generateRoadNetwork, type RoadNetworkResult } from "./roadNetwork";
import { NetworkIndex } from "./networkIndex";
import { clearAroundArcs, gateHalfWidth, scatterGrass, scatterRocks, scatterTrees, type ScatterContext } from "./props";
import { poseAt } from "./roadIndex";
import { hasEnoughCorners } from "./roadLayout";
import { validateCandidate } from "./validateStage";
import { clearPitArea, placePit } from "./pitStop";
import { buildTerrain } from "./terrain";
import type { PropPlacement, StageData } from "./types";
import { networkHeight } from "./ground";

/** Salts separating the random streams of each pipeline pass. */
const SALT = {
  LAYOUT: 1,
  TERRAIN: 2,
  TREES: 3,
  ROCKS: 4,
  GRASS: 5,
} as const;

/** A network attempt that passed validation. */
export interface ValidNetwork extends RoadNetworkResult {
  attempt: number;
}

/**
 * Finds the first network attempt that validates. Attempts are derived from the seed, so every
 * client converges on the same attempt.
 * @param seed - Stage seed.
 * @param stageIndex - Stage number (0 = tutorial).
 * @returns The network and the attempt number used.
 */
export function findValidNetwork(seed: number, stageIndex: number): ValidNetwork {
  for (let attempt = 0; attempt < ROAD.MAX_GENERATION_ATTEMPTS; attempt++) {
    const maze = generateRoadNetwork(createRng(deriveSeed(deriveSeed(seed, SALT.LAYOUT), attempt)));
    if (!maze || !hasEnoughCorners(maze.layout)) continue;
    const { samples, corners } = maze.layout;
    const candidate = {
      samples,
      corners,
      startS: maze.startS,
      finishS: maze.finishS,
      checkpointS: maze.checkpointS,
      length: samples[samples.length - 1].s,
      branches: maze.branches,
      zones: maze.zones,
    };
    if (validateCandidate(candidate, stageIndex).ok) return { ...maze, attempt };
  }
  throw new Error(`Road network generation failed validation for seed ${seed} after ${ROAD.MAX_GENERATION_ATTEMPTS} attempts`);
}

/**
 * Full generation pipeline: seed -> road network -> shared ground height -> terrain -> props.
 * @param seed - Stage seed.
 * @param stageIndex - Stage number (0 = tutorial).
 * @returns Complete stage description.
 */
export function generateStage(seed: number, stageIndex = 0): StageData {
  const maze = findValidNetwork(seed, stageIndex);
  const { layout, branches, zones, attempt, startS, finishS, checkpointS } = maze;
  const samples = layout.samples;
  const terrainSeed = deriveSeed(seed, SALT.TERRAIN);
  const ground = (x: number, z: number): number => networkHeight(x, z, terrainSeed);
  for (const road of [samples, ...branches.map((branch) => branch.samples)]) {
    for (const sample of road) sample.y = ground(sample.x, sample.z);
  }

  const index = new NetworkIndex(samples, branches);
  const terrain = buildTerrain([...samples, ...branches.flatMap((branch) => branch.samples)], index, terrainSeed, ground);
  const length = samples[samples.length - 1].s;

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

  const pit = placePit(samples, layout.corners, startS, finishS, zones);
  const spawnPose = poseAt(samples, startS - VEHICLE.SPAWN_BEHIND_START);
  /**
   * @param props - Scattered props.
   * @returns Props clear of the pit and the start and finish.
   */
  const tidy = (props: PropPlacement[]): PropPlacement[] =>
    clearAroundArcs(clearPitArea(props, pit), samples, [startS, finishS], PROPS.MIN_CLEAR_RADIUS_START);

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
    trees: tidy(scatterTrees(contextFor(SALT.TREES))),
    rocks: tidy(scatterRocks(contextFor(SALT.ROCKS))),
    grass: tidy(scatterGrass(contextFor(SALT.GRASS))),
    barriers: [],
    cones: [],
    spawn: spawnPose,
    pit,
    branches,
  };
}
