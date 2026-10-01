// lib/game/weather/weather.test.ts
import { describe, expect, it } from "vitest";
import { stepWindshield, visibility, weatherAt, weatherPlan, type WeatherState } from "./weather";

const RAIN: WeatherState = { kind: "rain", intensity: 1 };
const CLEAR: WeatherState = { kind: "clear", intensity: 0 };

describe("weather", () => {
  it("dirt grows monotonically in rain, stays in 0..1, and wipers reduce it", () => {
    let w = { dirt: 0 };
    let previous = 0;
    for (let i = 0; i < 4000; i++) {
      w = stepWindshield(w, RAIN, false, 20, 0.01);
      expect(w.dirt).toBeGreaterThanOrEqual(previous);
      expect(w.dirt).toBeLessThanOrEqual(1);
      previous = w.dirt;
    }
    expect(w.dirt).toBe(1);
    expect(stepWindshield(w, RAIN, true, 0, 1).dirt).toBeLessThan(1);
    expect(stepWindshield({ dirt: 0.5 }, CLEAR, true, 0, 100).dirt).toBe(0);
  });

  it("is frame-rate independent", () => {
    let coarse = { dirt: 0 };
    let fine = { dirt: 0 };
    for (let i = 0; i < 10; i++) coarse = stepWindshield(coarse, RAIN, false, 10, 1);
    for (let i = 0; i < 1000; i++) fine = stepWindshield(fine, RAIN, false, 10, 0.01);
    expect(fine.dirt).toBeCloseTo(coarse.dirt, 6);
  });

  it("visibility falls with dirt but never reaches zero", () => {
    expect(visibility({ dirt: 0 })).toBe(1);
    expect(visibility({ dirt: 1 })).toBeGreaterThan(0);
    expect(visibility({ dirt: 0.6 })).toBeLessThan(visibility({ dirt: 0.3 }));
  });

  it("plans: stage 0 is clear, later stages are deterministic", () => {
    expect(weatherPlan(123, 0).kind).toBe("clear");
    expect(weatherPlan(123, 1)).toEqual(weatherPlan(123, 1));
    const kinds = new Set(Array.from({ length: 40 }, (_, i) => weatherPlan(i, 1).kind));
    expect(kinds.has("rain")).toBe(true);
    const plan = weatherPlan(0, 0);
    expect(weatherAt(plan, 999).kind).toBe("clear");
  });
});
