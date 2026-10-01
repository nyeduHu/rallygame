// lib/net/useNetRace.ts
"use client";

import { useMemo, useState } from "react";
import type { TeamSnapshot, WorldSnapshot } from "./protocol";

/** Minimal online-race hook used to bridge the server snapshot into the client scene. */
export function useNetRace(): {
  snapshot: WorldSnapshot | null;
  setSnapshot: (next: WorldSnapshot | null) => void;
  ownTeam: TeamSnapshot | null;
} {
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);

  const ownTeam = useMemo(() => {
    if (!snapshot || snapshot.teams.length === 0) {
      return null;
    }
    return snapshot.teams[0];
  }, [snapshot]);

  return { snapshot, setSnapshot, ownTeam };
}
