// lib/game/stage/validateStage.test.ts
import { describe, expect, it } from "vitest";
import { CHECKPOINT, DIFFICULTY, ROAD } from "../constants";
import { findValidLayout } from "./generateStage";
import type { CornerInfo } from "./types";
import {
  checkpointsReachable,
  difficultyScore,
  fairDifficulty,
  noImpossibleTurns,
  noOverlap,
  readableFromNotes,
  startFinishConnected,
  validateCandidate,
  type StageCandidate,
} from "./validateStage";

/** Builds a corner with sensible defaults. */
function corner(over: Partial<CornerInfo>): CornerInfo {
  return { startS: 100, endS: 140, apexS: 120, radius: 60, angle: 1, direction: 1, classId: "medium", ...over };
}

/** A straight 2.6 km road with the given corners. */
function stage(corners: CornerInfo[], checkpointS = [550, 1050, 1550, 2050]): StageCandidate {
  const samples = Array.from({ length: 1301 }, (_, i) => ({ x: 0, y: 0, z: i * ROAD.SAMPLE_SPACING, s: i * ROAD.SAMPLE_SPACING, heading: 0 }));
  return { samples, corners, startS: 40, finishS: 2550, checkpointS, length: 2600 };
}

describe("stage validation checks", () => {
  it("startFinishConnected rejects gaps", () => {
    expect(startFinishConnected(stage([])).ok).toBe(true);
    const broken = stage([]);
    broken.samples[500] = { ...broken.samples[500], z: broken.samples[500].z + 20 };
    expect(startFinishConnected(broken).ok).toBe(false);
  });

  it("noImpossibleTurns rejects tiny radii and overlapping corners", () => {
    expect(noImpossibleTurns(stage([corner({})])).ok).toBe(true);
    expect(noImpossibleTurns(stage([corner({ radius: ROAD.MIN_RADIUS - 1 })])).ok).toBe(false);
    expect(noImpossibleTurns(stage([corner({}), corner({ startS: 130, endS: 170 })])).ok).toBe(false);
  });

  it("noOverlap rejects a road that folds back on itself", () => {
    const folded = stage([]);
    folded.samples = folded.samples.map((sample) => (sample.s > 600 ? { ...sample, z: 600 - (sample.s - 600), x: 5 } : sample));
    expect(noOverlap(folded).ok).toBe(false);
    expect(noOverlap(stage([])).ok).toBe(true);
  });

  it("checkpointsReachable enforces spacing and hairpin clearance", () => {
    expect(checkpointsReachable(stage([])).ok).toBe(true);
    expect(checkpointsReachable(stage([], [100, 900, 1300, 1700])).ok).toBe(false);
    const hairpin = corner({ classId: "hairpin", apexS: 550 + CHECKPOINT.MIN_DISTANCE_FROM_HAIRPIN_APEX - 5, startS: 530, endS: 570, radius: 14 });
    expect(checkpointsReachable(stage([hairpin])).ok).toBe(false);
  });

  it("readableFromNotes passes for a normal stage", () => {
    expect(readableFromNotes(stage([corner({})])).ok).toBe(true);
  });

  it("fairDifficulty rejects too easy and too hard stages and close stage-0 hairpins", () => {
    const easy = stage([corner({ classId: "fast", radius: 150 })]);
    expect(fairDifficulty(easy, 0).ok).toBe(false);
    const window = DIFFICULTY.STAGE[0];
    const medium = Array.from({ length: Math.ceil(window.min / 2) }, (_, i) => corner({ startS: 100 + i * 100, endS: 140 + i * 100, apexS: 120 + i * 100 }));
    expect(difficultyScore(stage(medium))).toBeGreaterThanOrEqual(window.min);
    expect(fairDifficulty(stage(medium), 0).ok).toBe(true);
    const twoHairpins = [...medium, corner({ classId: "hairpin", apexS: 800, startS: 780, endS: 820, radius: 14 }), corner({ classId: "hairpin", apexS: 900, startS: 880, endS: 920, radius: 14 })];
    expect(fairDifficulty(stage(twoHairpins), 0).ok).toBe(false);
  });
});

describe("layout generation", () => {
  it("every seed 1..1000 yields a layout that passes all checks within the attempt cap", () => {
    const histogram: Record<number, number> = {};
    for (let seed = 1; seed <= 1000; seed++) {
      const { layout, attempt } = findValidLayout(seed, 0);
      histogram[attempt] = (histogram[attempt] ?? 0) + 1;
      expect(attempt).toBeLessThan(ROAD.MAX_GENERATION_ATTEMPTS);
      const length = layout.samples[layout.samples.length - 1].s;
      const startS = ROAD.START_LINE_OFFSET;
      const finishS = length - ROAD.FINISH_LINE_OFFSET;
      const checkpointS = Array.from({ length: ROAD.CHECKPOINT_COUNT }, (_, k) => startS + ((finishS - startS) * (k + 1)) / (ROAD.CHECKPOINT_COUNT + 1));
      expect(validateCandidate({ samples: layout.samples, corners: layout.corners, startS, finishS, checkpointS, length }, 0).ok).toBe(true);
    }
    expect(Object.keys(histogram).length).toBeGreaterThan(0);
  }, 600_000);
});
