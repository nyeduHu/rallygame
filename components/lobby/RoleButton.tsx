// components/lobby/RoleButton.tsx
"use client";

import type { PlayerView, Role } from "@/lib/net/protocol";

interface RoleButtonProps {
  role: Role;
  occupant: PlayerView | null;
  /** True when the local player holds this seat. */
  mine: boolean;
  onTake: () => void;
}

const ROLE_LABEL: Record<Role, string> = { driver: "Driver", codriver: "Co-driver" };

/**
 * One seat in a team card: shows who sits there, or lets the player take it.
 * @param props - Role, occupant and take handler.
 * @returns Seat row.
 */
export function RoleButton({ role, occupant, mine, onTake }: RoleButtonProps) {
  const taken = occupant !== null && !mine;
  return (
    <div className="flex items-center justify-between rounded bg-slate-800 px-3 py-2">
      <span>{ROLE_LABEL[role]}</span>
      <button
        type="button"
        disabled={taken}
        aria-label={`${ROLE_LABEL[role]} seat${occupant ? `, ${occupant.name}` : ", empty"}`}
        onClick={onTake}
        className="rounded bg-emerald-500 px-2 py-1 text-xs text-slate-950 disabled:bg-slate-600 disabled:text-slate-300"
      >
        {occupant ? `${occupant.name}${occupant.ready ? " ✓" : ""}` : "Take seat"}
      </button>
    </div>
  );
}
