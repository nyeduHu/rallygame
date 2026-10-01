// lib/game/audio/engineSound.ts
import { ENGINE_SOUND } from "../constants";
import { clamp } from "../math";

/**
 * Oscillator frequency for an engine speed.
 * @param rpm - Engine rpm.
 * @returns Fundamental frequency in Hz.
 */
export function rpmToHz(rpm: number): number {
  return ENGINE_SOUND.BASE_HZ + Math.max(0, rpm) * ENGINE_SOUND.HZ_PER_RPM;
}

/**
 * Engine loudness from throttle: a quiet idle that swells under load.
 * @param throttle01 - Throttle 0..1.
 * @returns Gain 0..1.
 */
export function throttleToGain(throttle01: number): number {
  return ENGINE_SOUND.IDLE_GAIN + ENGINE_SOUND.THROTTLE_GAIN * clamp(throttle01, 0, 1);
}

/**
 * Creates a looping white-noise buffer source.
 * @param ctx - Audio context.
 * @returns Started noise source.
 */
export function createNoise(ctx: AudioContext): AudioBufferSourceNode {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic LCG so the noise is the same every run (no Math.random in audio setup).
  let state = 12345;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[i] = (state / 0xffffffff) * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start();
  return source;
}

/** Two detuned oscillators through a low-pass plus a noise rumble. */
export class EngineSound {
  private readonly saw: OscillatorNode;
  private readonly square: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;

  /**
   * @param ctx - Audio context.
   * @param destination - Node to connect to.
   */
  constructor(private readonly ctx: AudioContext, destination: AudioNode) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.saw = ctx.createOscillator();
    this.saw.type = "sawtooth";
    this.square = ctx.createOscillator();
    this.square.type = "square";
    this.square.detune.value = ENGINE_SOUND.SQUARE_DETUNE_CENTS;
    const squareGain = ctx.createGain();
    squareGain.gain.value = ENGINE_SOUND.SQUARE_GAIN;
    this.saw.connect(this.filter);
    this.square.connect(squareGain).connect(this.filter);
    this.filter.connect(this.gain).connect(destination);

    const rumble = ctx.createBiquadFilter();
    rumble.type = "lowpass";
    rumble.frequency.value = ENGINE_SOUND.RUMBLE_LOWPASS_HZ;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = ENGINE_SOUND.RUMBLE_GAIN;
    createNoise(ctx).connect(rumble).connect(rumbleGain).connect(destination);

    this.saw.start();
    this.square.start();
  }

  /**
   * Follows the engine state.
   * @param rpm - Engine rpm.
   * @param throttle01 - Throttle 0..1.
   * @param running - False when the engine is dead or out of fuel.
   */
  update(rpm: number, throttle01: number, running: boolean): void {
    const now = this.ctx.currentTime;
    const hz = rpmToHz(rpm);
    this.saw.frequency.setTargetAtTime(hz, now, ENGINE_SOUND.SMOOTHING_S);
    this.square.frequency.setTargetAtTime(hz, now, ENGINE_SOUND.SMOOTHING_S);
    this.filter.frequency.setTargetAtTime(ENGINE_SOUND.LOWPASS_BASE_HZ + rpm * ENGINE_SOUND.LOWPASS_PER_RPM_HZ, now, ENGINE_SOUND.SMOOTHING_S);
    this.gain.gain.setTargetAtTime(running ? throttleToGain(throttle01) : 0, now, ENGINE_SOUND.SMOOTHING_S);
  }
}
