// lib/game/audio/events.ts
import { ENGINE_SOUND } from "../constants";
import { clamp } from "../math";
import { gameEvents } from "../events";
import { createNoise } from "./engineSound";

/**
 * Collision thud loudness from impulse.
 * @param impulse - Impact impulse in N·s.
 * @returns Gain 0..THUD_GAIN.
 */
export function impulseToGain(impulse: number): number {
  return clamp(impulse / ENGINE_SOUND.THUD_FULL_IMPULSE, 0.15, 1) * ENGINE_SOUND.THUD_GAIN;
}

/**
 * Plays a short noise burst through a low-pass (a muffled thud).
 * @param ctx - Audio context.
 * @param destination - Output node.
 * @param gainValue - Peak gain.
 */
function thud(ctx: AudioContext, destination: AudioNode, gainValue: number): void {
  const source = createNoise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 400;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + ENGINE_SOUND.THUD_SECONDS);
  source.connect(filter).connect(gain).connect(destination);
  source.stop(now + ENGINE_SOUND.THUD_SECONDS);
}

/**
 * Plays a tone burst.
 * @param ctx - Audio context.
 * @param destination - Output node.
 * @param startOffset - Seconds from now.
 * @param hz - Frequency.
 * @param seconds - Length.
 * @param type - Waveform.
 */
function tone(ctx: AudioContext, destination: AudioNode, startOffset: number, hz: number, seconds: number, type: OscillatorType): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = hz;
  const gain = ctx.createGain();
  const start = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(ENGINE_SOUND.BEEP_GAIN, start);
  gain.gain.setValueAtTime(0, start + seconds);
  osc.connect(gain).connect(destination);
  osc.start(start);
  osc.stop(start + seconds);
}

/**
 * Connects game events to sounds: crash thud, overheat beeps, engine-failure buzz.
 * @param ctx - Audio context.
 * @param destination - Output node.
 * @returns Unsubscribe function.
 */
export function bindAudioEvents(ctx: AudioContext, destination: AudioNode): () => void {
  const offs = [
    gameEvents.on("crash", ({ impulse }) => thud(ctx, destination, impulseToGain(impulse))),
    gameEvents.on("overheatWarning", () => {
      for (let i = 0; i < 3; i++) tone(ctx, destination, i * (ENGINE_SOUND.BEEP_SECONDS + ENGINE_SOUND.BEEP_GAP_SECONDS), ENGINE_SOUND.BEEP_HZ, ENGINE_SOUND.BEEP_SECONDS, "square");
    }),
    gameEvents.on("engineFailed", () => tone(ctx, destination, 0, ENGINE_SOUND.BUZZ_HZ, ENGINE_SOUND.BUZZ_SECONDS, "sawtooth")),
  ];
  return () => offs.forEach((off) => off());
}

export { thud };
