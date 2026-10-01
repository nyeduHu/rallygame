// components/game/useGameSession.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { loadRapier } from "@/lib/game/physics/rapier";
import { GameSession } from "@/lib/game/session";
import { RemoteSession } from "@/lib/game/remoteSession";
import type { SessionView } from "@/lib/game/sessionView";
import { generateStage } from "@/lib/game/stage/generateStage";
import { useGameStore } from "@/lib/game/store";
import { buildNetworkRoadMesh, buildTerrainMesh, type MeshData } from "@/lib/game/stage/meshData";

interface GameSessionState {
  session: SessionView | null;
  road: MeshData;
  terrain: MeshData;
  error: string | null;
}

/**
 * Generates the stage for a seed and creates the physics-backed session once
 * Rapier's WASM is ready. The session is disposed on unmount.
 * @param seed - Stage seed.
 * @param remote - Build a physics-free RemoteSession (co-driver online) and skip loading Rapier.
 * @returns Session (null while loading), mesh data and any init error.
 */
export function useGameSession(seed: number, remote = false): GameSessionState {
  const stage = useMemo(() => generateStage(seed), [seed]);
  const road = useMemo(() => buildNetworkRoadMesh(stage), [stage]);
  const terrain = useMemo(() => buildTerrainMesh(stage.terrain, stage.seed), [stage]);
  const remoteSession = useMemo(() => (remote ? new RemoteSession(stage) : null), [remote, stage]);
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: GameSession | null = null;
    if (remote) return;
    loadRapier()
      .then((R) => {
        if (cancelled) return;
        created = new GameSession(R, stage, road, terrain);
        // The store outlives a stage; clear any previous run's results.
        useGameStore.getState().setRace(created.race.snapshot());
        setSession(created);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Physics engine failed to load");
      });
    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, [stage, road, terrain, remote]);

  return { session: remoteSession ?? session, road, terrain, error };
}
