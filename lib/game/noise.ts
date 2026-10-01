// lib/game/noise.ts
import { deriveSeed } from "./random";

/**
 * Hashes integer lattice coordinates to [0, 1). Integer hashing (rather than a
 * permutation table) keeps the noise deterministic and allocation-free.
 * @param x - Lattice x.
 * @param y - Lattice y.
 * @param seed - Noise seed.
 * @returns Pseudo-random value in [0, 1).
 */
function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Quintic fade so gradients are continuous across lattice cells (no visible creases in terrain).
 * @param t - Fraction in [0, 1].
 * @returns Smoothed fraction.
 */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * 2D value noise.
 * @param x - Sample x in lattice units.
 * @param y - Sample y in lattice units.
 * @param seed - Noise seed.
 * @returns Value in [-1, 1].
 */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return (top + (bottom - top) * fy) * 2 - 1;
}

/** Fractal noise configuration. */
export interface FbmOptions {
  wavelength: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
}

/**
 * Fractal Brownian motion over value noise. Each octave gets its own derived seed
 * so octaves do not correlate.
 * @param x - World x.
 * @param y - World y (z in 3D).
 * @param seed - Base seed.
 * @param options - Octave configuration.
 * @returns Value roughly in [-1, 1].
 */
export function fbm2D(x: number, y: number, seed: number, options: FbmOptions): number {
  let amplitude = 1;
  let frequency = 1 / options.wavelength;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < options.octaves; octave++) {
    sum += amplitude * valueNoise2D(x * frequency, y * frequency, deriveSeed(seed, octave + 1));
    norm += amplitude;
    amplitude *= options.persistence;
    frequency *= options.lacunarity;
  }
  return sum / norm;
}
