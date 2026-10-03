// lib/game/stage/networkIndex.test.ts
import { describe, expect, it } from "vitest";
import { equivalentS, NetworkIndex } from "./networkIndex";
import type { RoadBranch, RoadSample } from "./types";

/** A straight road along +z with 2 m samples. */
function line(x: number, z0: number, length: number): RoadSample[] {
  const count = Math.round(length / 2) + 1;
  return Array.from({ length: count }, (_, i) => ({ x, y: 0, z: z0 + i * 2, s: i * 2, heading: 0 }));
}

const REFERENCE = line(0, 0, 1000).map((sample) => ({ ...sample, s: sample.z }));
/** Alternative leaving at s=200 and rejoining at s=400 via a 300 m detour to the right. */
const ALTERNATIVE: RoadBranch = { id: 1, kind: "alternative", forkS: 200, joinS: 400, samples: line(60, 200, 300), corners: [], length: 300, rootDistance: 0 };
const DEAD_END: RoadBranch = { id: 2, kind: "dead_end", forkS: 600, joinS: null, samples: line(-60, 600, 200), corners: [], length: 200, rootDistance: 0 };

describe("NetworkIndex", () => {
  const index = new NetworkIndex(REFERENCE, [ALTERNATIVE, DEAD_END]);

  it("snaps to the reference route when it is nearest", () => {
    const hit = index.nearest(1, 100, 30);
    expect(hit?.branchId).toBeNull();
    expect(hit?.s).toBeCloseTo(100, 0);
  });

  it("maps an alternative to equivalent reference progress (slower when longer)", () => {
    const halfway = index.nearest(60, 350, 30);
    expect(halfway?.branchId).toBe(1);
    expect(halfway?.localS).toBeCloseTo(150, 0);
    expect(halfway?.s).toBeCloseTo(300, 0);
    expect(equivalentS(ALTERNATIVE, 300)).toBe(400);
  });

  it("holds progress at the fork on a dead end and reports how far in", () => {
    const hit = index.nearest(-60, 700, 30);
    expect(hit?.branchId).toBe(2);
    expect(hit?.s).toBe(600);
    expect(hit?.deadEndDistance).toBeCloseTo(100, 0);
  });

  it("returns null far from every road", () => {
    expect(index.nearest(500, 500, 30)).toBeNull();
  });
});
