// lib/game/vehicle/mechanics.test.ts
import { describe, expect, it } from "vitest";
import { MECHANICS } from "../constants";
import { applyCrash, initialMechanics, powerFactor, stepMechanics, type MechanicalInputs, type MechanicalState } from "./mechanics";

const BASE: MechanicalInputs = {
  throttle01: 0.8, rpm01: 0.8, speedMs: 2, surface: "gravel", impactImpulse: 0,
  ambientTemp01: MECHANICS.DEFAULT_AMBIENT, hoodOpen: false, dt: 0.1,
};

/** Runs n steps. */
function run(s: MechanicalState, n: number, patch: Partial<MechanicalInputs> = {}): MechanicalState {
  let state = s;
  for (let k = 0; k < n; k++) state = stepMechanics(state, { ...BASE, ...patch });
  return state;
}

describe("mechanics", () => {
  it("burns fuel monotonically", () => {
    let s = initialMechanics();
    let previous = s.fuel01;
    for (let k = 0; k < 50; k++) {
      s = stepMechanics(s, BASE);
      expect(s.fuel01).toBeLessThanOrEqual(previous);
      previous = s.fuel01;
    }
    expect(s.fuel01).toBeLessThan(1);
  });

  it("covers 1.35x the longest stage at moderate load", () => {
    const seconds = 170 * MECHANICS.FUEL_RANGE_MULTIPLIER;
    const s = run(initialMechanics(), seconds * 10, { throttle01: 0.5, rpm01: 0.8, speedMs: 25 });
    expect(s.fuel01).toBeGreaterThan(0);
  });

  it("fails from overheating only after the hold time", () => {
    const hot = { ...initialMechanics(), temperature01: 1 };
    const early = run(hot, 20, { speedMs: 0 });
    expect(early.engineStatus).toBe("overheating");
    const late = run(hot, 200, { speedMs: 0 });
    expect(late.engineStatus).toBe("failed");
    expect(late.brokenPart).toBe("radiator_hose");
  });

  it("cools faster with the hood open", () => {
    const hot = { ...initialMechanics(), temperature01: 0.9 };
    const closed = run(hot, 30, { throttle01: 0, speedMs: 0 });
    const open = run(hot, 30, { throttle01: 0, speedMs: 0, hoodOpen: true });
    expect(open.temperature01).toBeLessThan(closed.temperature01);
  });

  it("powerFactor boundaries", () => {
    const s = initialMechanics();
    expect(powerFactor(s)).toBe(1);
    expect(powerFactor({ ...s, temperature01: MECHANICS.OVERHEAT_WARN })).toBe(1);
    expect(powerFactor({ ...s, temperature01: 1 })).toBeCloseTo(MECHANICS.OVERHEAT_POWER_FLOOR);
    expect(powerFactor({ ...s, engineStatus: "failed" })).toBe(0);
    expect(powerFactor({ ...s, fuel01: 0 })).toBe(0);
  });

  it("impacts add damage above the free threshold only", () => {
    const small = stepMechanics(initialMechanics(), { ...BASE, impactImpulse: MECHANICS.IMPACT_FREE_THRESHOLD });
    expect(small.damage01).toBe(0);
    const big = stepMechanics(initialMechanics(), { ...BASE, impactImpulse: MECHANICS.CRASH_IMPULSE });
    expect(big.damage01).toBeGreaterThan(0);
  });

  it("seeded crash failures are deterministic", () => {
    const outcomes = Array.from({ length: 30 }, (_, i) => applyCrash(initialMechanics(), 99, i));
    const again = Array.from({ length: 30 }, (_, i) => applyCrash(initialMechanics(), 99, i));
    expect(outcomes).toEqual(again);
    expect(outcomes.some((o) => o.engineStatus === "failed")).toBe(true);
    expect(outcomes.some((o) => o.engineStatus === "ok")).toBe(true);
  });
});
