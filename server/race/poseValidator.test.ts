// server/race/poseValidator.test.ts
import { describe, expect, it } from "vitest";
import type { PoseReport } from "../../lib/net/protocol";
import { validatePose } from "./poseValidator";

/** Builds a pose at x with forward speed v. */
function pose(seq: number, x: number, v = 20): PoseReport {
  return { seq, epoch: 0, clientTimeMs: 0, p: [x, 0, 0], q: [0, 0, 0, 1], v: [v, 0, 0], steer: 0, wheelSpin: 0, susp: [0, 0, 0, 0] };
}

describe("validatePose", () => {
  const first = { report: pose(1, 0), atMs: 0 };

  it("accepts plausible motion", () => {
    expect(validatePose(pose(2, 1), first, 50, 3)).toBeNull();
  });

  it("rejects a 500 m teleport", () => {
    expect(validatePose(pose(2, 500), first, 50, 3)).toBe("teleport");
  });

  it("accepts a jump after a reset epoch bump", () => {
    expect(validatePose({ ...pose(2, 500), epoch: 1 }, first, 50, 3)).toBeNull();
  });

  it("rejects stale sequence, non-finite, overspeed and off-road", () => {
    expect(validatePose(pose(1, 1), first, 50, 3)).toBe("stale_seq");
    expect(validatePose(pose(2, Number.NaN), first, 50, 3)).toBe("non_finite");
    expect(validatePose(pose(2, 1, 200), first, 50, 3)).toBe("too_fast");
    expect(validatePose(pose(2, 1), first, 50, 500)).toBe("off_road");
  });
});
