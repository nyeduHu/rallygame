// lib/game/roles.ts
import { COCKPIT } from "./cockpitLayout";

export type Role = "driver" | "codriver";

export const ROLES = ["driver", "codriver"] as const;

/**
 * Returns the car-local lateral seat position for a role.
 * @param role - Rally team role.
 * @returns Seat position on the local x axis.
 */
export function seatOf(role: Role): { x: typeof COCKPIT.DRIVER_X | typeof COCKPIT.PASSENGER_X } {
  return { x: role === "driver" ? COCKPIT.DRIVER_X : COCKPIT.PASSENGER_X };
}

/**
 * Narrows URL search parameter values to a supported role.
 * @param raw - Search parameter value, which may be repeated or absent.
 * @returns The supported role, or null for invalid input.
 */
export function parseRole(raw: string | string[] | undefined): Role | null {
  if (typeof raw !== "string") return null;
  return ROLES.find((role) => role === raw) ?? null;
}
