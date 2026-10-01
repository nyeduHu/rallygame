// server/net/validate.ts
import type { Socket } from "socket.io";
import { clientEventSchemas } from "../../lib/net/protocol";

export type AckResult = { ok: true } & Record<string, unknown> | { ok: false; error: string };

/** Validates a client payload against the schema for the incoming event name. */
export function parseClientPayload<T>(event: string, payload: unknown): { ok: true; data: T } | { ok: false; error: "bad_request" } {
  const schema = clientEventSchemas[event as keyof typeof clientEventSchemas];
  if (!schema) {
    return { ok: false, error: "bad_request" };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "bad_request" };
  }

  return { ok: true, data: parsed.data as T };
}

/** Returns a safe Socket.IO ack value for a handler. */
export function ackError(error: string): AckResult {
  return { ok: false, error };
}

/** Guards a socket-even handler so validation errors never crash the server. */
export async function withValidatedSocket<T>(
  socket: Socket,
  event: string,
  payload: unknown,
  action: (data: T) => Promise<AckResult> | AckResult,
): Promise<AckResult> {
  const parsed = parseClientPayload<T>(event, payload);
  if (!parsed.ok) {
    return ackError("bad_request");
  }

  try {
    return await action(parsed.data);
  } catch (error) {
    console.error(`socket handler failed for ${event}`, error instanceof Error ? error.message : "unknown error");
    return ackError("internal_error");
  }
}
