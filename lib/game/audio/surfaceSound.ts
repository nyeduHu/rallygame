// lib/game/audio/surfaceSound.ts
import { ENGINE_SOUND } from "../constants";
import { clamp } from "../math";
import type { SurfaceKind } from "../stage/types";
import { createNoise } from "./engineSound";

/**
 * Tyre noise loudness from sideways slip and rolling speed on a surface.
 * @param slipSpeed - Sideways slip in m/s.
 * @param speedMs - Car speed in m/s.
 * @param surface - Surface under the wheels, or null when airborne.
 * @returns Gain 0..1.
 */
export function slipToGain(slipSpeed: number, speedMs: number, surface: SurfaceKind | null): number {
  if (surface === null) return 0;
  const slip = clamp(slipSpeed / ENGINE_SOUND.GRAVEL_FULL_SLIP_MS, 0, 1) * ENGINE_SOUND.GRAVEL_MAX_GAIN;
  const roll = clamp(Math.abs(speedMs) / ENGINE_SOUND.GRAVEL_FULL_SLIP_MS, 0, 1) * ENGINE_SOUND.GRAVEL_ROLL_GAIN;
  return (slip + roll) * (surface === "grass" ? ENGINE_SOUND.GRASS_FACTOR : 1);
}

/** Band-passed noise that follows how hard the tyres are working on the ground. */
export class SurfaceSound {
  private readonly gain: GainNode;

  /**
   * @param ctx - Audio context.
   * @param destination - Node to connect to.
   */
  constructor(private readonly ctx: AudioContext, destination: AudioNode) {
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = ENGINE_SOUND.GRAVEL_BAND_HZ;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    createNoise(ctx).connect(band).connect(this.gain).connect(destination);
  }

  /**
   * Follows tyre slip.
   * @param slipSpeed - Sideways slip in m/s.
   * @param speedMs - Car speed in m/s.
   * @param surface - Surface under the wheels.
   */
  update(slipSpeed: number, speedMs: number, surface: SurfaceKind | null): void {
    this.gain.gain.setTargetAtTime(slipToGain(slipSpeed, speedMs, surface), this.ctx.currentTime, ENGINE_SOUND.SMOOTHING_S);
  }
}
