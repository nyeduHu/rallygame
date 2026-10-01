// server/net/gateway.test.ts
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Server as SocketIOServer } from "socket.io";
import { io as clientIo, type Socket } from "socket.io-client";
import { bindGateway } from "./gateway";
import { RoomManager } from "../rooms/roomManager";

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
});
