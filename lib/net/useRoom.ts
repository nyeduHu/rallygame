// lib/net/useRoom.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { rallyClient, type RoomActionState } from "./client";
import { calculateClockOffset, type ClockSample } from "./clockSync";
import { NET } from "./netConstants";
import { snapshotBuffer, useNetStore } from "./netStore";
import type { RaceCountdown, RaceEvent, RoomResults, RoomView, Role, WorldSnapshot } from "./protocol";

type Me = { id: string; name: string; role: Role | null; teamId: string | null };
type CreateResult = { roomCode?: string; playerId?: string; resumeToken?: string; room?: RoomView };

const CLOCK_RESYNC_MS = 10_000;

/**
 * React hook exposing the room lifecycle, race stream and clock sync for the lobby and race UI.
 * @returns Room state, the local player, connection status and lobby actions.
 */
export function useRoom(): {
  room: RoomView | null;
  me: Me | null;
  connected: boolean;
  createRoom: (name: string, maxTeams?: number) => Promise<CreateResult | null>;
  joinRoom: (roomCode: string, name: string) => Promise<RoomView | null>;
  setReady: (ready: boolean) => Promise<boolean>;
  startRace: () => Promise<boolean>;
  createTeam: () => Promise<string | null>;
  joinTeam: (teamId: string, role: Role) => Promise<boolean>;
} {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const socket = useMemo(() => rallyClient.getSocket(), []);

  useEffect(() => {
    /** Estimates the server clock offset from a burst of pings. */
    const syncClock = async (): Promise<void> => {
      const samples: ClockSample[] = [];
      for (let i = 0; i < NET.PING_SAMPLES; i++) {
        const t0 = Date.now();
        try {
          const response = await rallyClient.request<{ serverNow: number }>("clock:ping", { t0 });
          if (response.ok) samples.push({ t0, serverNow: response.serverNow, rtt: Date.now() - t0 });
        } catch {
          break;
        }
      }
      // Lowest-RTT half is the least affected by queueing delay.
      const best = samples.sort((a, b) => a.rtt - b.rtt).slice(0, Math.max(1, Math.ceil(samples.length / 2)));
      if (best.length > 0) useNetStore.getState().setClockOffset(calculateClockOffset(best));
    };

    const handleConnect = (): void => {
      setConnected(true);
      void syncClock();
    };
    const handleDisconnect = (): void => setConnected(false);
    const handleCountdown = (payload: RaceCountdown): void => {
      useNetStore.getState().reset();
      useNetStore.getState().setGoAt(payload.goAtServerMs);
    };
    const handleSnapshot = (payload: WorldSnapshot): void => {
      useNetStore.getState().setSnapshot(payload);
      payload.teams.forEach((team) => snapshotBuffer.add(team.teamId, team, payload.serverNowMs));
    };
    const handleEvent = (payload: RaceEvent): void => useNetStore.getState().setLastEvent(payload);
    const handleResults = (payload: RoomResults): void => useNetStore.getState().setResults(payload);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room:state", setRoom);
    socket.on("race:countdown", handleCountdown);
    socket.on("race:snapshot", handleSnapshot);
    socket.on("race:event", handleEvent);
    socket.on("race:results", handleResults);
    if (socket.connected) handleConnect();
    const resync = window.setInterval(() => void syncClock(), CLOCK_RESYNC_MS);

    return () => {
      window.clearInterval(resync);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room:state", setRoom);
      socket.off("race:countdown", handleCountdown);
      socket.off("race:snapshot", handleSnapshot);
      socket.off("race:event", handleEvent);
      socket.off("race:results", handleResults);
    };
  }, [socket]);

  const me = useMemo<Me | null>(() => {
    const player = room?.players.find((entry) => entry.id === playerId);
    return player ? { id: player.id, name: player.name, role: player.role, teamId: player.teamId } : null;
  }, [room, playerId]);

  const createRoom = useCallback(async (name: string, maxTeams: number = NET.MAX_TEAMS_DEFAULT) => {
    const response = await rallyClient.request<CreateResult>("room:create", { name, maxTeams });
    if (!response.ok || !response.roomCode) return null;
    rallyClient.rememberSession(response.roomCode, response.playerId ?? "", response.resumeToken ?? "");
    setPlayerId(response.playerId ?? null);
    if (response.room) setRoom(response.room);
    return response;
  }, []);

  const joinRoom = useCallback(async (roomCode: string, name: string) => {
    const response = await rallyClient.request<{ room: RoomView; playerId: string; resumeToken: string }>("room:join", {
      roomCode,
      name,
    });
    if (!response.ok || !response.room) return null;
    rallyClient.rememberSession(roomCode, response.playerId, response.resumeToken);
    setPlayerId(response.playerId);
    setRoom(response.room);
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
    return response.ok ? (response.teamId ?? null) : null;
  }, []);

  const joinTeam = useCallback(async (teamId: string, role: Role) => {
    const response = await rallyClient.request<{ ok: boolean }>("team:join", { teamId, role });
    return response.ok === true;
  }, []);

  return { room, me, connected, createRoom, joinRoom, setReady, startRace, createTeam, joinTeam };
}

export type UseRoomState = RoomActionState;
