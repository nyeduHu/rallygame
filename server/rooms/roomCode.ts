// server/rooms/roomCode.ts
import { randomInt } from "node:crypto";
import { NET } from "../../lib/net/netConstants";

/** Generates a unique room code using the project-approved alphabet and length. */
export function generateRoomCode(existingCodes: Iterable<string> = []): string {
  const used = new Set(existingCodes);

  while (true) {
    let code = "";
    for (let index = 0; index < NET.ROOM_CODE_LENGTH; index += 1) {
      const pick = randomInt(0, NET.ROOM_CODE_ALPHABET.length);
      code += NET.ROOM_CODE_ALPHABET[pick];
    }

    if (!used.has(code)) {
      return code;
    }
  }
}
