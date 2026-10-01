// components/lobby/TeamList.tsx
"use client";

import type { Role, RoomView } from "@/lib/net/protocol";
import { TeamCard } from "./TeamCard";

interface TeamListProps {
  room: RoomView | null;
  myPlayerId: string | null;
  onJoinTeam: (teamId: string, role: Role) => void;
}

/**
 * Renders the team cards for the lobby.
 * @param props - Room, local player id and seat handler.
 * @returns Grid of team cards.
 */
export function TeamList({ room, myPlayerId, onJoinTeam }: TeamListProps) {
  if (!room) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {room.teams.map((team) => (
        <TeamCard key={team.id} team={team} myPlayerId={myPlayerId} onJoin={onJoinTeam} />
      ))}
    </div>
  );
}
