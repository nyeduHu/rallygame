// lib/game/map/networkMap.test.ts
import { describe, expect, it } from "vitest";
import type { RoadSample } from "../stage/types";
import { computeFit, createReveal, finishDirection, fitPoint, isRevealedAt, revealAll, revealedRuns, updateReveal } from "./networkMap";

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

  it("revealAll shows every road, including the far end of a dead end", () => {
    const reveal = createReveal(STAGE);
    revealAll(reveal);
    expect(isRevealedAt(reveal.paths[1], reveal.revealed[1], 390)).toBe(true);
    expect(reveal.count).toBe(STAGE.samples.length + STAGE.branches[0].samples.length);
    expect(revealedRuns(reveal.paths[0], reveal.revealed[0])).toHaveLength(1);
  });

  it("fits the network and points toward the finish", () => {
    const reveal = createReveal(STAGE);
    const fit = computeFit(reveal.paths, { width: 1000, height: 400 }, 20);
    const a = fitPoint(fit, 0, 0, 0, 0);
    const b = fitPoint(fit, 0, 1000, 1000, 0);
    expect(b.y).toBeLessThan(a.y);
    // +x is the car's left when facing +z, so it maps to the left of the screen.
    expect(fitPoint(fit, 50, 0, 0, 0).x).toBeLessThan(a.x);
    const direction = finishDirection({ x: 0, z: 0 }, { x: 0, z: 500 });
    expect(direction.distance).toBe(500);
    expect(direction.far.x).toBeCloseTo(0);
    expect(direction.far.z).toBeGreaterThan(500);
  });
});

describe("NEXT map orientation matches the pace notes", () => {
  it("draws a left-hand corner curving to the left of the road ahead", async () => {
    const { generateStage } = await import("../stage/generateStage");
    const { poseAt } = await import("../stage/roadIndex");
    const { projectNextPoint } = await import("./mapRenderer");
    const stage = generateStage(3);
    const corner = stage.corners.find((c) => c.direction === 1 && c.angle > 0.8);
    if (!corner) throw new Error("expected a left corner");
    const start = poseAt(stage.samples, corner.startS);
    const car = { x: start.x, z: start.z, s: corner.startS, heading: start.heading };
    const exit = poseAt(stage.samples, corner.endS);
    const viewport = { width: 600, height: 400 };
    const point = projectNextPoint({ x: exit.x, z: exit.z, s: corner.endS, heading: exit.heading }, car, viewport, 0.5, 0.72);
    // The road bends left, so its far end must be left of the car marker on screen.
    expect(point.x).toBeLessThan(viewport.width / 2);
  }, 60_000);
});
