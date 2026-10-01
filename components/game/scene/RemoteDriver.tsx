// components/game/scene/RemoteDriver.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { SIMULATION, UNITS } from "@/lib/game/constants";
import type { RemoteSession } from "@/lib/game/remoteSession";
import { repairStateFromView } from "@/lib/game/repair/repairMachine";
import { useGameStore } from "@/lib/game/store";
import { serverNowMs, snapshotBuffer, useNetStore } from "@/lib/net/netStore";
import { mechanicsFromSnapshot } from "@/lib/net/snapshotMechanics";
import { SnapshotBuffer } from "@/lib/net/snapshotBuffer";
import { FRAME_PRIORITY } from "./framePriority";

const MS_PER_SECOND = 1000;

interface RemoteDriverProps {
  session: RemoteSession;
  teamId: string;
}

/**
 * Co-driver frame loop: moves the car along the team's interpolated server pose and publishes
 * the race HUD state (countdown, clock, checkpoints) derived from server data.
 * @param props - Remote session and the team whose car is followed.
 * @returns Nothing visible.
 */
export function RemoteDriver({ session, teamId }: RemoteDriverProps) {
  const sincePublish = useRef(0);

  useFrame((_, delta) => {
    const nowMs = serverNowMs();
    session.applyPose(snapshotBuffer.sample(teamId, SnapshotBuffer.renderTime(nowMs)), delta);

    sincePublish.current += delta;
    if (sincePublish.current < SIMULATION.HUD_PUBLISH_INTERVAL) return;
    sincePublish.current = 0;

    const { goAtServerMs, snapshot } = useNetStore.getState();
    const team = snapshot?.teams.find((entry) => entry.teamId === teamId);
    const checkpointTotal = session.stage.checkpointS.length;
    const finished = team?.status === "finished";
    const elapsed = Math.max(0, snapshot?.raceElapsedMs ?? 0) / MS_PER_SECOND;
    const counting = goAtServerMs !== null && nowMs < goAtServerMs;
    const phase = goAtServerMs === null ? "ready" : counting ? "countdown" : finished ? "finished" : "running";
    useGameStore.getState().setRace({
      phase,
      countdownRemaining: counting ? (goAtServerMs - nowMs) / MS_PER_SECOND : 0,
      elapsed,
      checkpointsPassed: team?.checkpoint ?? 0,
      checkpointTotal,
      splits: [],
      finishTime: finished ? elapsed : null,
      progress: team?.progress01 ?? 0,
    });
    if (team) {
      const store = useGameStore.getState();
      store.setMech(mechanicsFromSnapshot(team, store.mech));
      const repair = repairStateFromView(team.repair);
      if (repair) store.setRepair(repair);
      if (team.refuel) store.setRefuel(team.refuel);
      const pitActive = team.status === "pit";
      const pitReady = team.pitReady === true;
      if (pitActive !== store.pitActive || pitReady !== store.pitReady) store.setPit({ pitActive, pitReady });
      if (team.hoodOpen !== undefined) store.setHoodOpen(team.hoodOpen);
    }
    useGameStore.getState().setTelemetry({
      speedKmh: Math.abs(session.vehicle.forwardSpeed) * UNITS.MS_TO_KMH,
      rpm: session.vehicle.drivetrain.rpm,
      gear: session.vehicle.drivetrain.reverse ? "R" : "D",
      surface: null,
    });
  }, FRAME_PRIORITY.SIMULATION);

  return null;
}
