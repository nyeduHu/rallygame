// lib/net/client.ts
import { io, type Socket } from "socket.io-client";
import { NET } from "./netConstants";
import type { ClientEventName, RoomView, Role } from "./protocol";

export type AckResponse = { ok: true } & Record<string, unknown> | { ok: false; error: string };

/** Socket.IO client configuration for the multiplayer lobby and race server. */
export class RallyClient {
  private socket: Socket | null = null;

  /** Connects by using the server URL from environment or default localhost. */
  connect(url = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:5501"): Socket {
    this.socket = io(url, {
      autoConnect: true,
      transports: ["websocket"],
    });
    return this.socket;
  }

  /** Returns the active socket or a connected instance. */
  getSocket(): Socket {
    if (!this.socket) {
      this.socket = io(process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:5501", {
        autoConnect: true,
        transports: ["websocket"],
      });
    }
    return this.socket;
  }

  /** Sends a typed event to the server and awaits the ack response. */
  request<T>(event: ClientEventName, payload: Record<string, unknown>): Promise<T & AckResponse> {
    return new Promise((resolve, reject) => {
      const socket = this.getSocket();
      const timeout = window.setTimeout(() => reject(new Error("request timeout")), NET.ACK_TIMEOUT_MS);

      socket.emit(event, payload, (response: unknown) => {
        window.clearTimeout(timeout);
        resolve((response ?? { ok: true }) as T & AckResponse);
      });
    });
  }

  /** Sets the socket room membership and stores a resumable session token. */
  rememberSession(roomCode: string, playerId: string, resumeToken: string): void {
    try {
      sessionStorage.setItem("rally-room", JSON.stringify({ roomCode, playerId, resumeToken }));
    } catch {
      // Session storage is optional in private browsing and should never break the game.
    }
  }

  /** Returns the stored room resume data when available. */
  restoreSession(): { roomCode: string; playerId: string; resumeToken: string } | null {
    try {
      const raw = sessionStorage.getItem("rally-room");
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { roomCode?: string; playerId?: string; resumeToken?: string };
      if (!parsed.roomCode || !parsed.playerId || !parsed.resumeToken) {
        return null;
      }
      return {
        roomCode: parsed.roomCode,
        playerId: parsed.playerId,
        resumeToken: parsed.resumeToken,
      };
    } catch {
      return null;
    }
  }
}

export const rallyClient = new RallyClient();

export interface RoomActionState {
  room: RoomView | null;
  me: { id: string; name: string; role: Role | null; teamId: string | null } | null;
  connected: boolean;
}
