// lib/game/physics/rapier.ts
import RAPIER from "@dimforge/rapier3d-compat";

/** The initialised Rapier module type. */
export type Rapier = typeof RAPIER;

let initPromise: Promise<Rapier> | null = null;

/**
 * Initialises the Rapier WASM module once per page; repeated calls (e.g. React
 * strict-mode double effects) share the same promise.
 * @returns The ready Rapier module.
 */
export function loadRapier(): Promise<Rapier> {
  if (!initPromise) {
    initPromise = RAPIER.init().then(() => RAPIER);
  }
  return initPromise;
}
