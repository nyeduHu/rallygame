// components/game/scene/MechanicsDriver.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { DRIVETRAIN, MECHANICS, PIT, SIMULATION } from "@/lib/game/constants";
import { gameEvents } from "@/lib/game/events";
import type { GameSession } from "@/lib/game/session";
import { initialRefuel, stepRefuel } from "@/lib/game/refuel/refuelMachine";
import { isInsidePitBox } from "@/lib/game/stage/pitStop";
import { addShake } from "@/lib/game/shake";
import { mechRuntime } from "@/lib/game/mechRuntime";
import { repairStateFromView } from "@/lib/game/repair/repairMachine";
import { useGameStore } from "@/lib/game/store";
import { applyCrash, initialMechanics, stepMechanics } from "@/lib/game/vehicle/mechanics";
import { useNetStore } from "@/lib/net/netStore";
import { mechanicsFromSnapshot } from "@/lib/net/snapshotMechanics";
import { FRAME_PRIORITY } from "./framePriority";

interface MechanicsDriverProps {
  session: GameSession;
  /** Online: follow the server's mechanics for this team instead of simulating locally. */
  ownTeamId?: string;
}

/**
 * Keeps `store.mech` current: solo runs the shared mechanics model locally; online mirrors the
 * server's authoritative state. Also raises warning events on status changes.
 * @param props - Session and optional own team id.
 * @returns Nothing visible.
 */
export function MechanicsDriver({ session, ownTeamId }: MechanicsDriverProps) {
  const crashIndex = useRef(0);
  const forcedFailure = useRef(false);
  const sincePublish = useRef(0);
  const lastStatus = useRef(initialMechanics().engineStatus);

  useFrame((_, delta) => {
    const store = useGameStore.getState();
    sincePublish.current += delta;
    let mech = mechRuntime.current;

    if (store.online) {
      const team = ownTeamId ? useNetStore.getState().snapshot?.teams.find((entry) => entry.teamId === ownTeamId) : undefined;
      if (team) {
        mech = mechanicsFromSnapshot(team, mech);
        const repair = repairStateFromView(team.repair);
        if (repair) store.setRepair(repair);
        if (team.refuel) store.setRefuel(team.refuel);
        const pitActive = team.status === "pit";
        const pitReady = team.pitReady === true;
        if (pitActive !== store.pitActive || pitReady !== store.pitReady) store.setPit({ pitActive, pitReady });
        if (team.hoodOpen !== undefined && team.hoodOpen !== store.hoodOpen) store.setHoodOpen(team.hoodOpen);
      }
    } else if (store.race.phase === "running") {
      if (store.failPart && !forcedFailure.current) {
        forcedFailure.current = true;
        mech = { ...mech, engineStatus: "failed", brokenPart: store.failPart };
      }
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
      const pit = session.stage.pit;
      if (pit) {
        const position = vehicle.currentPosition;
        const inside = isInsidePitBox(pit, position.x, position.z);
        if (!store.pitActive && inside && Math.abs(vehicle.forwardSpeed) < PIT.MAX_ENTRY_SPEED_MS) {
          store.setPit({ pitActive: true, pitReady: false });
        } else if (store.pitActive && !inside) {
          store.setPit({ pitActive: false, pitReady: false });
          store.setRefuel(initialRefuel());
        }
        if (store.pitActive) {
          mech = { ...mech, fuel01: stepRefuel(store.refuel, mech.fuel01, dt).fuel01 };
          const ready =
            mech.fuel01 >= PIT.MIN_FUEL_TO_RELEASE &&
            mech.engineStatus !== "failed" &&
            !store.hoodOpen &&
            store.footRole === null &&
            store.refuel.kind === "idle";
          if (ready !== store.pitReady) store.setPit({ pitActive: true, pitReady: ready });
        }
      }
      if (impacts.solidImpulse >= MECHANICS.CRASH_IMPULSE) {
        mech = applyCrash(mech, session.stage.seed, crashIndex.current);
        crashIndex.current += 1;
        gameEvents.emit("crash", { impulse: impacts.solidImpulse });
        addShake(impacts.solidImpulse);
      }
    }

    if (mech.engineStatus !== lastStatus.current) {
      if (mech.engineStatus === "overheating") gameEvents.emit("overheatWarning", { temperature01: mech.temperature01 });
      else if (mech.engineStatus === "failed") gameEvents.emit("engineFailed", { brokenPart: mech.brokenPart });
      else gameEvents.emit("overheatCleared", {});
      lastStatus.current = mech.engineStatus;
    }

    const statusChanged = mech.engineStatus !== store.mech.engineStatus;
    mechRuntime.current = mech;
    if (!statusChanged && sincePublish.current < SIMULATION.HUD_PUBLISH_INTERVAL) return;
    sincePublish.current = 0;
    store.setMech(mech);
  }, FRAME_PRIORITY.SIMULATION);

  return null;
}
