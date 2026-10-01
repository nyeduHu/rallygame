// lib/game/race/checkpointLogic.test.ts
import { describe, expect, it } from "vitest";
import { stepCheckpoints, type CheckpointState } from "./checkpointLogic";

const start: CheckpointState = { progressS: 0, nextCheckpoint: 0, finished: false };

describe("stepCheckpoints", () => {
  it("crosses ordered checkpoints then finishes", () => {
    const first = stepCheckpoints(start, 12, 0, [10], 20);
    expect(first.event).toEqual({ kind: "checkpoint", index: 0 });
    const end = stepCheckpoints(first.state, 22, 0, [10], 20);
    expect(end.event?.kind).toBe("finish");
    expect(end.state.finished).toBe(true);
  });

  it("ignores teleport jumps and off-line crossings", () => {
    expect(stepCheckpoints(start, 500, 0, [10], 600).state).toBe(start);
    expect(stepCheckpoints(start, 12, 999, [10], 20).event).toBeNull();
  });
});
