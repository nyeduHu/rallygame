// components/lobby/TeamCard.tsx
"use client";

import type { Role, TeamView } from "@/lib/net/protocol";
import { RoleButton } from "./RoleButton";

interface TeamCardProps {
  team: TeamView;
  myPlayerId: string | null;
  onJoin: (teamId: string, role: Role) => void;
}

/**
 * A team with its driver and co-driver seats.
 * @param props - Team, local player id and seat handler.
 * @returns Team card.
 */
export function TeamCard({ team, myPlayerId, onJoin }: TeamCardProps) {
  return (
    <article className="rounded-2xl border border-white/15 bg-slate-900/80 p-4 text-white">
      <h2 className="mb-3 text-xl font-semibold">{team.name}</h2>
      <div className="space-y-2">
        <RoleButton role="driver" occupant={team.driver} mine={team.driver?.id === myPlayerId} onTake={() => onJoin(team.id, "driver")} />
        <RoleButton role="codriver" occupant={team.codriver} mine={team.codriver?.id === myPlayerId} onTake={() => onJoin(team.id, "codriver")} />
      </div>
    </article>
  );
}
