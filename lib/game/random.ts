// lib/game/random.ts
import { SEED } from "./constants";

/** Deterministic pseudo-random generator; same seed yields the same sequence on every client. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next: () => number;
  /** Uniform float in [min, max). */
  range: (min: number, max: number) => number;
  /** Uniform integer in [min, max] inclusive. */
  int: (min: number, max: number) => number;
  /** True with the given probability. */
  chance: (probability: number) => boolean;
  /** -1 or 1 with equal probability. */
  sign: () => number;
  /** Picks an item using relative weights. */
  weighted: <T extends { weight: number }>(items: ReadonlyArray<T>) => T;
}

const UINT32_RANGE = 4294967296;

/**
 * Creates a mulberry32 generator. Chosen because it is tiny, fast and has no
 * platform-dependent behaviour, which matters for shared multiplayer seeds.
 * @param seed - 32-bit integer seed.
 * @returns A seeded Rng.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  /**
   * Advances the generator.
   * @returns Uniform float in [0, 1).
   */
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };

  /**
   * @param min - Lower bound.
   * @param max - Upper bound (exclusive).
   * @returns Uniform float in range.
   */
  const range = (min: number, max: number): number => min + (max - min) * next();

  /**
   * @param min - Lower bound inclusive.
   * @param max - Upper bound inclusive.
   * @returns Uniform integer in range.
   */
  const int = (min: number, max: number): number => Math.floor(range(min, max + 1));

  /**
   * @param probability - Probability of returning true.
   * @returns Random boolean.
   */
  const chance = (probability: number): boolean => next() < probability;

  /**
   * @returns -1 or 1.
   */
  const sign = (): number => (next() < 0.5 ? -1 : 1);

  /**
   * @param items - Items with relative weights.
   * @returns The chosen item.
   */
  const weighted = <T extends { weight: number }>(items: ReadonlyArray<T>): T => {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = next() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  };

  return { next, range, int, chance, sign, weighted };
}

/**
 * Derives an independent sub-seed so separate generation passes (road, props, retries)
 * do not shift each other's random sequences when one pass changes.
 * @param seed - Base seed.
 * @param salt - Pass-specific salt.
 * @returns Mixed 32-bit seed.
 */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt, SEED.ATTEMPT_SALT)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Parses a seed from a URL query value. Only plain non-negative integers are accepted
 * so a seed string always maps to exactly one stage.
 * @param raw - Raw query value.
 * @returns The seed, or null when missing/invalid.
 */
export function parseSeed(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const pattern = new RegExp(`^\\d{1,${SEED.MAX_SEED_DIGITS}}$`);
  if (!pattern.test(value)) return null;
  return Number.parseInt(value, 10);
}

/**
 * Creates a fresh random seed for a new stage.
 * @returns Integer seed.
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * SEED.MAX_RANDOM_SEED);
}
