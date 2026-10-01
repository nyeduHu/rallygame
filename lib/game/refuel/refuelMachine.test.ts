// lib/game/refuel/refuelMachine.test.ts
import { describe, expect, it } from "vitest";
import { REFUEL } from "../constants";
import { applyRefuelStep, initialRefuel, stepRefuel, tangle, type RefuelState, type RefuelStepName } from "./refuelMachine";

/** Applies steps in order, failing the test on a rejection. */
function run(start: RefuelState, steps: RefuelStepName[]): RefuelState {
  let state = start;
  for (const step of steps) {
    const result = applyRefuelStep(state, step);
    if (!result.ok) throw new Error(`${step} rejected from ${state.kind}`);
    state = result.state;
  }
  return state;
}

describe("refuel machine", () => {
  it("walks the full cycle back to idle", () => {
    const end = run(initialRefuel(), ["OPEN_FLAP", "GRAB_HOSE", "CONNECT", "START", "STOP", "DISCONNECT", "RETURN_HOSE", "CLOSE_FLAP"]);
    expect(end).toEqual({ kind: "idle", flapOpen: false });
  });

  it("rejects out-of-order steps", () => {
    const idle = initialRefuel();
    for (const step of ["CONNECT", "START", "STOP", "DISCONNECT", "RETURN_HOSE", "CLOSE_FLAP"] as const) {
      expect(applyRefuelStep(idle, step).ok, step).toBe(false);
    }
    expect(applyRefuelStep({ kind: "hose_held", flapOpen: false }, "CONNECT").ok).toBe(false);
    expect(applyRefuelStep({ kind: "fueling", flapOpen: true }, "DISCONNECT").ok).toBe(false);
    expect(applyRefuelStep({ kind: "connected", flapOpen: true }, "RETURN_HOSE").ok).toBe(false);
  });

  it("snaps the hose back when the player is too far", () => {
    const held: RefuelState = { kind: "hose_held", flapOpen: true };
    expect(tangle(held, REFUEL.HOSE_LENGTH_M - 1).tangled).toBe(false);
    const result = tangle(held, REFUEL.HOSE_LENGTH_M + 1);
    expect(result.tangled).toBe(true);
    expect(result.state.kind).toBe("idle");
    expect(tangle(initialRefuel(), 100).tangled).toBe(false);
  });

  it("fills only while fueling and spills once at the top", () => {
    expect(stepRefuel({ kind: "connected", flapOpen: true }, 0.5, 1).fuel01).toBe(0.5);
    const filling = stepRefuel({ kind: "fueling", flapOpen: true }, 0.5, 1);
    expect(filling.fuel01).toBeCloseTo(0.5 + REFUEL.LITRES_PER_SECOND / REFUEL.TANK_LITRES);
    const over = stepRefuel({ kind: "fueling", flapOpen: true }, 0.999, 1);
    expect(over).toEqual({ fuel01: REFUEL.OVERFLOW_AT, overflowed: true });
  });
});
