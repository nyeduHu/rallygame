// components/game/scene/MechanicsDriver.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { DRIVETRAIN, MECHANICS, SIMULATION } from "@/lib/game/constants";
import { gameEvents } from "@/lib/game/events";
import type { GameSession } from "@/lib/game/session";
import { useGameStore } from "@/lib/game/store";
import { applyCrash, initialMechanics, stepMechanics, type MechanicalState } from "@/lib/game/vehicle/mechanics";
import { useNetStore } from "@/lib/net/netStore";
import type { TeamSnapshot } from "@/lib/net/protocol";
import { FRAME_PRIORITY } from "./framePriority";

interface MechanicsDriverProps {
  session: GameSession;
  /** Online: follow the server's mechanics for this team instead of simulating locally. */
  ownTeamId?: string;
}

/**
 * Maps a server snapshot entry to a mechanical state.
 * @param team - Own team snapshot.
 * @param previous - Previous state (supplies fields the snapshot omits).
 * @returns Mechanical state mirroring the server.
 */
function mechanicsFromSnapshot(team: TeamSnapshot, previous: MechanicalState): MechanicalState {
  return {
    ...previous,
    fuel01: team.fuel ?? previous.fuel01,
    engineHealth01: team.engineHealth ?? previous.engineHealth01,
    temperature01: team.temperature ?? previous.temperature01,
    damage01: team.damage ?? previous.damage01,
    engineStatus: team.engineStatus ?? previous.engineStatus,
    brokenPart: team.brokenPart ?? null,
  };
}

/**
 * Keeps `store.mech` current: solo runs the shared mechanics model locally; online mirrors the
 * server's authoritative state. Also raises warning events on status changes.
 * @param props - Session and optional own team id.
 * @returns Nothing visible.
 */
export function MechanicsDriver({ session, ownTeamId }: MechanicsDriverProps) {
  const crashIndex = useRef(0);
  const sincePublish = useRef(0);
  const lastStatus = useRef(initialMechanics().engineStatus);
  /** Authoritative local copy; the store only receives it at HUD rate. */
  const current = useRef<MechanicalState>(initialMechanics());

  useFrame((_, delta) => {
    const store = useGameStore.getState();
    sincePublish.current += delta;
    let mech = current.current;

    if (store.online) {
      const team = ownTeamId ? useNetStore.getState().snapshot?.teams.find((entry) => entry.teamId === ownTeamId) : undefined;
      if (team) mech = mechanicsFromSnapshot(team, mech);
    } else if (store.race.phase === "running") {
      const dt = Math.min(delta, SIMULATION.MAX_STEPS_PER_FRAME * SIMULATION.FIXED_TIMESTEP);
      const { vehicle } = session;
      const forced = store.overheatForced;
      const impacts = session.consumeImpacts();
      mech = stepMechanics(mech, {
        throttle01: forced ? 1 : vehicle.drivetrain.throttle,
        rpm01: forced ? 1 : vehicle.drivetrain.rpm / DRIVETRAIN.REDLINE_RPM,
        speedMs: forced ? 0 : Math.abs(vehicle.forwardSpeed),
        surface: vehicle.surface,
        impactImpulse: impacts.solidImpulse,
        ambientTemp01: MECHANICS.DEFAULT_AMBIENT,
        hoodOpen: store.hoodOpen,
        dt,
      });
      if (impacts.solidImpulse >= MECHANICS.CRASH_IMPULSE) {
        mech = applyCrash(mech, session.stage.seed, crashIndex.current);
        crashIndex.current += 1;
        gameEvents.emit("crash", { impulse: impacts.solidImpulse });
      }
    }

    if (mech.engineStatus !== lastStatus.current) {
      if (mech.engineStatus === "overheating") gameEvents.emit("overheatWarning", { temperature01: mech.temperature01 });
      else if (mech.engineStatus === "failed") gameEvents.emit("engineFailed", { brokenPart: mech.brokenPart });
      else gameEvents.emit("overheatCleared", {});
      lastStatus.current = mech.engineStatus;
    }

    const statusChanged = mech.engineStatus !== store.mech.engineStatus;
    current.current = mech;
    if (!statusChanged && sincePublish.current < SIMULATION.HUD_PUBLISH_INTERVAL) return;
    sincePublish.current = 0;
    store.setMech(mech);
  }, FRAME_PRIORITY.SIMULATION);

  return null;
}
