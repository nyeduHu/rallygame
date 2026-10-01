// components/game/scene/WeatherDriver.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { SIMULATION, WEATHER, WIPERS } from "@/lib/game/constants";
import type { SessionView } from "@/lib/game/sessionView";
import { useGameStore } from "@/lib/game/store";
import { windshieldRuntime } from "@/lib/game/weather/runtime";
import { stepWindshield, visibility, weatherAt, weatherPlan, type WeatherPlan } from "@/lib/game/weather/weather";
import { useNetStore } from "@/lib/net/netStore";
import { FRAME_PRIORITY } from "./framePriority";

const FORCED_RAIN_PLAN: WeatherPlan = {
  kind: "rain",
  intensity: 1,
  startSeconds: WEATHER.FORCED_RAIN_START_SECONDS,
};
const STAGE_INDEX = 0;

interface WeatherDriverProps {
  session: SessionView;
  ownTeamId?: string;
}

/**
 * Integrates windshield dirt every frame from weather, wipers and speed, and publishes weather
 * and visibility to the HUD store at a throttled rate. Online, the wiper state follows the
 * server snapshot (the click is applied optimistically by the switch).
 * @param props - Session for speed and stage seed; own team id for online wipers.
 * @returns Nothing visible.
 */
export function WeatherDriver({ session, ownTeamId }: WeatherDriverProps) {
  const sincePublish = useRef(0);
  const plan = useRef<WeatherPlan>(weatherPlan(session.stage.seed, STAGE_INDEX));

  useEffect(() => {
    windshieldRuntime.dirt = 0;
    windshieldRuntime.wipePhase = 0;
  }, [session]);

  useFrame((_, delta) => {
    const store = useGameStore.getState();
    const raceSeconds = store.race.phase === "ready" || store.race.phase === "countdown" ? -1 : store.race.elapsed;
    const activePlan = store.rainForced ? FORCED_RAIN_PLAN : plan.current;
    const weather = weatherAt(activePlan, raceSeconds);

    if (store.online && ownTeamId) {
      const team = useNetStore.getState().snapshot?.teams.find((entry) => entry.teamId === ownTeamId);
      if (team && team.wipers !== store.wipersOn) store.setWipersOn(team.wipers);
    }

    const dt = Math.min(delta, SIMULATION.MAX_STEPS_PER_FRAME * SIMULATION.FIXED_TIMESTEP);
    const next = stepWindshield({ dirt: windshieldRuntime.dirt }, weather, store.wipersOn, session.vehicle.forwardSpeed, dt);
    windshieldRuntime.dirt = next.dirt;
    if (store.wipersOn) windshieldRuntime.wipePhase = (windshieldRuntime.wipePhase + dt * WIPERS.SWEEPS_PER_SECOND) % 1;

    sincePublish.current += delta;
    if (sincePublish.current < SIMULATION.HUD_PUBLISH_INTERVAL) return;
    sincePublish.current = 0;
    if (weather.kind !== store.weather.kind || weather.intensity !== store.weather.intensity) store.setWeather(weather);
    store.setVisibility(visibility(next));
  }, FRAME_PRIORITY.SIMULATION);

  return null;
}
