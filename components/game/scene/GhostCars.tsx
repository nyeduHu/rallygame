// components/game/scene/GhostCars.tsx
"use client";

interface GhostCarsProps {
  teams?: unknown[];
}

/** Placeholder ghost-car renderer for online multiplayer races. */
export function GhostCars({ teams = [] }: GhostCarsProps) {
  void teams;
  return null;
}
