// lib/game/stage/paceNotes.test.ts
import { describe, expect, test } from "vitest";
import { generateStage } from "./generateStage";
import { generatePaceNotes } from "./paceNotes";
import type { CornerInfo, StageData } from "./types";

const VALIDATION_SEED_COUNT = 200;
const DISTANCE_STEP = 10;

/**
 * Builds a minimal complete stage fixture around selected corner metadata.
 * @param corners - Corner list used by the pace-note scenario.
 * @param startS - Race start arc length.
 * @param finishS - Finish arc length.
 * @returns Stage data with inert terrain and prop collections.
 */
function makeStage(corners: CornerInfo[], startS = 0, finishS = 1000): StageData {
  return {
    seed: 1,
    attempt: 0,
    samples: [],
    length: finishS,
    corners,
    terrain: { originX: 0, originZ: 0, cellSize: 1, cols: 0, rows: 0, heights: new Float32Array() },
    startS,
    finishS,
    checkpointS: [],
    trees: [],
    rocks: [],
    grass: [],
    barriers: [],
    cones: [],
    spawn: { x: 0, y: 0, z: 0, heading: 0 },
  };
}

/**
 * Constructs corner metadata with controlled radius, direction, and position.
 * @param radius - Corner radius in metres.
 * @param startS - Corner entry arc length.
 * @param endS - Corner exit arc length.
 * @param direction - Corner turn direction.
 * @param classId - Generated corner class.
 * @returns Corner fixture.
 */
function makeCorner(
  radius: number,
  startS: number,
  endS: number,
  direction: 1 | -1 = 1,
  classId: CornerInfo["classId"] = "medium",
): CornerInfo {
  return { startS, endS, apexS: (startS + endS) / 2, radius, angle: 0.5, direction, classId };
}

describe("generatePaceNotes", () => {
  /**
   * Confirms a repeated generation from the same stage yields identical calls.
   */
  function preservesDeterminism(): void {
    const stage = generateStage(847291);

    expect(generatePaceNotes(stage)).toEqual(generatePaceNotes(stage));
  }

  /**
   * Checks each seeded stage produces complete, sorted, distance-aligned calls.
   */
  function generatesCompleteNotesForTwoHundredSeeds(): void {
    for (let seed = 1; seed <= VALIDATION_SEED_COUNT; seed += 1) {
      const stage = generateStage(seed);
      const notes = generatePaceNotes(stage);
      const cornerNotes = notes.filter((note) => note.kind === "corner" || note.kind === "hairpin");

      expect(cornerNotes).toHaveLength(stage.corners.length);
      expect(cornerNotes.map((note) => note.cornerIndex).sort((first, second) => first - second))
        .toEqual(stage.corners.map((_, index) => index));
      expect(notes[0].kind).toBe("straight");
      expect(notes[notes.length - 1].kind).toBe("finish");
      for (let index = 0; index < notes.length; index += 1) {
        expect(notes[index].distanceToNext % DISTANCE_STEP).toBe(0);
        if (index > 0) expect(notes[index].atS).toBeGreaterThan(notes[index - 1].atS);
      }
    }
  }

  /**
   * Checks the configured severity bands at each boundary and immediately below it.
   */
  function classifiesSeverityBandBoundaries(): void {
    const cases = [
      { radius: 139.99, severity: 2 },
      { radius: 140, severity: 1 },
      { radius: 79.99, severity: 3 },
      { radius: 80, severity: 2 },
      { radius: 39.99, severity: 4 },
      { radius: 40, severity: 3 },
    ] as const;

    for (const [index, scenario] of cases.entries()) {
      const notes = generatePaceNotes(makeStage([makeCorner(scenario.radius, 200, 220)], 0, 400));
      const cornerNote = notes.find((note) => note.cornerIndex === 0);

      expect(cornerNote?.severity, `case ${index}`).toBe(scenario.severity);
    }
  }

  /**
   * Checks adjacent same-direction corners retain both calls and mark the first as tightening.
   */
  function mergesTighteningModifier(): void {
    const stage = makeStage([
      makeCorner(100, 300, 320),
      makeCorner(50, 350, 370),
    ]);
    const notes = generatePaceNotes(stage);
    const firstCorner = notes.find((note) => note.cornerIndex === 0);

    expect(firstCorner?.modifiers).toContain("tightens");
    expect(notes.filter((note) => note.cornerIndex >= 0)).toHaveLength(2);
  }

  test("is deterministic", preservesDeterminism);
  test("generates complete notes for seeds 1 through 200", generatesCompleteNotesForTwoHundredSeeds);
  test("classifies severity boundaries", classifiesSeverityBandBoundaries);
  test("marks a linked same-direction change as tightening", mergesTighteningModifier);
});
