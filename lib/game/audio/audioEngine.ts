// lib/game/audio/audioEngine.ts
import { ENGINE_SOUND } from "../constants";
import { createNoise, EngineSound } from "./engineSound";
import { bindAudioEvents, thud } from "./events";
import { SurfaceSound } from "./surfaceSound";

/** Owns the AudioContext, master volume/mute and every sound source. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: EngineSound | null = null;
  private surface: SurfaceSound | null = null;
  private rainGain: GainNode | null = null;
  private unbind: (() => void) | null = null;
  private muted = readMuted();

  /** Creates (or resumes) the context; must run from a user gesture. */
  start(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : ENGINE_SOUND.MASTER_GAIN;
      this.master.connect(this.ctx.destination);
      this.engine = new EngineSound(this.ctx, this.master);
      this.surface = new SurfaceSound(this.ctx, this.master);
      // Rain heard through the cabin: low-passed noise.
      const rain = this.ctx.createBiquadFilter();
      rain.type = "lowpass";
      rain.frequency.value = ENGINE_SOUND.RAIN_LOWPASS_HZ;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;
      createNoise(this.ctx).connect(rain).connect(this.rainGain).connect(this.master);
      this.unbind = bindAudioEvents(this.ctx, this.master);
    }
    void this.ctx.resume();
  }

  /** @returns True once the context exists. */
  get started(): boolean {
    return this.ctx !== null;
  }

  /** Toggles mute and remembers the choice. */
  toggleMute(): void {
    this.muted = !this.muted;
    try {
      localStorage.setItem(ENGINE_SOUND.STORAGE_KEY, this.muted ? "1" : "0");
    } catch {
      // Storage may be blocked; muting still works for this session.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : ENGINE_SOUND.MASTER_GAIN, this.ctx.currentTime, ENGINE_SOUND.SMOOTHING_S);
  }

  /** @returns Whether sound is muted. */
  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * Per-frame update.
   * @param state - Engine, tyre and weather values.
   */
  update(state: { rpm: number; throttle01: number; running: boolean; slipSpeed: number; speedMs: number; surface: "gravel" | "grass" | null; rain01: number }): void {
    if (!this.ctx) return;
    this.engine?.update(state.rpm, state.throttle01, state.running);
    this.surface?.update(state.slipSpeed, state.speedMs, state.surface);
    this.rainGain?.gain.setTargetAtTime(state.rain01 * ENGINE_SOUND.RAIN_GAIN, this.ctx.currentTime, ENGINE_SOUND.SMOOTHING_S);
  }

  /** Soft thunk for a wiper blade reaching the end of its sweep. */
  wiperThunk(): void {
    if (this.ctx && this.master) thud(this.ctx, this.master, ENGINE_SOUND.WIPER_THUNK_GAIN);
  }

  /** Releases listeners and closes the context. */
  dispose(): void {
    this.unbind?.();
    void this.ctx?.close();
    this.ctx = null;
  }
}

/** @returns The saved mute preference (false when storage is unavailable). */
function readMuted(): boolean {
  try {
    return localStorage.getItem(ENGINE_SOUND.STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
