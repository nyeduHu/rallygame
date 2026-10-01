// lib/game/onfoot/onFootController.ts
import { ON_FOOT } from "../constants";
import { wrapAngle } from "../math";

/** Held on-foot movement keys. */
export interface OnFootInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}

/**
 * Converts held keys and the view yaw into a horizontal velocity in world space.
 * Diagonals are normalised so they are not faster than straight movement.
 * @param input - Held keys.
 * @param yaw - View yaw in radians (0 faces world +z, increasing turns left).
 * @returns World-space velocity in m/s.
 */
export function desiredVelocity(input: OnFootInput, yaw: number): { x: number; z: number } {
  const forward = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const strafe = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const length = Math.hypot(forward, strafe);
  if (length === 0) return { x: 0, z: 0 };
  const speed = ON_FOOT.WALK_SPEED_MS * (input.sprint ? ON_FOOT.SPRINT_MULTIPLIER : 1);
  const f = forward / length;
  const s = strafe / length;
  // Forward is (sin yaw, cos yaw); left is (cos yaw, -sin yaw).
  return {
    x: (Math.sin(yaw) * f + Math.cos(yaw) * s) * speed,
    z: (Math.cos(yaw) * f - Math.sin(yaw) * s) * speed,
  };
}

/**
 * Whether a ledge of the given height can be stepped onto.
 * @param height - Ledge height in metres.
 * @returns True when within the step height.
 */
export function canStepUp(height: number): boolean {
  return height <= ON_FOOT.STEP_HEIGHT;
}

/**
 * Whether a slope is walkable.
 * @param normalY - Y component of the unit surface normal (1 = flat).
 * @returns True when the slope angle is within the limit.
 */
export function slopeWalkable(normalY: number): boolean {
  return Math.acos(Math.min(1, Math.max(-1, normalY))) <= ON_FOOT.MAX_SLOPE_RADIANS;
}

/**
 * Whether the car is slow enough to get out.
 * @param speedMs - Car speed in m/s.
 * @returns True when exiting is allowed.
 */
export function canExit(speedMs: number): boolean {
  return Math.abs(speedMs) < ON_FOOT.EXIT_MAX_SPEED_MS;
}

/**
 * Door position for a role in world space.
 * @param car - Car position and yaw (rotation about +y).
 * @param role - Seat role; the driver sits on the car's +x side.
 * @returns World-space door point on the ground plane.
 */
export function doorPosition(car: { x: number; z: number; yaw: number }, role: "driver" | "codriver"): { x: number; z: number } {
  const side = role === "driver" ? 1 : -1;
  const lx = side * ON_FOOT.DOOR_OFFSET_X;
  const lz = ON_FOOT.DOOR_OFFSET_Z;
  // Car-local (x = left, z = forward) to world with yaw about +y.
  return {
    x: car.x + lx * Math.cos(car.yaw) + lz * Math.sin(car.yaw),
    z: car.z - lx * Math.sin(car.yaw) + lz * Math.cos(car.yaw),
  };
}

/**
 * Whether a player stands close enough to their door to get back in.
 * @param player - Player ground position.
 * @param door - Door position.
 * @returns True within the enter radius.
 */
export function canReenter(player: { x: number; z: number }, door: { x: number; z: number }): boolean {
  return Math.hypot(player.x - door.x, player.z - door.z) <= ON_FOOT.ENTER_RADIUS_M;
}

/**
 * Updates a yaw with a mouse delta, wrapping so the player can turn full circle.
 * @param yaw - Current yaw.
 * @param delta - Change in radians.
 * @returns New wrapped yaw.
 */
export function turn(yaw: number, delta: number): number {
  return wrapAngle(yaw + delta);
}
