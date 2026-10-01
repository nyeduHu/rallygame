// lib/game/race/penalties.ts
import { clamp } from "../math";

/** Penalty ledger constants (spec section 10). */
export const PENALTY = {
  SMALL_MISTAKE_SECONDS: 2,
  NAV_MISTAKE_MIN_SECONDS: 5,
  NAV_MISTAKE_MAX_SECONDS: 15,
  /** Off-road time at which a navigation mistake reaches the maximum penalty. */
  NAV_MISTAKE_FULL_SCALE_SECONDS: 8,
  CRASH_SECONDS: 4,
  /** Off the road corridor longer than this near a corner counts as a navigation mistake. */
  NAV_OFFROAD_GRACE_S: 2,
  /** Corner must start within this distance ahead of the car for the off-road to count. */
  NAV_CORNER_LOOKAHEAD_M: 150,
  NAV_COOLDOWN_S: 20,
  /** An engine that stays failed with no repair progress this long is a DNF. */
  DNF_AFTER_FAILED_SECONDS: 180,
  /** Largest impulse a client may report (clamped server-side). */
  MAX_IMPACT_IMPULSE: 60000,
} as const;

/**
 * Penalty for a navigation mistake, scaled by how long the car was off the road.
 * @param offRoadSeconds - Continuous off-road time that triggered the mistake.
 * @returns Penalty seconds in [NAV_MISTAKE_MIN_SECONDS, NAV_MISTAKE_MAX_SECONDS].
 */
export function navMistakeSeconds(offRoadSeconds: number): number {
  const scale = clamp(offRoadSeconds / PENALTY.NAV_MISTAKE_FULL_SCALE_SECONDS, 0, 1);
  return PENALTY.NAV_MISTAKE_MIN_SECONDS + (PENALTY.NAV_MISTAKE_MAX_SECONDS - PENALTY.NAV_MISTAKE_MIN_SECONDS) * scale;
}
