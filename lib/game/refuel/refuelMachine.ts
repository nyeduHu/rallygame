// lib/game/refuel/refuelMachine.ts
import { REFUEL } from "../constants";

export type RefuelKind = "idle" | "hose_held" | "connected" | "fueling";

/** Refuelling progress plus the fuel-flap position. */
export interface RefuelState {
  kind: RefuelKind;
  flapOpen: boolean;
}

export type RefuelStepName =
  | "OPEN_FLAP"
  | "CLOSE_FLAP"
  | "GRAB_HOSE"
  | "CONNECT"
  | "START"
  | "STOP"
  | "DISCONNECT"
  | "RETURN_HOSE";

export type RefuelResult = { ok: true; state: RefuelState } | { ok: false; error: "illegal_step" };

/** @returns A fresh idle state with the flap closed. */
export function initialRefuel(): RefuelState {
  return { kind: "idle", flapOpen: false };
}

/**
 * Applies a refuelling step; only the legal next step is accepted.
 * @param state - Current state.
 * @param step - Requested step.
 * @returns New state or a rejection.
 */
export function applyRefuelStep(state: RefuelState, step: RefuelStepName): RefuelResult {
  const next = (kind: RefuelKind, flapOpen = state.flapOpen): RefuelResult => ({ ok: true, state: { kind, flapOpen } });
  switch (step) {
    case "OPEN_FLAP":
      return state.flapOpen ? { ok: false, error: "illegal_step" } : next(state.kind, true);
    case "CLOSE_FLAP":
      return state.flapOpen && (state.kind === "idle" || state.kind === "hose_held") ? next(state.kind, false) : { ok: false, error: "illegal_step" };
    case "GRAB_HOSE":
      return state.kind === "idle" ? next("hose_held") : { ok: false, error: "illegal_step" };
    case "CONNECT":
      return state.kind === "hose_held" && state.flapOpen ? next("connected") : { ok: false, error: "illegal_step" };
    case "START":
      return state.kind === "connected" ? next("fueling") : { ok: false, error: "illegal_step" };
    case "STOP":
      return state.kind === "fueling" ? next("connected") : { ok: false, error: "illegal_step" };
    case "DISCONNECT":
      return state.kind === "connected" ? next("hose_held") : { ok: false, error: "illegal_step" };
    case "RETURN_HOSE":
      return state.kind === "hose_held" ? next("idle") : { ok: false, error: "illegal_step" };
  }
}

/**
 * The hose snaps back when the player walks too far from the pump.
 * @param state - Current state.
 * @param distanceFromPump - Distance between the hose holder (or flap) and the pump.
 * @returns Idle state when tangled, otherwise the same state.
 */
export function tangle(state: RefuelState, distanceFromPump: number): { state: RefuelState; tangled: boolean } {
  if ((state.kind === "hose_held" || state.kind === "connected" || state.kind === "fueling") && distanceFromPump > REFUEL.HOSE_LENGTH_M) {
    return { state: { kind: "idle", flapOpen: state.flapOpen }, tangled: true };
  }
  return { state, tangled: false };
}

/**
 * Integrates pump flow while fueling; overfilling spills once.
 * @param state - Refuel state (flow only while fueling).
 * @param fuel01 - Current fuel fraction.
 * @param dt - Seconds.
 * @returns New fuel and whether the tank overflowed this step.
 */
export function stepRefuel(state: RefuelState, fuel01: number, dt: number): { fuel01: number; overflowed: boolean } {
  if (state.kind !== "fueling") return { fuel01, overflowed: false };
  const filled = fuel01 + (REFUEL.LITRES_PER_SECOND * dt) / REFUEL.TANK_LITRES;
  return filled > REFUEL.OVERFLOW_AT ? { fuel01: REFUEL.OVERFLOW_AT, overflowed: true } : { fuel01: filled, overflowed: false };
}
