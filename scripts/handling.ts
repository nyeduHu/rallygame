// scripts/handling.ts
import { SIMULATION } from "../lib/game/constants";
import { createPhysicsWorld } from "../lib/game/physics/createWorld";
import { setTuningEnabled, setTuningValue } from "../lib/game/tuning";
import { loadRapier } from "../lib/game/physics/rapier";
import { Vehicle, type DriverControls } from "../lib/game/physics/vehicle";
import type { MeshData } from "../lib/game/stage/meshData";
import type { StageData } from "../lib/game/stage/types";

const LENGTH = 4000;
const HALF = 400;
const FLAT: MeshData = {
  positions: new Float32Array([-HALF, 0, -HALF, -HALF, 0, LENGTH, HALF, 0, -HALF, HALF, 0, LENGTH]),
  indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
  colors: new Float32Array(12),
};
const STAGE: StageData = {
  seed: 1, attempt: 0,
  samples: [{ x: 0, y: 0, z: 0, s: 0, heading: 0 }, { x: 0, y: 0, z: LENGTH, s: LENGTH, heading: 0 }],
  length: LENGTH, corners: [],
  terrain: { originX: 0, originZ: 0, cellSize: 1, cols: 0, rows: 0, heights: new Float32Array() },
  startS: 10, finishS: LENGTH - 10, checkpointS: [], trees: [], rocks: [], grass: [], barriers: [], cones: [],
  spawn: { x: 0, y: 0, z: 0, heading: 0 }, pit: null, branches: [], walls: [],
};

/** Yaw rate from the chassis angular velocity about the up axis. */
function yawRate(vehicle: Vehicle): number {
  return vehicle.body.angvel().y;
}

/** Runs a scripted manoeuvre and prints a short trace. */
async function run(name: string, targetSpeed: number, steer: number, throttleDuringTurn: boolean, brake = false): Promise<void> {
  const R = await loadRapier();
  const physics = createPhysicsWorld(R, STAGE, FLAT, FLAT);
  const vehicle = new Vehicle(R, physics.world, physics.surfaces, STAGE.spawn);
  const dt = SIMULATION.FIXED_TIMESTEP;
  const step = (controls: DriverControls): void => {
    vehicle.step(controls, dt);
    physics.world.step();
    vehicle.capturePose();
  };
  // Settle, then accelerate straight to the target speed.
  for (let i = 0; i < 240; i++) step({ throttle: false, brake: false, steer: 0, handbrake: false });
  for (let i = 0; i < 120 * 40 && vehicle.forwardSpeed < targetSpeed; i++) step({ throttle: true, brake: false, steer: 0, handbrake: false });
  const lines: string[] = [];
  let lastLatAcc = 0;
  let lastYaw = 0;
  let lastSpeed = 0;
  for (let i = 0; i < 120 * 4; i++) {
    step({ throttle: throttleDuringTurn, brake, steer, handbrake: false });
    if (i === 120) {
      lastSpeed = Math.hypot(vehicle.body.linvel().x, vehicle.body.linvel().z);
      lastYaw = Math.abs(yawRate(vehicle));
      lastLatAcc = lastSpeed * lastYaw;
    }
    if (i % 60 === 0) {
      const speed = Math.hypot(vehicle.body.linvel().x, vehicle.body.linvel().z);
      const yaw = yawRate(vehicle);
      lines.push(`t=${(i / 120).toFixed(1)} v=${speed.toFixed(1)} yawRate=${yaw.toFixed(2)} latAcc=${(speed * Math.abs(yaw)).toFixed(1)} steer=${vehicle.steer.toFixed(2)} slip=${vehicle.slipSpeed.toFixed(1)}`);
    }
  }
  console.log(`## ${name}\n${lines.join("\n")}`);
  console.log(`METRIC ${name} latAcc=${lastLatAcc.toFixed(1)} yaw=${lastYaw.toFixed(2)} speed=${lastSpeed.toFixed(1)}`);
  vehicle.dispose();
  physics.world.free();
}

/** Heading of the car and of its velocity, to measure sideslip. */
function sideslipDegrees(vehicle: Vehicle): number {
  const v = vehicle.body.linvel();
  const q = vehicle.currentQuaternion;
  const carHeading = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
  const velocityHeading = Math.atan2(v.x, v.z);
  let d = velocityHeading - carHeading;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return (d * 180) / Math.PI;
}

/** Spins the car with the handbrake, then tries to recover with the given controls. */
async function spinRecovery(name: string, recovery: (t: number, sideslip: number) => DriverControls): Promise<void> {
  const R = await loadRapier();
  const physics = createPhysicsWorld(R, STAGE, FLAT, FLAT);
  const vehicle = new Vehicle(R, physics.world, physics.surfaces, STAGE.spawn);
  const dt = SIMULATION.FIXED_TIMESTEP;
  const step = (controls: DriverControls): void => {
    vehicle.step(controls, dt);
    physics.world.step();
    vehicle.capturePose();
  };
  for (let i = 0; i < 240; i++) step({ throttle: false, brake: false, steer: 0, handbrake: false });
  for (let i = 0; i < 120 * 40 && vehicle.forwardSpeed < 22; i++) step({ throttle: true, brake: false, steer: 0, handbrake: false });
  for (let i = 0; i < 90; i++) step({ throttle: false, brake: false, steer: -1, handbrake: true });
  const lines: string[] = [];
  let lateSlide = 0;
  for (let i = 0; i < 120 * 5; i++) {
    const slide = sideslipDegrees(vehicle);
    if (i / 120 > 2.5) lateSlide = Math.max(lateSlide, Math.abs(slide));
    step(recovery(i / 120, slide));
    if (i % 60 === 0) lines.push(`t=${(i / 120).toFixed(1)} speed=${Math.hypot(vehicle.body.linvel().x, vehicle.body.linvel().z).toFixed(1)} sideslip=${slide.toFixed(0)}deg yawRate=${yawRate(vehicle).toFixed(2)}`);
  }
  console.log(`## ${name}\n${lines.join("\n")}`);
  console.log(`METRIC ${name} lateSlide=${lateSlide.toFixed(0)}`);
  vehicle.dispose();
  physics.world.free();
}

/** Runs every scripted manoeuvre. */
async function main(): Promise<void> {
  await run("20 m/s, full left, coasting", 20, -1, false);
  await run("20 m/s, full left, throttle", 20, -1, true);
  await run("12 m/s, full left, throttle", 12, -1, true);
  await run("25 m/s, full left, brake", 25, -1, false, true);
  // Counter-steer into the slide (steer toward the direction the car is travelling) with throttle.
  await spinRecovery("spin recovery: counter-steer + throttle", (_t, slide) => ({ throttle: true, brake: false, steer: slide > 0 ? -1 : 1, handbrake: false }));
  await spinRecovery("spin recovery: hands off, throttle", () => ({ throttle: true, brake: false, steer: 0, handbrake: false }));
  await spinRecovery("spin recovery: hands off, coasting", () => ({ throttle: false, brake: false, steer: 0, handbrake: false }));
  await spinRecovery("spin recovery: counter-steer, coasting", (_t, slide) => ({ throttle: false, brake: false, steer: slide > 0 ? -1 : 1, handbrake: false }));
}

/** Applies `--set=GROUP.FIELD=value` overrides so tyre numbers can be tried without editing code. */
function applyOverrides(): void {
  for (const arg of process.argv.slice(2)) {
    const match = /^--set=([A-Z_.]+)=(-?[0-9.]+)$/.exec(arg);
    if (!match) continue;
    setTuningValue(match[1], Number(match[2]));
    setTuningEnabled(true);
  }
}

applyOverrides();
void main();
