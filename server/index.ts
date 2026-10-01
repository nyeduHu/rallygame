// server/index.ts
import { createServer } from "node:http";
import express from "express";
import { Server } from "socket.io";
import { env } from "./env.js";
import { bindGateway } from "./net/gateway.js";
import healthRouter from "./health.js";
import { RoomManager } from "./rooms/roomManager.js";

const app = express();
const httpServer = createServer(app);

app.use(healthRouter);

const io = new Server(httpServer, {
  cors: {
    origin: env.CLIENT_ORIGIN,
  },
});
const roomManager = new RoomManager();
bindGateway(io, roomManager);

/** Closes Socket.IO and its HTTP listener before the process exits.
 * @returns Resolves after the transport is closed.
 */
async function shutdown(): Promise<void> {
  /** Closes Socket.IO and resolves when the transport has stopped. */
  function closeSocketServer(resolve: () => void): void {
    io.close(resolve);
  }

  await new Promise<void>(closeSocketServer);
}

/** Handles an operating-system shutdown signal after closing the server. */
function handleShutdownSignal(): void {
  void shutdown().then(() => {
    process.exitCode = 0;
  });
}

process.once("SIGINT", handleShutdownSignal);
process.once("SIGTERM", handleShutdownSignal);

httpServer.listen(env.PORT);
