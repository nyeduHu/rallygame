// lib/game/stage/pitStop.test.ts
import { describe, expect, it } from "vitest";
import { PIT, ROAD } from "../constants";
import { generateStage } from "./generateStage";
import { isInsidePitBox } from "./pitStop";
import { RoadIndex } from "./roadIndex";

const SEED_COUNT = 200;
const ROAD_EDGE = ROAD.WIDTH / 2 + ROAD.SHOULDER_WIDTH;

describe("pit placement", () => {
  it("is found for seeds 1..200, on a straight in the band, beside the road, clear of props", () => {
    for (let seed = 1; seed <= SEED_COUNT; seed++) {
      const stage = generateStage(seed);
      const pit = stage.pit;
      expect(pit, `seed ${seed}`).not.toBeNull();
      if (!pit) continue;
      const span = stage.finishS - stage.startS;
      const fraction = (pit.s - stage.startS) / span;
      expect(fraction).toBeGreaterThanOrEqual(PIT.BAND_START);
      expect(fraction).toBeLessThanOrEqual(PIT.BAND_END);
      // The whole box keeps at least the fallback clearance from every corner.
      for (const corner of stage.corners) {
        const nearest = Math.max(corner.startS - (pit.s + pit.halfLength), pit.s - pit.halfLength - corner.endS);
        expect(nearest, `seed ${seed}`).toBeGreaterThanOrEqual(PIT.FALLBACK_CLEARANCE_M - 1);
      }
      // Box lies outside the road edge, on the right of travel.
      const index = new RoadIndex(stage.samples);
      const projection = index.nearest(pit.x, pit.z, 60);
      expect(Math.abs(projection?.lateral ?? 0)).toBeGreaterThan(ROAD_EDGE);
      for (const prop of [...stage.trees, ...stage.rocks, ...stage.grass, ...stage.barriers, ...stage.cones]) {
        expect(isInsidePitBox(pit, prop.x, prop.z)).toBe(false);
      }
    }
  }, 180_000);

  it("isInsidePitBox respects heading and margin", () => {
    const pit = { s: 0, x: 0, y: 0, z: 0, heading: 0, halfLength: 7, halfWidth: 3.5, pump: { x: 0, z: 0 } };
    expect(isInsidePitBox(pit, 0, 6)).toBe(true);
    expect(isInsidePitBox(pit, 0, 8)).toBe(false);
    expect(isInsidePitBox(pit, 0, 8, 2)).toBe(true);
    const turned = { ...pit, heading: Math.PI / 2 };
    expect(isInsidePitBox(turned, 6, 0)).toBe(true);
    expect(isInsidePitBox(turned, 0, 6)).toBe(false);
  });
});
