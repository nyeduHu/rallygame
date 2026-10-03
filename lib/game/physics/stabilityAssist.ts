// lib/game/physics/stabilityAssist.ts
import { clamp, smoothstep } from "../math";
import { getActiveTuning } from "../tuning";

/**
 * Counter-steer assist for keyboard driving. When the car travels at an angle to where it points
 * (the rear has stepped out), it adds steering toward the direction of travel, which is what a
 * driver does by hand with a wheel and what is hard to do with digital keys.
 * Disabled while the handbrake is held so deliberate slides stay under the player's control, and
 * while reversing.
 * @param lateralSpeed - Velocity along the car's left axis (m/s).
 * @param forwardSpeed - Velocity along the car's forward axis (m/s).
 * @param handbrake - Whether the handbrake is on.
 * @returns Extra steering input in -1..1 (positive = right, like the driver's steer).
 */
export function counterSteerAssist(lateralSpeed: number, forwardSpeed: number, handbrake: boolean): number {
  const { STEERING } = getActiveTuning();
  if (handbrake || forwardSpeed <= 0 || Math.hypot(lateralSpeed, forwardSpeed) < STEERING.ASSIST_MIN_SPEED) return 0;
  // Positive sideslip means the velocity points to the car's left (nose rotated right), so the
  // correction is a left steer (negative input).
  const sideslip = Math.atan2(lateralSpeed, forwardSpeed);
  const strength = smoothstep(STEERING.ASSIST_START, STEERING.ASSIST_FULL, Math.abs(sideslip));
  return clamp(-sideslip * STEERING.ASSIST_GAIN, -STEERING.ASSIST_MAX, STEERING.ASSIST_MAX) * strength;
}
