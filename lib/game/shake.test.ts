// lib/game/shake.test.ts
import { describe, expect, it } from "vitest";
import { decayShake, shakeStrength } from "./shake";

describe("shake", () => {
  it("scales with impulse and is clamped to 0..1", () => {
    expect(shakeStrength(0)).toBe(0);
    expect(shakeStrength(5000)).toBeLessThan(shakeStrength(15000));
    expect(shakeStrength(1e9)).toBe(1);
  });

  it("decays monotonically toward zero", () => {
    expect(decayShake(1, 0.1)).toBeLessThan(1);
    expect(decayShake(1, 10)).toBeLessThan(0.001);
  });
});
