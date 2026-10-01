// server/net/gateway.test.ts
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Server as SocketIOServer } from "socket.io";
import { io as clientIo, type Socket } from "socket.io-client";
import { bindGateway } from "./gateway";
import { RoomManager } from "../rooms/roomManager";
import { generateStage } from "../../lib/game/stage/generateStage";
import { poseAt } from "../../lib/game/stage/roadIndex";
import type { RoomResults } from "../../lib/net/protocol";

const sockets: Socket[] = [];

async function connectClient(port: number): Promise<Socket> {
  const socket = clientIo(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
  });
  sockets.push(socket);
  await new Promise<void>((resolve) => {
    socket.on("connect", () => resolve());
  });
  return socket;
}

function emitAck(socket: Socket, event: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response: unknown) => {
      if (response && typeof response === "object" && "ok" in response) {
        resolve(response as Record<string, unknown>);
        return;
      }
      reject(new Error(`invalid ack for ${event}`));
    });
  });
}

afterEach(() => {
  for (const socket of sockets) {
    socket.disconnect();
  }
  sockets.length = 0;
});

describe("socket gateway", () => {
  it("creates a room, seats players, and starts the race when ready", async () => {
    const httpServer = createServer();
    const io = new SocketIOServer(httpServer, {
      cors: { origin: "http://localhost:3000" },
    });
    const roomManager = new RoomManager();
    bindGateway(io, roomManager);

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as { port: number }).port;

    try {
      const hostSocket = await connectClient(port);
      const guestSocket = await connectClient(port);

      const roomCreate = await emitAck(hostSocket, "room:create", { name: "Host", maxTeams: 2 });
      expect(roomCreate.ok).toBe(true);
      const roomCode = String(roomCreate.roomCode ?? "");

      const guestJoin = await emitAck(guestSocket, "room:join", { roomCode, name: "Guest" });
      expect(guestJoin.ok).toBe(true);

      const teamCreate = await emitAck(hostSocket, "team:create", {});
      expect(teamCreate.ok).toBe(true);
      const teamId = String(teamCreate.teamId ?? "");

      const hostSeat = await emitAck(hostSocket, "team:join", { teamId, role: "driver" });
      expect(hostSeat.ok).toBe(true);
      const guestSeat = await emitAck(guestSocket, "team:join", { teamId, role: "codriver" });
      expect(guestSeat.ok).toBe(true);

      const hostReady = await emitAck(hostSocket, "player:ready", { ready: true });
      expect(hostReady.ok).toBe(true);
      const guestReady = await emitAck(guestSocket, "player:ready", { ready: true });
      expect(guestReady.ok).toBe(true);

      const start = await emitAck(hostSocket, "room:start", {});
      expect(start.ok).toBe(true);
    } finally {
      io.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  it("runs a two-team race: forged pose rejected, both teams finish with server-ranked results", async () => {
    const httpServer = createServer();
    const io = new SocketIOServer(httpServer, { cors: { origin: "http://localhost:3000" } });
    bindGateway(io, new RoomManager(), {});
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as { port: number }).port;

    try {
      const [d1, c1, d2, c2] = await Promise.all([0, 1, 2, 3].map(() => connectClient(port)));
      const created = await emitAck(d1, "room:create", { name: "D1", maxTeams: 2 });
      const roomCode = String(created.roomCode);
      let seed = 0;
      for (const [socket, name] of [[c1, "C1"], [d2, "D2"], [c2, "C2"]] as const) {
        const joined = await emitAck(socket, "room:join", { roomCode, name });
        seed = (joined.room as { seed: number }).seed;
      }
      const t1 = String((await emitAck(d1, "team:create", {})).teamId);
      const t2 = String((await emitAck(d1, "team:create", {})).teamId);
      await emitAck(d1, "team:join", { teamId: t1, role: "driver" });
      await emitAck(c1, "team:join", { teamId: t1, role: "codriver" });
      await emitAck(d2, "team:join", { teamId: t2, role: "driver" });
      await emitAck(c2, "team:join", { teamId: t2, role: "codriver" });
      for (const socket of [d1, c1, d2, c2]) await emitAck(socket, "player:ready", { ready: true });

      const results = new Promise<RoomResults>((resolve) => c1.on("race:results", resolve));
      const goAt = new Promise<number>((resolve) => c1.on("race:countdown", (p: { goAtServerMs: number }) => resolve(p.goAtServerMs)));
      expect((await emitAck(d1, "room:start", {})).ok).toBe(true);
      const goAtMs = await goAt;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, goAtMs - Date.now()) + 50));

      const stage = generateStage(seed);
      /** Pose on the road centreline at arc length s. */
      const at = (seq: number, s: number): Record<string, unknown> => {
        const pose = poseAt(stage.samples, s);
        return { seq, epoch: 0, clientTimeMs: 0, p: [pose.x, pose.y, pose.z], q: [0, 0, 0, 1], v: [0, 0, 0], steer: 0, wheelSpin: 0, susp: [0, 0, 0, 0] };
      };
      const start = stage.startS;
      expect((await emitAck(d1, "car:pose", at(1, start))).ok).toBe(true);
      expect((await emitAck(d1, "car:pose", at(2, start + 500))).ok).toBe(false);
      const step = 5;
      let seq = 3;
      const drive = async (socket: Socket, from: number): Promise<void> => {
        for (let s = from + step; s <= stage.finishS + 10; s += step) socket.emit("car:pose", at(seq++, s));
      };
      await emitAck(d2, "car:pose", at(1, start));
      await Promise.all([drive(d1, start), drive(d2, start).then(() => undefined)]);
      const final = await results;
      expect(final.results.map((r) => r.status)).toEqual(["finished", "finished"]);
      expect(final.results[0].totalMs).toBeLessThanOrEqual(final.results[1].totalMs);
    } finally {
      io.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  }, 60_000);
});
