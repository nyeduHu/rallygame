// lib/net/protocol.test.ts
import { describe, expect, it } from "vitest";
import { poseReportSchema, roomCreateSchema, roomJoinSchema, teamJoinSchema } from "./protocol";

describe("network protocol schemas", () => {
  it("accepts valid lobby and pose payloads", () => {
    expect(roomCreateSchema.safeParse({ name: "Lena", maxTeams: 3 }).success).toBe(true);
    expect(roomJoinSchema.safeParse({ roomCode: "A2B4C7", name: "Milo" }).success).toBe(true);
    expect(teamJoinSchema.safeParse({ teamId: "team-1", role: "driver" }).success).toBe(true);

    const pose = {
      seq: 12,
      clientTimeMs: 1640,
      p: [1.2, 2.5, 3.6],
      q: [0, 0.1, 0.2, 0.9],
      v: [2, 0.5, -1],
      steer: 0.42,
      wheelSpin: 8.2,
      susp: [0.1, 0.2, 0.3, 0.4],
    };

    expect(poseReportSchema.safeParse(pose).success).toBe(true);
  });

  it("rejects extra fields and non-finite numeric values", () => {
    expect(roomCreateSchema.safeParse({ name: "Lena", maxTeams: 3, secret: "nope" }).success).toBe(false);
    expect(roomCreateSchema.safeParse({ name: "", maxTeams: 1 }).success).toBe(false);
    expect(teamJoinSchema.safeParse({ teamId: "team-1", role: "pilot" }).success).toBe(false);
    expect(
      poseReportSchema.safeParse({
        seq: Number.NaN,
        clientTimeMs: 1,
        p: [1, 2, 3],
        q: [0, 0, 0, 1],
        v: [0, 0, 0],
        steer: 0,
        wheelSpin: 0,
        susp: [0, 0, 0, 0],
      }).success,
    ).toBe(false);
  });

  it("enforces bounded string lengths and fixed-length arrays", () => {
    expect(roomJoinSchema.safeParse({ roomCode: "A", name: "Milo" }).success).toBe(false);
    expect(roomJoinSchema.safeParse({ roomCode: "A1B2C3", name: "M".repeat(30) }).success).toBe(false);
    expect(poseReportSchema.safeParse({
      seq: 1,
      clientTimeMs: 1,
      p: [1, 2],
      q: [0, 0, 0, 1],
      v: [0, 0, 0],
      steer: 0,
      wheelSpin: 0,
      susp: [0, 0, 0, 0],
    }).success).toBe(false);
  });
});
