// lib/game/stage/roadNetwork.test.ts
import { describe, expect, it } from "vitest";
import { ROAD_NETWORK } from "../constants";
import { generateStage } from "./generateStage";
import { NetworkIndex } from "./networkIndex";

const SEEDS = 20;
const JOIN_TOLERANCE_M = 6;

describe("road network stage", () => {
  it("has dead ends, loops and one gate per cut, with every road touching another", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const stage = generateStage(seed);
      expect(stage.checkpointS.length).toBe(ROAD_NETWORK.CUT_COLUMNS.length);
      expect(stage.branches.filter((road) => road.pendant.some((p) => p > 0)).length, `seed ${seed}`).toBeGreaterThanOrEqual(ROAD_NETWORK.MIN_DEAD_ENDS);
      expect(stage.branches.filter((road) => road.loops && road.pendant.every((p) => p === 0)).length, `seed ${seed}`).toBeGreaterThanOrEqual(ROAD_NETWORK.MIN_ROUTE_LOOPS);
      stage.branches.forEach((branch, i) => {
        expect(branch.id).toBe(i);
        const first = branch.samples[0];
        const others = new NetworkIndex(stage.samples, stage.branches.filter((other) => other.id !== branch.id));
        const hit = others.nearest(first.x, first.z, JOIN_TOLERANCE_M * 4);
        expect(hit && hit.distance < JOIN_TOLERANCE_M, `seed ${seed} road ${i} start`).toBe(true);
        if (branch.loops) {
          const last = branch.samples[branch.samples.length - 1];
          const end = others.nearest(last.x, last.z, JOIN_TOLERANCE_M * 4);
          expect(end && end.distance < JOIN_TOLERANCE_M, `seed ${seed} road ${i} end`).toBe(true);
        }
      });
    }
  }, 300_000);

  it("gives the route progress equal to its arc length and every road a finite progress", () => {
    const stage = generateStage(7);
    const index = new NetworkIndex(stage.samples, stage.branches);
    for (const sample of stage.samples) {
      const hit = index.nearest(sample.x, sample.z, 5);
      expect(hit?.branchId ?? null).toBeNull();
      expect(hit?.s).toBeCloseTo(sample.s, 0);
    }
    for (const road of stage.branches) expect(road.progress.every(Number.isFinite)).toBe(true);
  });

  it("a longer loop makes less progress per metre than the route it bypasses", () => {
    const stage = generateStage(3);
    for (const road of stage.branches.filter((r) => r.loops && r.pendant.every((p) => p === 0))) {
      const gained = Math.abs(road.progress[road.progress.length - 1] - road.progress[0]);
      expect(gained).toBeLessThanOrEqual(road.length + 1);
    }
  });
});
