// lib/game/remoteSession.test.ts
import { describe, expect, it } from "vitest";
import type { TeamSnapshot } from "../net/protocol";
import { RemoteSession } from "./remoteSession";
import { generateStage } from "./stage/generateStage";

const POSE: TeamSnapshot = {
  teamId: "t", seq: 1, p: [10, 2, 30], q: [0, 0, 0, 1], v: [0, 0, 20], steer: 0.5, wheelSpin: 0,
  wipers: false, visibility: 1, checkpoint: 0, progress01: 0, status: "racing",
};

describe("RemoteSession", () => {
  it("follows the snapshot pose and derives dashboard values", () => {
    const session = new RemoteSession(generateStage(7));
    session.applyPose(POSE, 0.1);
    expect(session.renderPosition.toArray()).toEqual([10, 2, 30]);
    expect(session.vehicle.forwardSpeed).toBeCloseTo(20);
    expect(session.vehicle.steer).toBe(0.5);
    expect(session.vehicle.drivetrain.reverse).toBe(false);
    expect(session.vehicle.wheels[0].spinAngle).toBeGreaterThan(0);
  });
});
