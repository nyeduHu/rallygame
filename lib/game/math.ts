// lib/game/math.ts
/**
 * Hermite smoothstep.
 * @param edge0 - Lower edge.
 * @param edge1 - Upper edge.
 * @param x - Input.
 * @returns Smoothed 0..1.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Clamps a number.
 * @param value - Input.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns Clamped value.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Linear interpolation.
 * @param a - Start.
 * @param b - End.
 * @param t - Fraction.
 * @returns Interpolated value.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Moves a value toward a target by at most maxDelta, used for input smoothing.
 * @param current - Current value.
 * @param target - Target value.
 * @param maxDelta - Maximum change.
 * @returns New value.
 */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

/**
 * Wraps an angle to (-PI, PI].
 * @param angle - Angle in radians.
 * @returns Wrapped angle.
 */
export function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let wrapped = angle % twoPi;
  if (wrapped > Math.PI) wrapped -= twoPi;
  if (wrapped <= -Math.PI) wrapped += twoPi;
  return wrapped;
}
