// components/lobby/TeamList.tsx
"use client";

import type { RoomView, TeamView } from "@/lib/net/protocol";

interface TeamListProps {
  room: RoomView | null;
  onJoinTeam: (teamId: string, role: "driver" | "codriver") => void;
}

/** Renders team cards and seat buttons for the lobby. */
export function TeamList({ room, onJoinTeam }: TeamListProps) {
  if (!room) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {room.teams.map((team: TeamView) => (
        <article key={team.id} className="rounded-2xl border border-white/15 bg-slate-900/80 p-4 text-white">
          <h2 className="mb-3 text-xl font-semibold">{team.name}</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded bg-slate-800 px-3 py-2">
              <span>Driver</span>
              <button type="button" className="rounded bg-emerald-500 px-2 py-1 text-xs text-slate-950" onClick={() => onJoinTeam(team.id, "driver")}>
                {team.driver ? team.driver.name : "Take seat"}
              </button>
            </div>
            <div className="flex items-center justify-between rounded bg-slate-800 px-3 py-2">
              <span>Co-driver</span>
              <button type="button" className="rounded bg-amber-500 px-2 py-1 text-xs text-slate-950" onClick={() => onJoinTeam(team.id, "codriver")}>
                {team.codriver ? team.codriver.name : "Take seat"}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
