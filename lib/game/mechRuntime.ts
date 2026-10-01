// lib/game/mechRuntime.ts
import { initialMechanics } from "./vehicle/mechanics";

/**
 * Authoritative local mechanical state for solo play, shared by the per-frame mechanics driver
 * and repair effects. The store only receives it at HUD rate.
 */
export const mechRuntime = { current: initialMechanics() };
