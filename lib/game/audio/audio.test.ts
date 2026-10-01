// lib/game/audio/audio.test.ts
import { describe, expect, it } from "vitest";
import { ENGINE_SOUND } from "../constants";
import { rpmToHz, throttleToGain } from "./engineSound";
import { impulseToGain } from "./events";
import { slipToGain } from "./surfaceSound";

describe("audio mappings", () => {
  it("rpmToHz rises with rpm", () => {
    expect(rpmToHz(0)).toBe(ENGINE_SOUND.BASE_HZ);
    expect(rpmToHz(6000)).toBeGreaterThan(rpmToHz(1000));
  });

  it("throttleToGain is quiet at idle and louder under load, clamped", () => {
    expect(throttleToGain(0)).toBe(ENGINE_SOUND.IDLE_GAIN);
    expect(throttleToGain(1)).toBeGreaterThan(throttleToGain(0));
    expect(throttleToGain(5)).toBe(throttleToGain(1));
  });

  it("slipToGain follows slip, is silent in the air and quieter on grass", () => {
    expect(slipToGain(0, 0, null)).toBe(0);
    expect(slipToGain(6, 20, "gravel")).toBeGreaterThan(slipToGain(1, 20, "gravel"));
    expect(slipToGain(6, 20, "grass")).toBeLessThan(slipToGain(6, 20, "gravel"));
  });

  it("impulseToGain grows with impulse and stays within the thud gain", () => {
    expect(impulseToGain(100000)).toBe(ENGINE_SOUND.THUD_GAIN);
    expect(impulseToGain(1000)).toBeLessThan(impulseToGain(10000));
  });
});
