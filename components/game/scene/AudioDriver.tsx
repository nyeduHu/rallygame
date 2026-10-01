// components/game/scene/AudioDriver.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AudioEngine } from "@/lib/game/audio/audioEngine";
import { DRIVETRAIN } from "@/lib/game/constants";
import type { SessionView } from "@/lib/game/sessionView";
import { useGameStore } from "@/lib/game/store";
import { windshieldRuntime } from "@/lib/game/weather/runtime";
import { GameSession } from "@/lib/game/session";

const WIPER_THUNK_PHASES = [0, 0.5] as const;

interface AudioDriverProps {
  session: SessionView;
}

/**
 * Starts audio on the first user gesture, mutes with M, and feeds the engine, tyre, rain and
 * wiper sounds every frame. Co-drivers hear the same mix, driven by the snapshot-based session.
 * @param props - Session for engine and tyre values.
 * @returns Nothing visible.
 */
export function AudioDriver({ session }: AudioDriverProps) {
  const audio = useMemo(() => new AudioEngine(), []);
  const lastPhase = useRef(0);

  useEffect(() => {
    const start = (): void => audio.start();
    const onKey = (event: KeyboardEvent): void => {
      audio.start();
      if (event.code === "KeyM" && !event.repeat) audio.toggleMute();
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", onKey);
      audio.dispose();
    };
  }, [audio]);

  useFrame(() => {
    if (!audio.started) return;
    const { mech, weather, wipersOn } = useGameStore.getState();
    const { vehicle } = session;
    const rpm01 = vehicle.drivetrain.rpm / DRIVETRAIN.REDLINE_RPM;
    const local = session instanceof GameSession;
    audio.update({
      rpm: vehicle.drivetrain.rpm,
      throttle01: local ? session.vehicle.drivetrain.throttle : rpm01,
      running: mech.engineStatus !== "failed" && mech.fuel01 > 0,
      slipSpeed: local ? session.vehicle.slipSpeed : 0,
      speedMs: vehicle.forwardSpeed,
      surface: local ? session.vehicle.surface : "gravel",
      rain01: weather.kind === "rain" ? weather.intensity : 0,
    });
    if (wipersOn) {
      const phase = windshieldRuntime.wipePhase;
      const crossed = WIPER_THUNK_PHASES.some((edge) => (lastPhase.current < edge && phase >= edge) || (edge === 0 && phase < lastPhase.current));
      if (crossed) audio.wiperThunk();
      lastPhase.current = phase;
    }
  });

  return null;
}
