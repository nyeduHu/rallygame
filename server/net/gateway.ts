// server/net/gateway.ts
import type { Server, Socket } from "socket.io";
import { NET } from "../../lib/net/netConstants";
import { type ClientEventName, clientEventSchemas } from "../../lib/net/protocol";
import { RoomManager } from "../rooms/roomManager";
import { withValidatedSocket } from "./validate";

/** Creates a Socket.IO gateway for room lifecycle and state synchronization. */
export function bindGateway(io: Server, roomManager: RoomManager): void {
  io.on("connection", (socket: Socket) => {
    socket.onAny(async (event: string, payload: unknown, ack?: (value: unknown) => void) => {
      if (!clientEventSchemas[event as keyof typeof clientEventSchemas]) {
        return;
      }

      const result = await withValidatedSocket(socket, event, payload, async (data: Record<string, unknown>) => {
        if (event === "room:create") {
          const name = String(data.name ?? "");
          const maxTeams = typeof data.maxTeams === "number" ? Math.min(data.maxTeams, NET.MAX_TEAMS_LIMIT) : undefined;
          const room = roomManager.createRoom(name, { maxTeams });
          const player = room.players.get(room.hostId);

          return {
            ok: true,
            roomCode: room.code,
            playerId: player?.id ?? room.hostId,
            resumeToken: player?.resumeToken ?? "",
          };
        }

        if (event === "room:join") {
          const room = roomManager.getRoom(String(data.roomCode ?? ""));
          if (!room) {
            return { ok: false, error: "room_not_found" };
          }

          const player = room.addPlayer(String(data.name ?? ""));
          socket.data.playerId = player.id;
          socket.join(room.code);
          return {
            ok: true,
            playerId: player.id,
            resumeToken: player.resumeToken,
            room: room.toView(),
          };
        }

        if (event === "player:ready") {
          const playerId = String(socket.data.playerId ?? "");
          const room = [...roomManager.rooms.values()].find((candidate) => candidate.players.has(playerId));
          if (!room) {
            return { ok: false, error: "not_found" };
          }
          const ready = Boolean(data.ready);
          return room.setReady(playerId, ready);
        }

        if (event === "room:start") {
          const playerId = String(socket.data.playerId ?? "");
          const room = [...roomManager.rooms.values()].find((candidate) => candidate.players.has(playerId));
          if (!room) {
            return { ok: false, error: "not_found" };
          }
          return room.startRoom();
        }

        if (event === "team:create") {
          const playerId = String(socket.data.playerId ?? "");
          const room = [...roomManager.rooms.values()].find((candidate) => candidate.players.has(playerId));
          if (!room) {
            return { ok: false, error: "not_found" };
          }
          const team = room.createTeam(`Team ${room.teams.size + 1}`);
          return { ok: true, teamId: team.id };
        }

        if (event === "team:join") {
          const playerId = String(socket.data.playerId ?? "");
          const room = [...roomManager.rooms.values()].find((candidate) => candidate.players.has(playerId));
          if (!room) {
            return { ok: false, error: "not_found" };
          }
          const role = data.role as "driver" | "codriver";
          const teamId = String(data.teamId ?? "");
          return room.joinTeam(playerId, teamId, role);
        }

        if (event === "team:leave") {
          const playerId = String(socket.data.playerId ?? "");
          const room = [...roomManager.rooms.values()].find((candidate) => candidate.players.has(playerId));
          if (!room) {
            return { ok: false, error: "not_found" };
          }
          return room.leaveTeam(playerId);
        }

        if (event === "clock:ping") {
          return { ok: true, t0: Number(data.t0 ?? 0), serverNow: Date.now() };
        }

        return { ok: true };
      });

      if (typeof ack === "function") {
        ack(result);
      }
    });

    socket.on("disconnect", () => {
      const playerId = String(socket.data.playerId ?? "");
      if (!playerId) {
        return;
      }
      const room = [...roomManager.rooms.values()].find((candidate) => candidate.players.has(playerId));
      if (!room) {
        return;
      }
      room.disconnectPlayer(playerId, Date.now());
      roomManager.pruneExpiredRooms();
      io.to(room.code).emit("room:state", room.toView());
    });
  });
}

export type SocketEventName = ClientEventName;
