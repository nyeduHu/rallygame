// lib/net/clockSync.test.ts
import { describe, expect, it } from "vitest";
import { calculateClockOffset } from "./clockSync";

describe("calculateClockOffset", () => {
  it("returns the median offset", () => {
    const offset = calculateClockOffset([
      { t0: 0, serverNow: 1050, rtt: 100 },
      { t0: 0, serverNow: 1050, rtt: 100 },
      { t0: 0, serverNow: 9999, rtt: 100 },
    ]);
    expect(offset).toBe(1000);
  });
});
