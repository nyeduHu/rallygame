// lib/net/useRoom.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { rallyClient, type RoomActionState } from "./client";
import type { RoomView, Role } from "./protocol";

/** React hook exposing the room lifecycle for the lobby and race UI. */
export function useRoom(): {
  room: RoomView | null;
  me: { id: string; name: string; role: Role | null; teamId: string | null } | null;
  connected: boolean;
  createRoom: (name: string, maxTeams?: number) => Promise<{ roomCode?: string; playerId?: string; resumeToken?: string } | null>;
  joinRoom: (roomCode: string, name: string) => Promise<RoomView | null>;
  setReady: (ready: boolean) => Promise<boolean>;
  startRace: () => Promise<boolean>;
  createTeam: () => Promise<string | null>;
  joinTeam: (teamId: string, role: Role) => Promise<boolean>;
} {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [me, setMe] = useState<{ id: string; name: string; role: Role | null; teamId: string | null } | null>(null);

  const socket = useMemo(() => rallyClient.getSocket(), []);

  useEffect(() => {
    const handleConnect = (): void => setConnected(true);
    const handleDisconnect = (): void => setConnected(false);
    const handleRoomState = (next: RoomView): void => {
      setRoom(next);
      const current = next.players.find((player) => player.connected) ?? next.players[0] ?? null;
      if (current) {
        setMe({
          id: current.id,
          name: current.name,
          role: current.role,
          teamId: current.teamId,
        });
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room:state", handleRoomState);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room:state", handleRoomState);
    };
  }, [socket]);

  const createRoom = useCallback(async (name: string, maxTeams = 6) => {
    const response = await rallyClient.request<{ roomCode: string; playerId: string; resumeToken: string }>("room:create", {
      name,
      maxTeams,
    });
    if (!response.ok || !response.roomCode) {
      return null;
    }

    rallyClient.rememberSession(response.roomCode, response.playerId ?? "", response.resumeToken ?? "");
    return response;
  }, []);

  const joinRoom = useCallback(async (roomCode: string, name: string) => {
    const response = await rallyClient.request<{ room: RoomView }>("room:join", { roomCode, name });
    if (!response.ok || !response.room) {
      return null;
    }

    setRoom(response.room);
    const player = response.room.players.find((entry) => entry.name === name) ?? response.room.players[0] ?? null;
    if (player) {
      setMe({
        id: player.id,
        name: player.name,
        role: player.role,
        teamId: player.teamId,
      });
    }
    return response.room;
  }, []);

  const setReady = useCallback(async (ready: boolean) => {
    const response = await rallyClient.request<{ ok: boolean }>("player:ready", { ready });
    return response.ok === true;
  }, []);

  const startRace = useCallback(async () => {
    const response = await rallyClient.request<{ ok: boolean }>("room:start", {});
    return response.ok === true;
  }, []);

  const createTeam = useCallback(async () => {
    const response = await rallyClient.request<{ teamId: string }>("team:create", {});
    return response.ok ? response.teamId ?? null : null;
  }, []);

  const joinTeam = useCallback(async (teamId: string, role: Role) => {
    const response = await rallyClient.request<{ ok: boolean }>("team:join", { teamId, role });
    return response.ok === true;
  }, []);

  return {
    room,
    me,
    connected,
    createRoom,
    joinRoom,
    setReady,
    startRace,
    createTeam,
    joinTeam,
  };
}

export type UseRoomState = RoomActionState;
