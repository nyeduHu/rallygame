// lib/game/color.ts
import type { PaletteKey } from "./palette";
import { PALETTE } from "./palette";

/** Linear-space RGB triple, matching three.js' expectation for vertex colours. */
export type LinearRgb = [number, number, number];

const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const SRGB_LINEAR_THRESHOLD = 0.04045;
const SRGB_LINEAR_SCALE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_GAMMA = 2.4;

/**
 * Converts one sRGB channel to linear light.
 * @param channel - sRGB channel 0..1.
 * @returns Linear channel 0..1.
 */
function srgbToLinear(channel: number): number {
  return channel <= SRGB_LINEAR_THRESHOLD
    ? channel / SRGB_LINEAR_SCALE
    : Math.pow((channel + SRGB_OFFSET) / (1 + SRGB_OFFSET), SRGB_GAMMA);
}

/**
 * Resolves a palette token to linear RGB for baking into vertex colours.
 * @param key - Palette token.
 * @returns Linear RGB.
 */
export function paletteLinear(key: PaletteKey): LinearRgb {
  const hex = PALETTE[key].replace("#", "");
  const value = Number.parseInt(hex, HEX_RADIX);
  const r = (value >> 16) & CHANNEL_MAX;
  const g = (value >> 8) & CHANNEL_MAX;
  const b = value & CHANNEL_MAX;
  return [srgbToLinear(r / CHANNEL_MAX), srgbToLinear(g / CHANNEL_MAX), srgbToLinear(b / CHANNEL_MAX)];
}

/**
 * Mixes two linear colours.
 * @param a - First colour.
 * @param b - Second colour.
 * @param t - Blend factor.
 * @returns Mixed colour.
 */
export function mixRgb(a: LinearRgb, b: LinearRgb, t: number): LinearRgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
