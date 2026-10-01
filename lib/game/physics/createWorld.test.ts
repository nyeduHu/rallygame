// lib/game/physics/createWorld.test.ts
import { expect, test } from "vitest";
import { GATES, ROAD, SIMULATION } from "../constants";
import type { MeshData } from "../stage/meshData";
import type { StageData } from "../stage/types";
import { createPhysicsWorld } from "./createWorld";
import { loadRapier } from "./rapier";
import { Vehicle, type DriverControls } from "./vehicle";

const TEST_ROAD_END = 100;
const ROAD_EDGE = ROAD.WIDTH / 2 + ROAD.SHOULDER_WIDTH;
const TERRAIN_EDGE = 50;
const TERRAIN_START_Z = -20;
const TERRAIN_END_Z = 120;
const GATE_START_S = 20;
const GATE_FINISH_S = 80;
const CAR_START_Z = 8;
const TOWER_COLLISION_TEST_DURATION_SECONDS = 1;
const SIMULATION_STEPS = Math.round(TOWER_COLLISION_TEST_DURATION_SECONDS / SIMULATION.FIXED_TIMESTEP);
const TOWER_COLLISION_TEST_TIMEOUT_MS = 10_000;
const ROAD_MESH: MeshData = {
  positions: new Float32Array([
    -ROAD_EDGE, 0, 0,
    -ROAD_EDGE, 0, TEST_ROAD_END,
    ROAD_EDGE, 0, 0,
    ROAD_EDGE, 0, TEST_ROAD_END,
  ]),
  indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
  colors: new Float32Array(12),
};
const TERRAIN_MESH: MeshData = {
  positions: new Float32Array([
    -TERRAIN_EDGE, 0, TERRAIN_START_Z,
    -TERRAIN_EDGE, 0, TERRAIN_END_Z,
    TERRAIN_EDGE, 0, TERRAIN_START_Z,
    TERRAIN_EDGE, 0, TERRAIN_END_Z,
  ]),
  indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
  colors: new Float32Array(12),
};
const THROTTLE_CONTROLS: DriverControls = { throttle: true, brake: false, steer: 0, handbrake: false };

/**
 * Creates a flat straight stage with gate locations for isolated collider checks.
 * @returns Minimal stage data accepted by the physics-world factory.
 */
function createTestStage(): StageData {
  return {
    seed: 1,
    attempt: 0,
    samples: [
      { x: 0, y: 0, z: 0, s: 0, heading: 0 },
      { x: 0, y: 0, z: TEST_ROAD_END, s: TEST_ROAD_END, heading: 0 },
    ],
    length: TEST_ROAD_END,
    corners: [],
    terrain: { originX: 0, originZ: 0, cellSize: 1, cols: 0, rows: 0, heights: new Float32Array() },
    startS: GATE_START_S,
    finishS: GATE_FINISH_S,
    checkpointS: [],
    trees: [],
    rocks: [],
    grass: [],
    barriers: [],
    cones: [],
    spawn: { x: ROAD.WIDTH / 2 + GATES.TOWER_OFFSET, y: 0, z: CAR_START_Z, heading: 0 },
  pit: null,
  branches: [],
  };
}

/**
 * Drives a car into a gate-side tower and verifies its collider stops the car.
 */
async function slowsCarAtGateTower(): Promise<void> {
  const rapier = await loadRapier();
  const stage = createTestStage();
  const physics = createPhysicsWorld(rapier, stage, ROAD_MESH, TERRAIN_MESH);
  const vehicle = new Vehicle(rapier, physics.world, physics.surfaces, stage.spawn);

  try {
    for (let step = 0; step < SIMULATION_STEPS; step += 1) {
      vehicle.step(THROTTLE_CONTROLS, SIMULATION.FIXED_TIMESTEP);
      physics.world.step();
      vehicle.capturePose();
    }

    expect(Math.abs(vehicle.forwardSpeed)).toBeLessThan(5);
  } finally {
    vehicle.dispose();
    physics.world.free();
  }
}

test("slows the car below 5 m/s when it drives into a gate tower", slowsCarAtGateTower, TOWER_COLLISION_TEST_TIMEOUT_MS);
