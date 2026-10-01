// components/game/scene/SimulationDriver.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { SIMULATION, UNITS } from "@/lib/game/constants";
import type { KeyboardControls } from "@/lib/game/input/keyboardControls";
import type { GameSession } from "@/lib/game/session";
import { useGameStore } from "@/lib/game/store";
import type { Role } from "@/lib/game/roles";
import { FRAME_PRIORITY } from "./framePriority";

interface SimulationDriverProps {
  session: GameSession;
  keyboard: KeyboardControls;
  role: Role;
  solo: boolean;
}

/**
 * Advances the fixed-step simulation every rendered frame and publishes HUD data
 * at a throttled rate (immediately on race phase changes).
 * @param props - Session and keyboard source.
 * @returns Nothing visible.
 */
export function SimulationDriver({ session, keyboard, role, solo }: SimulationDriverProps) {
  const sincePublish = useRef(0);
  const lastPhase = useRef(session.race.currentPhase);

  useFrame((_, delta) => {
    const { soloActiveRole } = useGameStore.getState();
    const activeRole = solo ? soloActiveRole : role;
    session.advance(delta, keyboard.read(activeRole === "driver"));

    sincePublish.current += delta;
    const phase = session.race.currentPhase;
    if (sincePublish.current < SIMULATION.HUD_PUBLISH_INTERVAL && phase === lastPhase.current) return;
    sincePublish.current = 0;
    lastPhase.current = phase;

    const { vehicle } = session;
    const store = useGameStore.getState();
    store.setTelemetry({
      speedKmh: Math.abs(vehicle.forwardSpeed) * UNITS.MS_TO_KMH,
      rpm: vehicle.drivetrain.rpm,
      gear: vehicle.drivetrain.gearLabel,
      surface: vehicle.surface,
    });
    store.setRace(session.race.snapshot());
  }, FRAME_PRIORITY.SIMULATION);

  return null;
}
