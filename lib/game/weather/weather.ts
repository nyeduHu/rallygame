// lib/game/weather/weather.ts
import { SEED, WEATHER, WIPERS } from "../constants";
import { clamp, smoothstep } from "../math";
import { createRng, deriveSeed } from "../random";

export type WeatherKind = "clear" | "rain";

/** Current precipitation; fog/snow are future kinds. */
export interface WeatherState {
  kind: WeatherKind;
  /** 0..1. */
  intensity: number;
}

/** Windshield state; 0 is clear glass, 1 is opaque. */
export interface WindshieldState {
  dirt: number;
}

/** When and how hard it rains during a stage. */
export interface WeatherPlan {
  kind: WeatherKind;
  intensity: number;
  startSeconds: number;
}

/**
 * Integrates dirt over dt: rain adds (more at speed), wipers remove. Frame-rate independent.
 * @param w - Current windshield state.
 * @param weather - Current weather.
 * @param wipersOn - Whether the wipers are running.
 * @param speedMs - Car speed in m/s.
 * @param dt - Step length in seconds.
 * @returns New windshield state.
 */
export function stepWindshield(
  w: WindshieldState,
  weather: WeatherState,
  wipersOn: boolean,
  speedMs: number,
  dt: number,
): WindshieldState {
  const rainRate =
    weather.kind === "rain"
      ? weather.intensity * (WEATHER.DIRT_RATE_PER_SECOND_AT_FULL_INTENSITY + Math.abs(speedMs) * WEATHER.SPEED_DIRT_BONUS_PER_MS)
      : 0;
  const wipeRate = wipersOn ? WIPERS.WIPE_RATE_PER_SECOND : 0;
  return { dirt: clamp(w.dirt + (rainRate - wipeRate) * dt, 0, 1) };
}

/**
 * Converts dirt to how much the driver can see.
 * @param w - Windshield state.
 * @returns Visibility from MIN_VISIBILITY to 1.
 */
export function visibility(w: WindshieldState): number {
  const seen = 1 - smoothstep(WEATHER.DIRT_VISIBLE_START, 1, w.dirt);
  return Math.max(WEATHER.MIN_VISIBILITY, seen);
}

/**
 * Chooses the weather for a stage. The tutorial stage is always clear.
 * @param seed - Room/stage seed.
 * @param stageIndex - Stage number, 0 for the tutorial.
 * @returns Deterministic plan.
 */
export function weatherPlan(seed: number, stageIndex: number): WeatherPlan {
  if (stageIndex === 0) return { kind: "clear", intensity: 0, startSeconds: 0 };
  const rng = createRng(deriveSeed(seed, SEED.WEATHER_SALT + stageIndex));
  if (!rng.chance(WEATHER.PLANNED_RAIN_CHANCE)) return { kind: "clear", intensity: 0, startSeconds: 0 };
  return {
    kind: "rain",
    intensity: rng.range(WEATHER.PLANNED_RAIN_MIN_INTENSITY, 1),
    startSeconds: rng.range(
      WEATHER.PLANNED_RAIN_START_MIN_SECONDS,
      WEATHER.PLANNED_RAIN_START_MIN_SECONDS + WEATHER.PLANNED_RAIN_START_SPAN_SECONDS,
    ),
  };
}

/**
 * Weather at a race time given a plan.
 * @param plan - Stage weather plan.
 * @param raceSeconds - Seconds since the race started.
 * @returns Weather state.
 */
export function weatherAt(plan: WeatherPlan, raceSeconds: number): WeatherState {
  return raceSeconds >= plan.startSeconds && plan.kind === "rain"
    ? { kind: "rain", intensity: plan.intensity }
    : { kind: "clear", intensity: 0 };
}
