// lib/net/snapshotMechanics.ts
import type { MechanicalState } from "../game/vehicle/mechanics";
import type { TeamSnapshot } from "./protocol";

/**
 * Maps a server snapshot entry to a mechanical state.
 * @param team - Own team snapshot.
 * @param previous - Previous state (supplies fields the snapshot omits).
 * @returns Mechanical state mirroring the server.
 */
export function mechanicsFromSnapshot(team: TeamSnapshot, previous: MechanicalState): MechanicalState {
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
