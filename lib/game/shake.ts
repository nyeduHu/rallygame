// lib/game/shake.ts
import { FX } from "./constants";
import { clamp } from "./math";

/**
 * Shake strength (0..1) caused by an impact.
 * @param impulse - Impact impulse in N·s.
 * @returns Strength where 1 is the full shake.
 */
export function shakeStrength(impulse: number): number {
  return clamp(impulse / FX.SHAKE_FULL_IMPULSE, 0, 1);
}

/**
 * Exponentially decays a shake value.
 * @param current - Current strength 0..1.
 * @param dt - Seconds.
 * @returns Decayed strength.
 */
export function decayShake(current: number, dt: number): number {
  return current * Math.exp(-FX.SHAKE_DECAY_PER_S * dt);
}

/** @returns True when the user asked the system for reduced motion (shake is then disabled). */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Mutable shake state read by the camera rig. */
export const shakeState = { strength: 0 };

/**
 * Adds shake for an impact (keeps the larger of the current and new strength).
 * @param impulse - Impact impulse in N·s.
 */
export function addShake(impulse: number): void {
  shakeState.strength = Math.max(shakeState.strength, shakeStrength(impulse));
}
