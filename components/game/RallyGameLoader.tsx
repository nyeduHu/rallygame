// components/game/RallyGameLoader.tsx
"use client";

import dynamic from "next/dynamic";
import { LoadingScreen } from "./overlays/LoadingScreen";
import type { Role } from "@/lib/game/roles";

/** WebGL, WASM physics and pointer lock are browser-only, so skip server rendering. */
const RallyGame = dynamic(() => import("./RallyGame").then((module) => module.RallyGame), {
  ssr: false,
  loading: () => <LoadingScreen message="Loading game" />,
});

interface RallyGameLoaderProps {
  seed: number;
  role: Role;
  solo: boolean;
  online?: { remoteTeamIds: string[] };
}

/**
 * Client boundary that lazy-loads the game. Keyed by seed so switching stages
 * fully remounts (and disposes) the previous physics session.
 * @param props - Stage seed.
 * @returns Lazy game.
 */
export function RallyGameLoader({ seed, role, solo, online }: RallyGameLoaderProps) {
  return <RallyGame key={`${seed}-${role}-${solo}-${online ? "online" : "local"}`} seed={seed} role={role} solo={solo} online={online} />;
}
