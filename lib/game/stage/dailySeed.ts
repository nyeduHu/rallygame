// lib/game/stage/dailySeed.ts
import { SEED } from "../constants";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Stable seed for a UTC calendar day: FNV-1a over `YYYY-MM-DD`, reduced to the seed range.
 * @param dateUtc - Any instant; only its UTC date matters.
 * @returns Seed in [0, SEED.MAX_RANDOM_SEED).
 */
export function dailySeed(dateUtc: Date): number {
  const day = dateUtc.toISOString().slice(0, 10);
  let hash = FNV_OFFSET;
  for (let i = 0; i < day.length; i++) {
    hash ^= day.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash % SEED.MAX_RANDOM_SEED;
}
