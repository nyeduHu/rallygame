// server/race/penalties.test.ts
import { describe, expect, it } from "vitest";
import { navMistakeSeconds, PENALTY } from "../../lib/game/race/penalties";
import type { CornerInfo } from "../../lib/game/stage/types";
import { PenaltyLedger } from "./penalties";

const CORNER = { startS: 100, endS: 140, apexS: 120, radius: 30, angle: 1, direction: 1, classId: "tight" } as unknown as CornerInfo;

describe("PenaltyLedger", () => {
  it("scales navigation penalties between the min and max", () => {
    expect(navMistakeSeconds(0)).toBe(PENALTY.NAV_MISTAKE_MIN_SECONDS);
    expect(navMistakeSeconds(100)).toBe(PENALTY.NAV_MISTAKE_MAX_SECONDS);
  });

  it("charges a crash and each object once", () => {
    const ledger = new PenaltyLedger();
    ledger.addCrash();
    ledger.addObjectHit(3);
    ledger.addObjectHit(3);
    expect(ledger.crashes).toBe(1);
    expect(ledger.penaltyMs).toBe((PENALTY.CRASH_SECONDS + PENALTY.SMALL_MISTAKE_SECONDS) * 1000);
  });

  it("flags a navigation error after the grace period near a corner, once per cooldown", () => {
    const ledger = new PenaltyLedger();
    let now = 0;
    let total = 0;
    for (let i = 0; i < 100; i++) {
      now += 100;
      total += ledger.trackOffRoad(20, 50, [CORNER], 0.1, now);
    }
    expect(ledger.navErrors).toBe(1);
    expect(total).toBeGreaterThanOrEqual(PENALTY.NAV_MISTAKE_MIN_SECONDS * 1000);
  });

  it("ignores off-road time with no corner ahead or on the road", () => {
    const ledger = new PenaltyLedger();
    for (let i = 0; i < 100; i++) ledger.trackOffRoad(20, 500, [CORNER], 0.1, i * 100);
    for (let i = 0; i < 100; i++) ledger.trackOffRoad(1, 50, [CORNER], 0.1, i * 100);
    expect(ledger.navErrors).toBe(0);
  });
});
