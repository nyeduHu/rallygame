// scripts/autopilot.ts
import { AUTOPILOT, SIMULATION } from "../lib/game/constants";
import { GameSession } from "../lib/game/session";
import { loadRapier } from "../lib/game/physics/rapier";
import { clamp, lerp, smoothstep, wrapAngle } from "../lib/game/math";
import { generateStage } from "../lib/game/stage/generateStage";
import { buildRoadMesh, buildTerrainMesh } from "../lib/game/stage/meshData";
import { poseAt } from "../lib/game/stage/roadIndex";
import { getActiveTuning, setTuningEnabled, setTuningValue } from "../lib/game/tuning";
import type { DriverControls } from "../lib/game/physics/vehicle";
import type { StageData } from "../lib/game/stage/types";

interface AutopilotOptions {
  seeds: number[];
  tuneGrip: boolean;
}

interface RunResult {
  seed: number;
  finished: boolean;
  finishSeconds: number;
  checkpoints: number;
  maxSpeedMs: number;
  maxAbsRollRadians: number;
  resets: number;
}

const NEUTRAL_STEER = 0;
const NO_PEDAL = false;
const NO_HANDBRAKE = false;
const FULL_THROTTLE = true;
/** Steps between trace lines when AUTOPILOT_TRACE is set (about 5 s). */
const TRACE_INTERVAL_STEPS = 300;

/**
 * Parses the optional single-seed and tuning switches.
 * @param args - Command-line arguments.
 * @returns Autopilot configuration.
 */
function parseOptions(args: string[]): AutopilotOptions {
  let seeds = Array.from({ length: AUTOPILOT.SEED_COUNT }, (_, index) => AUTOPILOT.SEED_START + index);
  let tuneGrip = false;

  for (const arg of args) {
    if (arg === "--tune") {
      tuneGrip = true;
      continue;
    }
    if (arg.startsWith("--seed=")) {
      const seed = Number(arg.slice("--seed=".length));
      if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("--seed must be a non-negative safe integer");
      seeds = [seed];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { seeds, tuneGrip };
}

/**
 * Runs the pure-pursuit controller until finish or the simulation time limit.
 * @param R - Initialised Rapier module.
 * @param seed - Stage seed.
 * @returns Completion and stability metrics.
 */
function runSeed(R: Awaited<ReturnType<typeof loadRapier>>, seed: number): RunResult {
  const stage = generateStage(seed);
  const road = buildRoadMesh(stage.samples, seed);
  const terrain = buildTerrainMesh(stage.terrain, seed);
  const session = new GameSession(R, stage, road, terrain);
  let simulationSeconds = 0;
  let maxSpeedMs = 0;
  let maxAbsRollRadians = 0;
  let stuckSeconds = 0;
  let resets = 0;

  session.beginCountdown();
  try {
    while (session.race.currentPhase !== "finished" && simulationSeconds < AUTOPILOT.MAX_SIMULATION_SECONDS) {
      const controls = controlsFor(session, stage);
      session.advance(SIMULATION.FIXED_TIMESTEP, controls);
      simulationSeconds += SIMULATION.FIXED_TIMESTEP;
      if (process.env.AUTOPILOT_TRACE && Math.round(simulationSeconds / SIMULATION.FIXED_TIMESTEP) % TRACE_INTERVAL_STEPS === 0) {
        const position = session.vehicle.currentPosition;
        console.log(
          `t=${simulationSeconds.toFixed(0)} s=${session.race.lastProgressS.toFixed(0)}/${stage.finishS.toFixed(0)} cp=${session.race.snapshot().checkpointsPassed} speed=${session.vehicle.forwardSpeed.toFixed(1)} x=${position.x.toFixed(0)} z=${position.z.toFixed(0)} y=${position.y.toFixed(1)}`,
        );
      }
      const running = session.race.currentPhase === "running";
      stuckSeconds = running && Math.abs(session.vehicle.forwardSpeed) < AUTOPILOT.STUCK_SPEED_MS
        ? stuckSeconds + SIMULATION.FIXED_TIMESTEP
        : 0;
      if (stuckSeconds >= AUTOPILOT.STUCK_SECONDS || session.race.missedGate) {
        session.resetToRoad();
        resets += 1;
        stuckSeconds = 0;
      }
      maxSpeedMs = Math.max(maxSpeedMs, Math.abs(session.vehicle.forwardSpeed));
      maxAbsRollRadians = Math.max(maxAbsRollRadians, readAbsoluteRoll(session.vehicle.currentQuaternion));
    }

    const race = session.race.snapshot();
    return {
      seed,
      finished: race.phase === "finished",
      finishSeconds: race.finishTime ?? simulationSeconds,
      checkpoints: race.checkpointsPassed,
      maxSpeedMs,
      maxAbsRollRadians,
      resets,
    };
  } finally {
    session.dispose();
  }
}

/**
 * Chooses steering, throttle, and braking from the next pure-pursuit target.
 * @param session - Active game simulation.
 * @param stage - Generated stage.
 * @returns Current digital driver controls.
 */
function controlsFor(session: GameSession, stage: StageData): DriverControls {
  const vehicle = session.vehicle;
  const speed = Math.abs(vehicle.forwardSpeed);
  const progressS = session.race.lastProgressS;
  const lookahead = Math.min(AUTOPILOT.LOOKAHEAD_MAX, AUTOPILOT.LOOKAHEAD_BASE + speed * AUTOPILOT.LOOKAHEAD_PER_MS);
  const targetS = Math.min(stage.finishS, progressS + lookahead);
  const target = poseAt(stage.samples, targetS);
  const dx = target.x - vehicle.currentPosition.x;
  const dz = target.z - vehicle.currentPosition.z;
  const desiredHeading = Math.atan2(dx, dz);
  const currentHeading = readHeading(vehicle.currentQuaternion);
  const alpha = wrapAngle(desiredHeading - currentHeading);
  const { VEHICLE, STEERING } = getActiveTuning();
  const maxSteerAngle = lerp(
    STEERING.MAX_ANGLE_LOW_SPEED,
    STEERING.MAX_ANGLE_HIGH_SPEED,
    smoothstep(0, STEERING.FALLOFF_SPEED, speed),
  );
  const wheelbase = VEHICLE.WHEEL_FRONT_Z - VEHICLE.WHEEL_REAR_Z;
  const curvature = (2 * Math.sin(alpha)) / lookahead;
  const desiredSteerAngle = Math.atan(wheelbase * curvature);
  const steering = clamp(-desiredSteerAngle / maxSteerAngle, -1, 1);
  const targetSpeed = speedForUpcomingCorner(stage, progressS);

  return {
    throttle: speed < targetSpeed - AUTOPILOT.SPEED_MARGIN_MS ? FULL_THROTTLE : NO_PEDAL,
    brake: speed > targetSpeed + AUTOPILOT.SPEED_MARGIN_MS,
    steer: steering === 0 ? NEUTRAL_STEER : steering,
    handbrake: NO_HANDBRAKE,
  };
}

/**
 * Limits speed for the next corner while starting braking before its entry.
 * @param stage - Generated stage.
 * @param progressS - Current progress along the route.
 * @returns Safe target speed in metres per second.
 */
function speedForUpcomingCorner(stage: StageData, progressS: number): number {
  const corner = stage.corners.find((candidate) => candidate.endS > progressS);
  if (!corner) return AUTOPILOT.MAX_SPEED_MS;
  const cornerSpeed = Math.sqrt(corner.radius * AUTOPILOT.MAX_LATERAL_ACCELERATION);
  const distanceToCorner = Math.max(0, corner.startS - progressS);
  const brakingLimit = Math.sqrt(
    cornerSpeed * cornerSpeed + 2 * AUTOPILOT.BRAKING_DECELERATION * distanceToCorner,
  );
  return Math.min(AUTOPILOT.MAX_SPEED_MS, brakingLimit);
}

/**
 * Reads the car's forward heading from its quaternion, including body pitch and roll.
 * @param quaternion - Current vehicle orientation.
 * @returns Horizontal heading in radians.
 */
function readHeading(quaternion: { x: number; y: number; z: number; w: number }): number {
  const forwardX = 2 * (quaternion.x * quaternion.z + quaternion.w * quaternion.y);
  const forwardZ = 1 - 2 * (quaternion.x * quaternion.x + quaternion.y * quaternion.y);
  return Math.atan2(forwardX, forwardZ);
}

/**
 * Measures chassis roll for the regression summary.
 * @param quaternion - Current vehicle orientation.
 * @returns Absolute roll in radians.
 */
function readAbsoluteRoll(quaternion: { x: number; y: number; z: number; w: number }): number {
  const forward = {
    x: 2 * (quaternion.x * quaternion.z + quaternion.w * quaternion.y),
    y: 2 * (quaternion.y * quaternion.z - quaternion.w * quaternion.x),
    z: 1 - 2 * (quaternion.x * quaternion.x + quaternion.y * quaternion.y),
  };
  const up = {
    x: 2 * (quaternion.x * quaternion.y - quaternion.w * quaternion.z),
    y: 1 - 2 * (quaternion.x * quaternion.x + quaternion.z * quaternion.z),
    z: 2 * (quaternion.y * quaternion.z + quaternion.w * quaternion.x),
  };
  const referenceUp = {
    x: -forward.y * forward.x,
    y: 1 - forward.y * forward.y,
    z: -forward.y * forward.z,
  };
  const cross = {
    x: referenceUp.y * up.z - referenceUp.z * up.y,
    y: referenceUp.z * up.x - referenceUp.x * up.z,
    z: referenceUp.x * up.y - referenceUp.y * up.x,
  };
  const sine = forward.x * cross.x + forward.y * cross.y + forward.z * cross.z;
  const cosine = referenceUp.x * up.x + referenceUp.y * up.y + referenceUp.z * up.z;
  return Math.abs(Math.atan2(sine, cosine));
}

/**
 * Initialises physics, applies optional test tuning, and runs all requested seeds.
 */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.tuneGrip) {
    setTuningValue("TIRE.FRONT_GRIP", AUTOPILOT.TUNED_FRONT_GRIP);
    setTuningEnabled(true);
  }

  const R = await loadRapier();
  const results = options.seeds.map((seed) => runSeed(R, seed));
  console.table(results);
  if (results.some((result) => !result.finished)) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
