// server/rooms/roomManager.test.ts
import { describe, expect, it } from "vitest";
import { NET } from "../../lib/net/netConstants";
import { generateRoomCode } from "./roomCode";
import { RoomManager } from "./roomManager";

describe("room manager", () => {
  it("enforces seat rules and readiness gating", () => {
    const manager = new RoomManager({ now: () => 0 });
    const room = manager.createRoom("Host", { maxTeams: 2 });
    const host = room.addPlayer("Host");
    const coDriver = room.addPlayer("Co");
    const guest = room.addPlayer("Guest");

    const teamA = room.createTeam("Alpha");
    const teamB = room.createTeam("Beta");

    expect(room.joinTeam(host.id, teamA.id, "driver").ok).toBe(true);
    expect(room.joinTeam(coDriver.id, teamA.id, "driver").ok).toBe(false);
    expect(room.joinTeam(coDriver.id, teamA.id, "codriver").ok).toBe(true);
    expect(room.joinTeam(guest.id, teamB.id, "driver").ok).toBe(true);

    expect(room.canStart()).toBe(false);
    expect(room.setReady(host.id, true).ok).toBe(true);
    expect(room.setReady(coDriver.id, true).ok).toBe(true);
    expect(room.canStart()).toBe(false);
    expect(room.setReady(guest.id, true).ok).toBe(true);
    expect(room.canStart()).toBe(true);

    expect(room.startRoom().ok).toBe(true);
    expect(room.phase).toBe("countdown");
  });

  it("reconnects players using the stored resume token and drops empty rooms", () => {
    const manager = new RoomManager({ now: () => 0, emptyRoomAfterMs: 250 });
    const room = manager.createRoom("Host", { maxTeams: 1 });
    const host = room.players.get(room.hostId)!;
    const team = room.createTeam("Team");

    room.joinTeam(host.id, team.id, "driver");
    room.disconnectPlayer(host.id, 0);

    expect(room.players.get(host.id)?.connected).toBe(false);
    expect(room.resumePlayer(host.id, host.resumeToken)).toBe(true);
    expect(room.players.get(host.id)?.connected).toBe(true);

    room.disconnectPlayer(host.id, 0);
    manager.pruneExpiredRooms();
    expect(manager.rooms.has(room.code)).toBe(true);

    room.disconnectPlayer(host.id, 0);
    manager.setNow(() => 500);
    manager.pruneExpiredRooms();
    expect(manager.rooms.has(room.code)).toBe(false);
  });

  it("generates unique room codes that stay inside the approved alphabet", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const code = generateRoomCode(seen);
      expect(code).toHaveLength(NET.ROOM_CODE_LENGTH);
      expect(new RegExp(`^[${NET.ROOM_CODE_ALPHABET}]{${NET.ROOM_CODE_LENGTH}}$`).test(code)).toBe(true);
      expect(seen.has(code)).toBe(false);
      seen.add(code);
    }
  });
});
