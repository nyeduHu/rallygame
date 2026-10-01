// lib/game/stage/network.test.ts
import { describe, expect, it } from "vitest";
import { NETWORK, ROAD } from "../constants";
import { generateStage } from "./generateStage";
import { NetworkIndex } from "./networkIndex";
import { poseAt } from "./roadIndex";
import { networkFair } from "./validateStage";

const SEEDS = 60;
const JUNCTION_TOLERANCE_M = 4;
const HEIGHT_TOLERANCE_M = 0.5;

describe("road network generation", () => {
  it("seeds 1..60 have fair, connected, deterministic forks", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const stage = generateStage(seed);
      expect(networkFair(stage).ok, `seed ${seed}`).toBe(true);
      expect(stage.branches.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      for (const branch of stage.branches) {
        const fork = poseAt(stage.samples, branch.forkS);
        const first = branch.samples[0];
        expect(Math.hypot(first.x - fork.x, first.z - fork.z)).toBeLessThan(JUNCTION_TOLERANCE_M);
        expect(Math.abs(first.y - fork.y)).toBeLessThan(HEIGHT_TOLERANCE_M);
        if (branch.joinS !== null) {
          const join = poseAt(stage.samples, branch.joinS);
          const last = branch.samples[branch.samples.length - 1];
          expect(Math.hypot(last.x - join.x, last.z - join.z)).toBeLessThan(JUNCTION_TOLERANCE_M);
          expect(Math.abs(last.y - join.y)).toBeLessThan(HEIGHT_TOLERANCE_M);
        }
      }
    }
    expect(generateStage(5).branches).toEqual(generateStage(5).branches);
  }, 300_000);

  it("a car on an alternative makes progress between its fork and join, and a dead end holds the fork", () => {
    const stage = generateStage(3);
    const index = new NetworkIndex(stage.samples, stage.branches);
    const alternative = stage.branches.find((branch) => branch.kind === "alternative");
    const deadEnd = stage.branches.find((branch) => branch.kind === "dead_end");
    if (!alternative || !deadEnd || alternative.joinS === null) throw new Error("expected both kinds");
    const mid = alternative.samples[Math.floor(alternative.samples.length / 2)];
    const onAlternative = index.nearest(mid.x, mid.z, ROAD.WIDTH);
    expect(onAlternative?.branchId).toBe(alternative.id);
    expect(onAlternative?.s).toBeGreaterThan(alternative.forkS);
    expect(onAlternative?.s).toBeLessThan(alternative.joinS);
    const deep = deadEnd.samples[deadEnd.samples.length - 1];
    const onDeadEnd = index.nearest(deep.x, deep.z, ROAD.WIDTH);
    expect(onDeadEnd?.branchId).toBe(deadEnd.id);
    expect(onDeadEnd?.s).toBe(deadEnd.forkS);
    expect(onDeadEnd?.deadEndDistance).toBeGreaterThan(NETWORK.WRONG_WAY_GRACE_M);
  });
});
