// lib/game/stage/maze.test.ts
import { describe, expect, it } from "vitest";
import { MAZE } from "../constants";
import { generateStage } from "./generateStage";
import { NetworkIndex } from "./networkIndex";
import { poseAt } from "./roadIndex";

const SEEDS = 30;
const JOIN_TOLERANCE_M = 1.5;

describe("maze stage", () => {
  it("has many dead-end roads that all start on an existing road", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const stage = generateStage(seed);
      expect(stage.branches.length, `seed ${seed}`).toBeGreaterThanOrEqual(MAZE.MIN_BRANCH_ROADS);
      expect(stage.walls.length).toBeGreaterThan(0);
      stage.branches.forEach((branch, i) => {
        expect(branch.id).toBe(i);
        expect(branch.kind).toBe("dead_end");
        const first = branch.samples[0];
        const others = new NetworkIndex(stage.samples, stage.branches.filter((other) => other.id !== branch.id));
        const hit = others.nearest(first.x, first.z, JOIN_TOLERANCE_M * 4);
        expect(hit && hit.distance < JOIN_TOLERANCE_M, `seed ${seed} branch ${i}`).toBe(true);
        const fork = poseAt(stage.samples, branch.forkS);
        expect(fork).toBeDefined();
      });
    }
  }, 300_000);

  it("keeps the route on the reference road and in the walls' doors", () => {
    const stage = generateStage(7);
    const index = new NetworkIndex(stage.samples, stage.branches);
    for (const sample of stage.samples) {
      const hit = index.nearest(sample.x, sample.z, 5);
      expect(hit?.branchId ?? null).toBeNull();
    }
    for (const wall of stage.walls) {
      for (const sample of stage.samples) {
        const inside = Math.abs(sample.x - wall.x) < wall.halfX && Math.abs(sample.z - wall.z) < wall.halfZ;
        expect(inside).toBe(false);
      }
    }
  });
});
