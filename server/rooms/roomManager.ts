// server/rooms/roomManager.ts
import type { RoomPhase } from "../../lib/net/protocol";
import { NET } from "../../lib/net/netConstants";
import { generateRoomCode } from "./roomCode";
import { Room, type RoomActionResult } from "./room";

export interface RoomManagerOptions {
  now?: () => number;
  emptyRoomAfterMs?: number;
}

/** Manages room lifecycle, disconnect grace periods, and empty-room cleanup. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private nowFn: () => number;
  private readonly emptyRoomAfterMs: number;

  constructor(options: RoomManagerOptions = {}) {
    this.nowFn = options.now ?? (() => Date.now());
    this.emptyRoomAfterMs = options.emptyRoomAfterMs ?? 10 * 60 * 1000;
  }

  /** Returns the current time in milliseconds. */
  now(): number {
    return this.nowFn();
  }

  /** Replaces the clock source used for disconnect and pruning logic. */
  setNow(clock: () => number): void {
    this.nowFn = clock;
  }

  /** Creates a new room owned by the first player using a generated code. */
  createRoom(hostName: string, options: { maxTeams?: number; seed?: number; stageIndex?: number } = {}): Room {
    const code = generateRoomCode(this.rooms.keys());
    const room = new Room(code, hostName, options);
    this.rooms.set(code, room);
    return room;
  }

  /** Finds a room by code and returns it or undefined. */
  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** Creates a new room or returns an existing one by code. */
  joinRoom(roomCode: string, name: string): Room | undefined {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return undefined;
    }

    room.addPlayer(name);
    return room;
  }

  /** Removes rooms that have stayed empty beyond the configured inactivity window. */
  pruneExpiredRooms(): void {
    const currentTime = this.now();

    for (const [code, room] of this.rooms.entries()) {
      const players = [...room.players.values()];
      if (players.length === 0) {
        this.rooms.delete(code);
        continue;
      }

      const disconnectedPlayers = players.filter((player) => !player.connected && player.disconnectedAtMs !== null);
      if (disconnectedPlayers.length !== players.length) {
        continue;
      }

      const newestDisconnect = Math.max(...disconnectedPlayers.map((player) => player.disconnectedAtMs ?? 0));
      if (currentTime - newestDisconnect >= this.emptyRoomAfterMs) {
        this.rooms.delete(code);
      }
    }
  }

  /** Returns the min room phase for the manager's checks. */
  phaseForRoom(room: Room): RoomPhase {
    return room.phase;
  }

  /** Validates a room start request, ensuring readiness and hosting rules are met. */
  startRoom(room: Room): RoomActionResult {
    return room.startRoom();
  }
}
