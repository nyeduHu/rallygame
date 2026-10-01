// server/race/results.test.ts
import { describe, expect, it } from "vitest";
import { computeTotalMs, formatPenalty, sortResults, type TeamResult } from "./results";

const MS = (m: number, s: number, cs: number): number => (m * 60 + s) * 1000 + cs * 10;

describe("results", () => {
  it("matches the spec example: 08:42.31 + 00:18.00 + 00:42.15 = 09:42.46", () => {
    const total = computeTotalMs(MS(8, 42, 31), MS(0, 18, 0), MS(0, 42, 15));
    expect(formatPenalty(total)).toBe("09:42.46");
  });

  it("sorts finishers before DNF", () => {
    const base = { name: "t", rawMs: 0, penaltyMs: 0, pitMs: 0, damage01: 0, fuel01: 1, navErrors: 0, crashes: 0 };
    const sorted = sortResults([
      { ...base, teamId: "a", status: "dnf", totalMs: 1 },
      { ...base, teamId: "b", status: "finished", totalMs: 99 },
    ] satisfies TeamResult[]);
    expect(sorted[0].teamId).toBe("b");
  });
});
