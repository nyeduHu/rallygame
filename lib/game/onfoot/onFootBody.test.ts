// lib/game/onfoot/onFootBody.test.ts
import { expect, test } from "vitest";
import { ON_FOOT, SIMULATION, VEHICLE } from "../constants";
import { createPhysicsWorld } from "../physics/createWorld";
import { loadRapier } from "../physics/rapier";
import { Vector3 } from "three";
import { Vehicle } from "../physics/vehicle";
import type { MeshData } from "../stage/meshData";
import type { StageData } from "../stage/types";
import { OnFootBody } from "./onFootBody";

const LENGTH = 200;
const HALF_WIDTH = 60;
const CAR_Z = 100;
const SECONDS = 2;
const STEPS = Math.round(SECONDS / SIMULATION.FIXED_TIMESTEP);
const TIMEOUT_MS = 20_000;

/** Flat quad used as both road and terrain. */
const FLAT: MeshData = {
  positions: new Float32Array([-HALF_WIDTH, 0, 0, -HALF_WIDTH, 0, LENGTH, HALF_WIDTH, 0, 0, HALF_WIDTH, 0, LENGTH]),
  indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
  colors: new Float32Array(12),
};

const STAGE: StageData = {
  seed: 1, attempt: 0,
  samples: [{ x: 0, y: 0, z: 0, s: 0, heading: 0 }, { x: 0, y: 0, z: LENGTH, s: LENGTH, heading: 0 }],
  length: LENGTH, corners: [],
  terrain: { originX: 0, originZ: 0, cellSize: 1, cols: 0, rows: 0, heights: new Float32Array() },
  startS: 10, finishS: LENGTH - 10, checkpointS: [], trees: [], rocks: [], grass: [], barriers: [], cones: [],
  spawn: { x: 0, y: 0, z: CAR_Z, heading: 0 },
  pit: null,
};

/** Walks the capsule at a heading for a while and returns where it ends. */
async function walk(startZ: number, vz: number): Promise<{ z: number; feetY: number; grounded: boolean; carZ: number }> {
  const R = await loadRapier();
  const physics = createPhysicsWorld(R, STAGE, FLAT, FLAT);
  const vehicle = new Vehicle(R, physics.world, physics.surfaces, STAGE.spawn);
  const body = new OnFootBody(R, physics.world, { x: 0, y: 0.2, z: startZ });
  try {
    for (let i = 0; i < STEPS; i++) {
      vehicle.step({ throttle: false, brake: false, steer: 0, handbrake: true }, SIMULATION.FIXED_TIMESTEP);
      body.step(SIMULATION.FIXED_TIMESTEP, { x: 0, z: vz });
      physics.world.step();
      vehicle.capturePose();
    }
    const feet = body.feetPosition(new Vector3());
    return { z: body.position.z, feetY: feet.y, grounded: body.grounded, carZ: vehicle.currentPosition.z };
  } finally {
    body.dispose();
    vehicle.dispose();
    physics.world.free();
  }
}

test("walks on flat ground at walking speed and stays grounded", async () => {
  const result = await walk(20, ON_FOOT.WALK_SPEED_MS);
  expect(result.z).toBeGreaterThan(20 + ON_FOOT.WALK_SPEED_MS * SECONDS * 0.8);
  expect(result.grounded).toBe(true);
  expect(Math.abs(result.feetY)).toBeLessThan(0.15);
}, TIMEOUT_MS);

test("is blocked by the car chassis", async () => {
  const startZ = CAR_Z + VEHICLE.CHASSIS_HALF_EXTENTS.z + 3;
  const result = await walk(startZ, -ON_FOOT.WALK_SPEED_MS);
  expect(result.z).toBeGreaterThan(result.carZ + VEHICLE.CHASSIS_HALF_EXTENTS.z);
}, TIMEOUT_MS);
