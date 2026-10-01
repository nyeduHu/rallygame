// lib/net/snapshotBuffer.test.ts
import { describe, expect, it } from "vitest";
import type { TeamSnapshot } from "./protocol";
import { SnapshotBuffer } from "./snapshotBuffer";

/** Builds a snapshot at x moving at 10 m/s along x. */
function snap(x: number): TeamSnapshot {
  return {
    teamId: "t", seq: 1, p: [x, 0, 0], q: [0, 0, 0, 1], v: [10, 0, 0], steer: 0, wheelSpin: 0,
    wipers: false, visibility: 1, checkpoint: 0, progress01: 0, status: "racing",
  };
}

describe("SnapshotBuffer", () => {
  it("interpolates the midpoint", () => {
    const buffer = new SnapshotBuffer();
    buffer.add("t", snap(0), 1000);
    buffer.add("t", snap(10), 1100);
    expect(buffer.sample("t", 1050)?.p[0]).toBeCloseTo(5);
  });

  it("clamps extrapolation to 250 ms", () => {
    const buffer = new SnapshotBuffer();
    buffer.add("t", snap(0), 1000);
    expect(buffer.sample("t", 5000)?.p[0]).toBeCloseTo(2.5);
  });
});
