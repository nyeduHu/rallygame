// app/rally/[code]/page.tsx
"use client";

import { use, useState } from "react";
import { RallyGameLoader } from "@/components/game/RallyGameLoader";
import { TeamList } from "@/components/lobby/TeamList";
import { RoomResults } from "@/components/results/RoomResults";
import { useNetStore } from "@/lib/net/netStore";
import { useRoom } from "@/lib/net/useRoom";

const NEW_ROOM_SLUG = "new";
const RACING_PHASES = new Set(["countdown", "racing", "pit_stop", "finished"]);

/**
 * Room page: join or create, lobby, then the online race and results.
 * `/rally/new` creates a room; any other slug joins that room code.
 * @param props - Route params promise.
 * @returns Lobby or race UI.
 */
export default function RallyRoutePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { room, me, connected, createRoom, joinRoom, setReady, startRace, createTeam, joinTeam } = useRoom();
  const results = useNetStore((state) => state.results);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isHost = room !== null && me !== null && room.hostId === me.id;
  const myTeam = room?.teams.find((team) => team.id === me?.teamId);
  const seated = Boolean(myTeam?.driver && myTeam?.codriver);

  if (room && RACING_PHASES.has(room.phase) && me?.role && seated) {
    const remoteTeamIds = room.teams.filter((team) => team.id !== me.teamId && team.driver && team.codriver).map((team) => team.id);
    return (
      <main className="relative h-full w-full overflow-hidden">
        <RallyGameLoader seed={room.seed} role={me.role} solo={false} online={{ ownTeamId: me.teamId ?? "", remoteTeamIds }} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        {!room && (
          <form
            className="mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-white/20 bg-slate-900/80 p-6"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              const action = code === NEW_ROOM_SLUG
                ? createRoom(name).then((result) => {
                    if (result?.roomCode) window.history.replaceState(null, "", `/rally/${result.roomCode}`);
                    return result !== null;
                  })
                : joinRoom(code, name).then((joined) => joined !== null);
              void action.then((ok) => !ok && setError("Could not enter the room"));
            }}
          >
            <h1 className="text-2xl font-semibold">{code === NEW_ROOM_SLUG ? "Create rally" : `Join rally ${code}`}</h1>
            <label className="flex flex-col gap-1">
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={20}
                required
                className="rounded border border-slate-600 bg-slate-950 px-3 py-2"
              />
            </label>
            <button type="submit" disabled={!connected} className="rounded bg-emerald-500 px-4 py-3 font-medium text-slate-950 disabled:opacity-50">
              {code === NEW_ROOM_SLUG ? "CREATE RALLY" : "JOIN RALLY"}
            </button>
            {error && <p role="alert" className="text-red-400">{error}</p>}
          </form>
        )}

        {room && (
          <>
            <p aria-live="polite" className="text-lg">
              Room code: <span className="font-mono text-cyan-300">{room.code}</span> · {room.players.length} player(s)
            </p>

            {room.phase === "results" && results ? (
              <RoomResults results={results} />
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="rounded bg-emerald-500 px-4 py-2 font-medium text-slate-950" onClick={() => void createTeam()}>
                    Add team
                  </button>
                  <button type="button" className="rounded bg-cyan-500 px-4 py-2 font-medium text-slate-950" onClick={() => void setReady(true)}>
                    Ready
                  </button>
                  {isHost && (
                    <button type="button" className="rounded bg-violet-500 px-4 py-2 font-medium text-white" onClick={() => void startRace()}>
                      START RALLY
                    </button>
                  )}
                </div>
                <TeamList room={room} onJoinTeam={(teamId, role) => void joinTeam(teamId, role)} />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
