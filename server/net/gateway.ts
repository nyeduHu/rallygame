// server/net/gateway.ts
import type { Server, Socket } from "socket.io";
import { NET } from "../../lib/net/netConstants";
import { type ClientEventName, clientEventSchemas } from "../../lib/net/protocol";
import type { Room } from "../rooms/room";
import { RoomManager } from "../rooms/roomManager";
import { withValidatedSocket } from "./validate";

/** Finds the room that owns a socket's player ID. */
function roomForPlayer(roomManager: RoomManager, socket: Socket): Room | undefined {
  const playerId = String(socket.data.playerId ?? "");
  return [...roomManager.rooms.values()].find((room) => room.players.has(playerId));
}

/** Emits the latest room state to the current room members. */
function emitRoomState(io: Server, room: Room): void {
  io.to(room.code).emit("room:state", room.toView());
}

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
          const host = room.players.get(room.hostId);
          if (!host) {
            return { ok: false, error: "not_found" };
          }

          socket.data.playerId = host.id;
          socket.join(room.code);
          return {
            ok: true,
            roomCode: room.code,
            playerId: host.id,
            resumeToken: host.resumeToken,
          };
        }

        if (event === "room:join") {
          const roomCode = String(data.roomCode ?? "");
          const room = roomManager.getRoom(roomCode);
          if (!room) {
            return { ok: false, error: "room_not_found" };
          }

          const player = room.addPlayer(String(data.name ?? ""));
          socket.data.playerId = player.id;
          socket.join(room.code);
          emitRoomState(io, room);
          return {
            ok: true,
            playerId: player.id,
            resumeToken: player.resumeToken,
            room: room.toView(),
          };
        }

        if (event === "team:create") {
          const room = roomForPlayer(roomManager, socket);
          if (!room) {
            return { ok: false, error: "not_found" };
          }
          const team = room.createTeam(`Team ${room.teams.size + 1}`);
          emitRoomState(io, room);
          return { ok: true, teamId: team.id };
        }

        if (event === "team:join") {
          const room = roomForPlayer(roomManager, socket);
          if (!room) {
            return { ok: false, error: "not_found" };
          }
          const playerId = String(socket.data.playerId ?? "");
          const teamId = String(data.teamId ?? "");
          const role = data.role as "driver" | "codriver";
          const result = room.joinTeam(playerId, teamId, role);
          if (result.ok) {
            emitRoomState(io, room);
          }
          return result;
        }

        if (event === "team:leave") {
          const room = roomForPlayer(roomManager, socket);
          if (!room) {
            return { ok: false, error: "not_found" };
          }
          const result = room.leaveTeam(String(socket.data.playerId ?? ""));
          if (result.ok) {
            emitRoomState(io, room);
          }
          return result;
        }

        if (event === "player:ready") {
          const room = roomForPlayer(roomManager, socket);
          if (!room) {
            return { ok: false, error: "not_found" };
          }
          const result = room.setReady(String(socket.data.playerId ?? ""), Boolean(data.ready));
          if (result.ok) {
            emitRoomState(io, room);
          }
          return result;
        }

        if (event === "room:start") {
          const room = roomForPlayer(roomManager, socket);
          if (!room) {
            return { ok: false, error: "not_found" };
          }
          if (room.hostId !== String(socket.data.playerId ?? "")) {
            return { ok: false, error: "host_only" };
          }
          const result = room.startRoom();
          if (result.ok) {
            emitRoomState(io, room);
          }
          return result;
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

      const room = roomForPlayer(roomManager, socket);
      if (!room) {
        return;
      }

      room.disconnectPlayer(playerId, Date.now());
      roomManager.pruneExpiredRooms();
      emitRoomState(io, room);
    });
  });
}

export type SocketEventName = ClientEventName;
