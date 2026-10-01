// lib/game/stage/generateStage.test.ts
import { describe, expect, test } from "vitest";
import { ROAD } from "../constants";
import { generateStage } from "./generateStage";

const FIRST_SEED = 1;
const SECOND_SEED = 2;
const STAGE_SAMPLE_INDEX = 100;
const VALIDATION_SEED_COUNT = 200;

describe("generateStage", () => {
  /**
   * Confirms each seeded generation pass produces the same shared stage data.
   */
  function preservesDeterminism(): void {
    const first = generateStage(847291);
    const second = generateStage(847291);

    expect(second.samples).toEqual(first.samples);
    expect(second.checkpointS).toEqual(first.checkpointS);
    expect(second.corners).toEqual(first.corners);
  }

  /**
   * Confirms generated race bounds and checkpoints remain valid across seeds.
   */
  function generatesValidBoundsForTwoHundredSeeds(): void {
    for (let seed = FIRST_SEED; seed <= VALIDATION_SEED_COUNT; seed += 1) {
      const stage = generateStage(seed);

      expect(stage.finishS).toBeGreaterThan(stage.startS);
      expect(stage.corners.length).toBeGreaterThanOrEqual(ROAD.MIN_CORNERS);
      expect(stage.corners.filter((corner) => corner.classId === "hairpin" || corner.classId === "tight").length)
        .toBeGreaterThanOrEqual(ROAD.MIN_SEVERE_CORNERS);
      for (let checkpointIndex = 0; checkpointIndex < stage.checkpointS.length; checkpointIndex += 1) {
        const checkpoint = stage.checkpointS[checkpointIndex];

        expect(checkpoint).toBeGreaterThan(stage.startS);
        expect(checkpoint).toBeLessThan(stage.finishS);
        if (checkpointIndex > 0) {
          expect(checkpoint).toBeGreaterThan(stage.checkpointS[checkpointIndex - 1]);
        }
      }
    }
  }

  /**
   * Confirms distinct seeds produce distinct road sample data.
   */
  function changesSamplesForDifferentSeeds(): void {
    const first = generateStage(FIRST_SEED);
    const second = generateStage(SECOND_SEED);

    expect(second.samples[STAGE_SAMPLE_INDEX]).not.toEqual(first.samples[STAGE_SAMPLE_INDEX]);
  }

  test("is deterministic for a seed", preservesDeterminism);
  test("generates valid bounds and ordered checkpoints for seeds 1 through 200", generatesValidBoundsForTwoHundredSeeds);
  test("changes road samples for different seeds", changesSamplesForDifferentSeeds);
});
