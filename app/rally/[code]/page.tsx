// app/rally/[code]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { JoinForm } from "@/components/lobby/JoinForm";
import { MainMenu } from "@/components/lobby/MainMenu";
import { TeamList } from "@/components/lobby/TeamList";
import { useRoom } from "@/lib/net/useRoom";

/** Lobby page used by the room-based multiplayer flow. */
export default function RallyRoutePage({ params }: { params: Promise<{ code: string }> }) {
  const { room, connected, createRoom, joinRoom, setReady, startRace, createTeam, joinTeam } = useRoom();
  const [code, setCode] = useState<string>("");
  const [menuVisible, setMenuVisible] = useState(true);

  useEffect(() => {
    void params.then((next) => setCode(next.code));
  }, [params]);

  useEffect(() => {
    if (!code) {
      return;
    }
    void joinRoom(code, "Guest");
  }, [code, joinRoom]);

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      {menuVisible && (
        <MainMenu
          onCreate={() => {
            void createRoom("Driver").then((result) => {
              if (result?.roomCode) {
                setMenuVisible(false);
                setCode(result.roomCode);
              }
            });
          }}
          onJoin={() => setMenuVisible(false)}
        />
      )}

      {!menuVisible && (
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="rounded-2xl border border-white/15 bg-slate-900/80 p-4">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Connection</p>
            <p className="text-lg font-medium">{connected ? "online" : "offline"}</p>
            {room && <p className="mt-2 text-sm text-cyan-300">Room code: {room.code}</p>}
          </div>

          {!room && <JoinForm onSubmit={(nextRoomCode, name) => void joinRoom(nextRoomCode, name)} />}

          {room && (
            <>
              <div className="flex gap-3">
                <button type="button" className="rounded bg-cyan-500 px-4 py-2 font-medium text-slate-950" onClick={() => void setReady(true)}>
                  Ready
                </button>
                <button type="button" className="rounded bg-emerald-500 px-4 py-2 font-medium text-slate-950" onClick={() => void createTeam().then((teamId) => teamId && void joinTeam(teamId, "driver"))}>
                  Create team
                </button>
                <button type="button" className="rounded bg-violet-500 px-4 py-2 font-medium text-white" onClick={() => void startRace()}>
                  Start race
                </button>
              </div>

              <TeamList room={room} onJoinTeam={(_teamId, role) => void joinTeam(_teamId, role)} />
            </>
          )}
        </div>
      )}
    </main>
  );
}
