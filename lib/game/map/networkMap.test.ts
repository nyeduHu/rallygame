// lib/game/map/networkMap.test.ts
import { describe, expect, it } from "vitest";
import type { RoadSample } from "../stage/types";
import { computeFit, createReveal, finishDirection, fitPoint, isRevealedAt, revealedRuns, updateReveal } from "./networkMap";

/** Straight road along +z with 2 m samples. */
function line(x: number, length: number): RoadSample[] {
  return Array.from({ length: length / 2 + 1 }, (_, i) => ({ x, y: 0, z: i * 2, s: i * 2, heading: 0 }));
}

/** Side road running east from (0, 400). */
function spur(length: number): RoadSample[] {
  return Array.from({ length: length / 2 + 1 }, (_, i) => ({ x: i * 2, y: 0, z: 400, s: i * 2, heading: Math.PI / 2 }));
}

const STAGE = {
  samples: line(0, 1000),
  branches: [{ id: 1, kind: "dead_end" as const, forkS: 400, joinS: null, samples: spur(400), corners: [], length: 400 }],
};

describe("network map fog of war", () => {
  it("reveals only road near the car and keeps it revealed", () => {
    const reveal = createReveal(STAGE);
    expect(updateReveal(reveal, 0, 100, 150)).toBe(true);
    const runs = revealedRuns(reveal.paths[0], reveal.revealed[0]);
    expect(runs).toHaveLength(1);
    expect(runs[0][runs[0].length - 1].z).toBeLessThanOrEqual(250);
    expect(isRevealedAt(reveal.paths[0], reveal.revealed[0], 100)).toBe(true);
    expect(isRevealedAt(reveal.paths[0], reveal.revealed[0], 800)).toBe(false);
    // Moving on does not hide what was seen; nothing new is reported when standing still.
    updateReveal(reveal, 0, 600, 150);
    expect(isRevealedAt(reveal.paths[0], reveal.revealed[0], 100)).toBe(true);
    expect(updateReveal(reveal, 0, 600, 150)).toBe(false);
  });

  it("does not show a dead end beyond the view radius until the car goes in", () => {
    const reveal = createReveal(STAGE);
    updateReveal(reveal, 0, 400, 150);
    const branchRuns = revealedRuns(reveal.paths[1], reveal.revealed[1]);
    expect(branchRuns.flat().length).toBeGreaterThan(0);
    expect(isRevealedAt(reveal.paths[1], reveal.revealed[1], 390)).toBe(false);
    updateReveal(reveal, 380, 400, 150);
    expect(isRevealedAt(reveal.paths[1], reveal.revealed[1], 390)).toBe(true);
  });

  it("fits the network and points toward the finish", () => {
    const reveal = createReveal(STAGE);
    const fit = computeFit(reveal.paths, { width: 1000, height: 400 }, 20);
    const a = fitPoint(fit, 0, 0, 0, 0);
    const b = fitPoint(fit, 0, 1000, 1000, 0);
    expect(b.y).toBeLessThan(a.y);
    const direction = finishDirection({ x: 0, z: 0 }, { x: 0, z: 500 });
    expect(direction.distance).toBe(500);
    expect(direction.far.x).toBeCloseTo(0);
    expect(direction.far.z).toBeGreaterThan(500);
  });
});
