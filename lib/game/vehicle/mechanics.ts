// lib/game/vehicle/mechanics.ts
import { MECHANICS, SEED } from "../constants";
import { clamp } from "../math";
import { createRng, deriveSeed } from "../random";
import type { SurfaceKind } from "../stage/types";

export type BrokenPart = "radiator_hose" | "spark_plug" | "drive_belt";
export type EngineStatus = "ok" | "overheating" | "failed";

const BROKEN_PARTS: ReadonlyArray<BrokenPart> = ["radiator_hose", "spark_plug", "drive_belt"];

/** Everything the server and the HUD need to know about the car's mechanical condition. */
export interface MechanicalState {
  fuel01: number;
  engineHealth01: number;
  temperature01: number;
  damage01: number;
  tireWear01: number;
  engineStatus: EngineStatus;
  brokenPart: BrokenPart | null;
  /** Seconds spent at critical temperature; fails the engine after OVERHEAT_FAIL_SECONDS. */
  failHoldSeconds: number;
}

/** Inputs for one mechanics step. */
export interface MechanicalInputs {
  throttle01: number;
  rpm01: number;
  speedMs: number;
  surface: SurfaceKind | null;
  /** Largest collision impulse (N·s) since the last step. */
  impactImpulse: number;
  ambientTemp01: number;
  hoodOpen: boolean;
  dt: number;
}

/** @returns A new car: full tank, healthy, cold. */
export function initialMechanics(): MechanicalState {
  return {
    fuel01: 1,
    engineHealth01: 1,
    temperature01: 0,
    damage01: 0,
    tireWear01: 0,
    engineStatus: "ok",
    brokenPart: null,
    failHoldSeconds: 0,
  };
}

/**
 * Advances fuel, temperature, health, damage and tyre wear. Pure and random-free so the server
 * and a replay agree; failures from crashes go through {@link applyCrash}.
 * @param s - Current state.
 * @param i - Inputs for this step.
 * @returns The next state.
 */
export function stepMechanics(s: MechanicalState, i: MechanicalInputs): MechanicalState {
  const load = i.throttle01 * i.rpm01;
  const running = s.engineStatus !== "failed" && s.fuel01 > 0;

  const burn = running ? (MECHANICS.FUEL_IDLE + MECHANICS.FUEL_PER_LOAD * load) * i.dt : 0;
  const fuel01 = clamp(s.fuel01 - burn / MECHANICS.TANK_CAPACITY_UNITS, 0, 1);

  const heating = running ? MECHANICS.HEAT_PER_LOAD * load : 0;
  const cooling =
    MECHANICS.COOL_BASE +
    (MECHANICS.COOL_PER_SPEED * Math.abs(i.speedMs)) / MECHANICS.MAX_SPEED_MS +
    (i.hoodOpen ? MECHANICS.COOL_HOOD_OPEN : 0) +
    MECHANICS.COOL_PER_AMBIENT * (1 - i.ambientTemp01);
  const temperature01 = clamp(
    s.temperature01 + i.dt * (heating + MECHANICS.HEAT_DAMAGE * s.damage01 - cooling),
    0,
    1,
  );

  const excessImpact = Math.max(0, i.impactImpulse - MECHANICS.IMPACT_FREE_THRESHOLD);
  const damage01 = clamp(s.damage01 + excessImpact * MECHANICS.DAMAGE_PER_IMPULSE, 0, 1);

  let engineStatus = s.engineStatus;
  let brokenPart = s.brokenPart;
  let failHoldSeconds = s.failHoldSeconds;
  let engineHealth01 = s.engineHealth01 - excessImpact * MECHANICS.HEALTH_PER_IMPULSE;

  if (engineStatus !== "failed") {
    if (temperature01 >= MECHANICS.OVERHEAT_FAIL) {
      failHoldSeconds += i.dt;
    } else {
      failHoldSeconds = 0;
    }
    if (temperature01 >= MECHANICS.OVERHEAT_WARN) {
      engineStatus = "overheating";
      engineHealth01 -= MECHANICS.HEALTH_LOSS_OVERHEAT_PER_S * i.dt;
    } else if (engineStatus === "overheating" && temperature01 < MECHANICS.OVERHEAT_RECOVER) {
      engineStatus = "ok";
    }
    if (failHoldSeconds >= MECHANICS.OVERHEAT_FAIL_SECONDS) {
      engineStatus = "failed";
      brokenPart = "radiator_hose";
    }
  }
  engineHealth01 = clamp(engineHealth01, 0, 1);
  if (engineHealth01 <= 0 && engineStatus !== "failed") {
    engineStatus = "failed";
    brokenPart = brokenPart ?? "spark_plug";
  }

  const wear = i.surface === "grass" ? MECHANICS.TIRE_WEAR_PER_S_GRASS : MECHANICS.TIRE_WEAR_PER_S_GRAVEL;
  const tireWear01 = clamp(s.tireWear01 + (Math.abs(i.speedMs) > 1 ? wear * i.dt : 0), 0, 1);

  return { fuel01, engineHealth01, temperature01, damage01, tireWear01, engineStatus, brokenPart, failHoldSeconds };
}

/**
 * Engine output multiplier.
 * @param s - Mechanical state.
 * @returns 1 when healthy; falls linearly to OVERHEAT_POWER_FLOOR between warn and fail
 * temperature; 0 when failed or out of fuel; reduced a little by body damage.
 */
export function powerFactor(s: MechanicalState): number {
  if (s.engineStatus === "failed" || s.fuel01 <= 0) return 0;
  const heat =
    s.temperature01 <= MECHANICS.OVERHEAT_WARN
      ? 1
      : 1 -
        (1 - MECHANICS.OVERHEAT_POWER_FLOOR) *
          clamp((s.temperature01 - MECHANICS.OVERHEAT_WARN) / (MECHANICS.OVERHEAT_FAIL - MECHANICS.OVERHEAT_WARN), 0, 1);
  return heat * (1 - MECHANICS.DAMAGE_POWER_LOSS * s.damage01);
}

/**
 * Rolls whether a crash breaks a part, from the seeded failure stream.
 * @param s - State after the impact was applied.
 * @param stageSeed - Stage seed.
 * @param eventIndex - Index of this crash within the race (makes each roll distinct and replayable).
 * @returns State with a broken part and failed engine, or unchanged.
 */
export function applyCrash(s: MechanicalState, stageSeed: number, eventIndex: number): MechanicalState {
  if (s.engineStatus === "failed") return s;
  const rng = createRng(deriveSeed(stageSeed, SEED.FAILURES_SALT) ^ Math.imul(eventIndex + 1, SEED.ATTEMPT_SALT));
  if (!rng.chance(MECHANICS.P_BREAK_ON_CRASH)) return s;
  const brokenPart = BROKEN_PARTS[rng.int(0, BROKEN_PARTS.length - 1)];
  return { ...s, engineStatus: "failed", brokenPart };
}
