// lib/game/stage/generateStage.ts
import { PROPS, ROAD, VEHICLE } from "../constants";
import { createRng, deriveSeed } from "../random";
import { generateMaze, type MazeResult } from "./maze";
import { NetworkIndex } from "./networkIndex";
import { clearAroundArcs, gateHalfWidth, scatterGrass, scatterRocks, scatterTrees, type ScatterContext } from "./props";
import { poseAt } from "./roadIndex";
import { hasEnoughCorners } from "./roadLayout";
import { validateCandidate } from "./validateStage";
import { clearPitArea, placePit } from "./pitStop";
import { buildTerrain } from "./terrain";
import type { PropPlacement, StageData } from "./types";
import { clearWalls, elevateWalls, mazeHeight } from "./walls";

/** Salts separating the random streams of each pipeline pass. */
const SALT = {
  LAYOUT: 1,
  TERRAIN: 2,
  TREES: 3,
  ROCKS: 4,
  GRASS: 5,
} as const;

/** A maze attempt that passed validation. */
export interface ValidMaze extends MazeResult {
  attempt: number;
  checkpointS: number[];
}

/**
 * Finds the first maze attempt that validates. Attempts are derived from the seed, so every
 * client converges on the same attempt.
 * @param seed - Stage seed.
 * @param stageIndex - Stage number (0 = tutorial).
 * @returns The maze and the attempt number used.
 */
export function findValidMaze(seed: number, stageIndex: number): ValidMaze {
  for (let attempt = 0; attempt < ROAD.MAX_GENERATION_ATTEMPTS; attempt++) {
    const maze = generateMaze(createRng(deriveSeed(deriveSeed(seed, SALT.LAYOUT), attempt)));
    if (!maze || !maze.checkpointS || !hasEnoughCorners(maze.layout)) continue;
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
    if (validateCandidate(candidate, stageIndex).ok) return { ...maze, attempt, checkpointS: maze.checkpointS };
  }
  throw new Error(`Maze generation failed validation for seed ${seed} after ${ROAD.MAX_GENERATION_ATTEMPTS} attempts`);
}

/**
 * Full generation pipeline: seed -> maze -> shared ground height -> terrain -> props -> walls.
 * @param seed - Stage seed.
 * @param stageIndex - Stage number (0 = tutorial).
 * @returns Complete stage description.
 */
export function generateStage(seed: number, stageIndex = 0): StageData {
  const maze = findValidMaze(seed, stageIndex);
  const { layout, branches, zones, walls, attempt, startS, finishS, checkpointS } = maze;
  const samples = layout.samples;
  const terrainSeed = deriveSeed(seed, SALT.TERRAIN);
  const ground = (x: number, z: number): number => mazeHeight(x, z, terrainSeed);
  for (const road of [samples, ...branches.map((branch) => branch.samples)]) {
    for (const sample of road) sample.y = ground(sample.x, sample.z);
  }
  elevateWalls(walls, ground);

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
   * @returns Props clear of the pit, the gates and the walls.
   */
  const tidy = (props: PropPlacement[]): PropPlacement[] =>
    clearWalls(clearAroundArcs(clearPitArea(props, pit), samples, [startS, finishS], PROPS.MIN_CLEAR_RADIUS_START), walls);

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
    walls,
  };
}
