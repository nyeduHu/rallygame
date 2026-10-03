// lib/game/stage/networkIndex.test.ts
import { describe, expect, it } from "vitest";
import { NetworkIndex } from "./networkIndex";
import type { RoadBranch, RoadSample } from "./types";

/** A straight road along +z with 2 m samples. */
function line(x: number, z0: number, length: number): RoadSample[] {
  const count = Math.round(length / 2) + 1;
  return Array.from({ length: count }, (_, i) => ({ x, y: 0, z: z0 + i * 2, s: i * 2, heading: 0 }));
}

/**
 * @param id - Road id.
 * @param samples - Centreline.
 * @param progress - Progress of the first sample (rises along the road).
 * @param pendantFrom - Dead-end depth of the first sample (rises along the road), or null for none.
 * @returns A branch.
 */
function branch(id: number, samples: RoadSample[], progress: number, pendantFrom: number | null): RoadBranch {
  return {
    id,
    samples,
    corners: [],
    length: samples[samples.length - 1].s,
    progress: samples.map((sample) => progress + sample.s),
    pendant: samples.map((sample) => (pendantFrom === null ? 0 : pendantFrom + sample.s)),
    loops: pendantFrom === null,
  };
}

const REFERENCE = line(0, 0, 1000).map((sample) => ({ ...sample, s: sample.z }));
const LOOP = branch(0, line(60, 200, 300), 200, null);
const DEAD_END = branch(1, line(-60, 600, 200), 600, 0);

describe("NetworkIndex", () => {
  const index = new NetworkIndex(REFERENCE, [LOOP, DEAD_END]);

  it("snaps to the reference route when it is nearest", () => {
    const hit = index.nearest(1, 100, 30);
    expect(hit?.branchId).toBeNull();
    expect(hit?.s).toBeCloseTo(100, 0);
  });

  it("reports race progress from the road's own progress values", () => {
    const hit = index.nearest(60, 350, 30);
    expect(hit?.branchId).toBe(0);
    expect(hit?.localS).toBeCloseTo(150, 0);
    expect(hit?.s).toBeCloseTo(350, 0);
    expect(hit?.deadEndDistance).toBe(0);
  });

  it("reports how deep into a dead end the point is", () => {
    const hit = index.nearest(-60, 700, 30);
    expect(hit?.branchId).toBe(1);
    expect(hit?.deadEndDistance).toBeCloseTo(100, 0);
  });

  it("returns null far from every road", () => {
    expect(index.nearest(500, 500, 30)).toBeNull();
  });
});
