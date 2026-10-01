// lib/game/onfoot/onFootController.test.ts
import { describe, expect, it } from "vitest";
import { ON_FOOT } from "../constants";
import { canExit, canReenter, canStepUp, desiredVelocity, doorPosition, slopeWalkable, turn } from "./onFootController";

const NONE = { forward: false, back: false, left: false, right: false, sprint: false };

describe("onFootController", () => {
  it("moves forward along the yaw and normalises diagonals", () => {
    const forward = desiredVelocity({ ...NONE, forward: true }, 0);
    expect(forward.z).toBeCloseTo(ON_FOOT.WALK_SPEED_MS);
    const diagonal = desiredVelocity({ ...NONE, forward: true, left: true }, 0);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(ON_FOOT.WALK_SPEED_MS);
    const sprint = desiredVelocity({ ...NONE, forward: true, sprint: true }, 0);
    expect(sprint.z).toBeCloseTo(ON_FOOT.WALK_SPEED_MS * ON_FOOT.SPRINT_MULTIPLIER);
    expect(desiredVelocity(NONE, 1)).toEqual({ x: 0, z: 0 });
  });

  it("limits step height and slope", () => {
    expect(canStepUp(ON_FOOT.STEP_HEIGHT)).toBe(true);
    expect(canStepUp(ON_FOOT.STEP_HEIGHT + 0.01)).toBe(false);
    expect(slopeWalkable(1)).toBe(true);
    expect(slopeWalkable(Math.cos(ON_FOOT.MAX_SLOPE_RADIANS + 0.05))).toBe(false);
  });

  it("allows exit only when slow and re-entry only near the right door", () => {
    expect(canExit(0.5)).toBe(true);
    expect(canExit(0.7)).toBe(false);
    const car = { x: 10, z: 20, yaw: 0 };
    const driverDoor = doorPosition(car, "driver");
    const passengerDoor = doorPosition(car, "codriver");
    expect(driverDoor.x).toBeGreaterThan(passengerDoor.x);
    expect(canReenter(driverDoor, driverDoor)).toBe(true);
    expect(canReenter(passengerDoor, driverDoor)).toBe(false);
  });

  it("wraps yaw so the player can turn a full circle", () => {
    expect(turn(Math.PI - 0.1, 0.3)).toBeCloseTo(-Math.PI + 0.2);
  });
});
