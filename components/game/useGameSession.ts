// components/game/useGameSession.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { loadRapier } from "@/lib/game/physics/rapier";
import { GameSession } from "@/lib/game/session";
import { generateStage } from "@/lib/game/stage/generateStage";
import { useGameStore } from "@/lib/game/store";
import { buildRoadMesh, buildTerrainMesh, type MeshData } from "@/lib/game/stage/meshData";

interface GameSessionState {
  session: GameSession | null;
  road: MeshData;
  terrain: MeshData;
  error: string | null;
}

/**
 * Generates the stage for a seed and creates the physics-backed session once
 * Rapier's WASM is ready. The session is disposed on unmount.
 * @param seed - Stage seed.
 * @returns Session (null while loading), mesh data and any init error.
 */
export function useGameSession(seed: number): GameSessionState {
  const stage = useMemo(() => generateStage(seed), [seed]);
  const road = useMemo(() => buildRoadMesh(stage.samples, stage.seed), [stage]);
  const terrain = useMemo(() => buildTerrainMesh(stage.terrain, stage.seed), [stage]);
  const [session, setSession] = useState<GameSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: GameSession | null = null;
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
  }, [stage, road, terrain]);

  return { session, road, terrain, error };
}
