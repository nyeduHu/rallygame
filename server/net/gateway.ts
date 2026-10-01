// server/net/gateway.ts
import type { Server, Socket } from "socket.io";
import { dailySeed } from "../../lib/game/stage/dailySeed";
import { NET } from "../../lib/net/netConstants";
import { type ClientEventName, carImpactSchema, carInputsSchema, clientEventSchemas, footPoseSchema, poseReportSchema, refuelStepSchema, repairStepSchema, seatSetSchema } from "../../lib/net/protocol";
import type { Room } from "../rooms/room";
import { RoomManager } from "../rooms/roomManager";
import { RaceController } from "../race/raceController";
import { TokenBucket } from "./rateLimit";
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
export function bindGateway(
  io: Server,
  roomManager: RoomManager,
  rateLimits: Readonly<Record<string, number>> = NET.RATE_LIMITS,
): void {
  const races = new Map<string, { controller: RaceController; timer: NodeJS.Timeout }>();

  /** Starts the authoritative race loop for a room that just left the lobby. */
  function startRace(room: Room): void {
    const controller = new RaceController(room, {
      countdown: (payload) => io.to(room.code).emit("race:countdown", payload),
      snapshot: (payload) => io.to(room.code).volatile.emit("race:snapshot", payload),
      event: (payload) => io.to(room.code).emit("race:event", payload),
      results: (payload) => io.to(room.code).emit("race:results", payload),
    });
    const timer = setInterval(() => {
      controller.tick();
      emitRoomState(io, room);
      if (controller.finished) {
        clearInterval(timer);
        races.delete(room.code);
      }
    }, 1000 / NET.SNAPSHOT_HZ);
    races.set(room.code, { controller, timer });
    controller.start();
  }

  /** Finds the team a player is seated in. */
  function teamOf(room: Room, playerId: string): string | null {
    return room.players.get(playerId)?.teamId ?? null;
  }

  io.on("connection", (socket: Socket) => {
    const buckets = new Map<string, TokenBucket>();
    socket.onAny(async (event: string, payload: unknown, ack?: (value: unknown) => void) => {
      if (!clientEventSchemas[event as keyof typeof clientEventSchemas]) {
        return;
      }

      const limit = rateLimits[event];
      if (limit !== undefined) {
        const bucket = buckets.get(event) ?? new TokenBucket(limit);
        buckets.set(event, bucket);
        if (!bucket.take()) {
          if (typeof ack === "function") ack({ ok: false, error: "rate_limited" });
          return;
        }
      }

      const result = await withValidatedSocket(socket, event, payload, async (data: Record<string, unknown>) => {
        if (event === "room:create") {
          const name = String(data.name ?? "");
          const maxTeams = typeof data.maxTeams === "number" ? Math.min(data.maxTeams, NET.MAX_TEAMS_LIMIT) : undefined;
          const room = roomManager.createRoom(name, { maxTeams, seed: data.useDailySeed === true ? dailySeed(new Date()) : undefined });
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
            resumeToken: room.issueResumeToken(host.id),
            room: room.toView(),
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
            resumeToken: room.issueResumeToken(player.id),
            room: room.toView(),
          };
        }

        if (event === "room:resume") {
          const room = roomManager.getRoom(String(data.roomCode ?? ""));
          const playerId = String(data.playerId ?? "");
          if (!room || !room.resumePlayer(playerId, String(data.resumeToken ?? ""))) {
            return { ok: false, error: "resume_failed" };
          }
          socket.data.playerId = playerId;
          socket.join(room.code);
          emitRoomState(io, room);
          return { ok: true, playerId, room: room.toView() };
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
            startRace(room);
          }
          return result;
        }

        if (event === "refuel:step") {
          const room = roomForPlayer(roomManager, socket);
          const playerId = String(socket.data.playerId ?? "");
          const race = room ? races.get(room.code) : undefined;
          const teamId = room ? teamOf(room, playerId) : null;
          const role = room?.players.get(playerId)?.role;
          if (!room || !race || !teamId || !role) return { ok: false, error: "not_found" };
          const error = race.controller.refuelStep(teamId, role, refuelStepSchema.parse(data));
          return error ? { ok: false as const, error } : { ok: true as const };
        }

        if (event === "repair:step") {
          const room = roomForPlayer(roomManager, socket);
          const playerId = String(socket.data.playerId ?? "");
          const race = room ? races.get(room.code) : undefined;
          const teamId = room ? teamOf(room, playerId) : null;
          const role = room?.players.get(playerId)?.role;
          if (!room || !race || !teamId || !role) return { ok: false, error: "not_found" };
          const error = race.controller.repairStep(teamId, role, repairStepSchema.parse(data));
          return error ? { ok: false as const, error } : { ok: true as const };
        }

        if (event === "seat:set" || event === "foot:pose") {
          const room = roomForPlayer(roomManager, socket);
          const playerId = String(socket.data.playerId ?? "");
          const race = room ? races.get(room.code) : undefined;
          const teamId = room ? teamOf(room, playerId) : null;
          const role = room?.players.get(playerId)?.role;
          if (!room || !race || !teamId || !role) return { ok: false, error: "not_found" };
          if (event === "seat:set") {
            const error = race.controller.setSeat(teamId, role, seatSetSchema.parse(data).to);
            return error ? { ok: false as const, error } : { ok: true as const };
          }
          return race.controller.reportFootPose(teamId, role, footPoseSchema.parse(data))
            ? { ok: true as const }
            : { ok: false as const, error: "rejected" };
        }

        if (event === "car:inputs" || event === "car:impact") {
          const room = roomForPlayer(roomManager, socket);
          const playerId = String(socket.data.playerId ?? "");
          const race = room ? races.get(room.code) : undefined;
          const teamId = room ? teamOf(room, playerId) : null;
          if (!room || !race || !teamId || room.players.get(playerId)?.role !== "driver") {
            return { ok: false, error: "forbidden" };
          }
          if (event === "car:inputs") race.controller.setInputs(teamId, carInputsSchema.parse(data));
          else race.controller.reportImpact(teamId, carImpactSchema.parse(data));
          return { ok: true };
        }

        if (event === "car:pose" || event === "codriver:wipers") {
          const room = roomForPlayer(roomManager, socket);
          const playerId = String(socket.data.playerId ?? "");
          const race = room ? races.get(room.code) : undefined;
          const teamId = room ? teamOf(room, playerId) : null;
          const role = room?.players.get(playerId)?.role;
          if (!room || !race || !teamId) {
            return { ok: false, error: "not_found" };
          }
          if (event === "car:pose") {
            if (role !== "driver") return { ok: false, error: "forbidden" };
            // Validated by the zod schema in withValidatedSocket before reaching here.
            return race.controller.reportPose(teamId, poseReportSchema.parse(data))
              ? { ok: true as const }
              : { ok: false as const, error: "rejected" };
          }
          if (role !== "codriver") return { ok: false, error: "forbidden" };
          race.controller.setWipers(teamId, Boolean(data.on));
          return { ok: true };
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
