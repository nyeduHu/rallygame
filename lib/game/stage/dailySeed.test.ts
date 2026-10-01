// lib/game/stage/dailySeed.test.ts
import { describe, expect, it } from "vitest";
import { SEED } from "../constants";
import { dailySeed } from "./dailySeed";

describe("dailySeed", () => {
  it("is stable within a UTC day and differs between days", () => {
    const a = dailySeed(new Date("2026-10-01T00:00:00Z"));
    expect(dailySeed(new Date("2026-10-01T23:59:59Z"))).toBe(a);
    expect(dailySeed(new Date("2026-10-02T00:00:00Z"))).not.toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(SEED.MAX_RANDOM_SEED);
  });
});
