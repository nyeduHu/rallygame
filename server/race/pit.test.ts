// server/race/pit.test.ts
import { describe, expect, it } from "vitest";
import { generateStage } from "../../lib/game/stage/generateStage";
import { poseAt } from "../../lib/game/stage/roadIndex";
import type { PoseReport, RaceEvent, RoomResults } from "../../lib/net/protocol";
import { Room } from "../rooms/room";
import { RaceController } from "./raceController";

const STAGE = generateStage(7);
const MS = 1000;

/** Car pose (heading about +y) with zero velocity. */
function pose(seq: number, x: number, y: number, z: number, heading: number): PoseReport {
  const half = heading / 2;
  return { seq, epoch: 0, clientTimeMs: 0, p: [x, y, z], q: [0, Math.sin(half), 0, Math.cos(half)], v: [0, 0, 0], steer: 0, wheelSpin: 0, susp: [0, 0, 0, 0] };
}

describe("pit stop", () => {
  it("racing -> pit -> refuel -> release -> racing, with pit time excluded from raw time (D9)", () => {
    const pit = STAGE.pit;
    if (!pit) throw new Error("stage has no pit");
    const room = new Room("ABCDEF", "Host", { seed: 7 });
    const guest = room.addPlayer("Guest");
    const team = room.createTeam("T");
    room.joinTeam(room.hostId, team.id, "driver");
    room.joinTeam(guest.id, team.id, "codriver");
    const clock = { now: 0 };
    const events: RaceEvent[] = [];
    const results: RoomResults[] = [];
    const controller = new RaceController(room, { countdown() {}, snapshot() {}, event: (e) => events.push(e), results: (r) => results.push(r) }, () => clock.now);
    controller.start();
    clock.now = 5 * MS;

    const road = poseAt(STAGE.samples, pit.s);
    let seq = 1;
    /** Moves the car in hops short enough for the pose validator. */
    const driveTo = (x: number, z: number): void => {
      const from = controller.lastCarPosition(team.id) ?? { x: road.x, z: road.z };
      const hops = Math.max(1, Math.ceil(Math.hypot(x - from.x, z - from.z) / 4));
      for (let i = 1; i <= hops; i++) {
        clock.now += MS;
        controller.reportPose(team.id, pose(seq++, from.x + ((x - from.x) * i) / hops, road.y, from.z + ((z - from.z) * i) / hops, pit.heading));
      }
    };

    // Drive the centreline from the start so every checkpoint before the pit is crossed in order.
    for (let s = STAGE.startS - 5; s <= pit.s; s += 5) {
      const p = poseAt(STAGE.samples, s);
      clock.now += 50;
      controller.reportPose(team.id, pose(seq++, p.x, p.y, p.z, p.heading));
    }
    controller.setFuel(team.id, 0.3);
    driveTo(pit.x, pit.z);
    expect(events.some((e) => e.kind === "pit_enter")).toBe(true);
    const enteredAt = events.find((e) => e.kind === "pit_enter")?.atServerMs ?? 0;

    expect(controller.setSeat(team.id, "driver", "foot")).toBeNull();
    expect(controller.setSeat(team.id, "codriver", "foot")).toBeNull();
    expect(controller.refuelStep(team.id, "driver", { step: "GRAB_HOSE" })).toBe("not_allowed");

    let fseq = 1;
    let foot = controller.footPosition(team.id, "codriver") ?? { x: pit.x, z: pit.z };
    /** Walks the co-driver in 3 m hops, one second apiece. */
    const walkTo = (target: { x: number; z: number }): void => {
      for (let i = 0; i < 40; i++) {
        const dist = Math.hypot(target.x - foot.x, target.z - foot.z);
        if (dist < 0.05) return;
        const hop = Math.min(dist, 3);
        clock.now += MS;
        foot = { x: foot.x + ((target.x - foot.x) / dist) * hop, z: foot.z + ((target.z - foot.z) / dist) * hop };
        controller.reportFootPose(team.id, "codriver", { seq: fseq++, p: [foot.x, pit.y, foot.z], yaw: 0 });
      }
    };
    const flap = controller.flapPosition(team.id);
    if (!flap) throw new Error("no flap");
    const step = (name: "OPEN_FLAP" | "CLOSE_FLAP" | "GRAB_HOSE" | "CONNECT" | "START" | "STOP" | "DISCONNECT" | "RETURN_HOSE"): string | null =>
      controller.refuelStep(team.id, "codriver", { step: name });

    walkTo(flap);
    expect(step("CONNECT")).toBe("illegal_step");
    expect(step("OPEN_FLAP")).toBeNull();
    walkTo(pit.pump);
    expect(step("START")).toBe("illegal_step");
    expect(step("GRAB_HOSE")).toBeNull();
    walkTo(flap);
    expect(step("CONNECT")).toBeNull();
    walkTo(pit.pump);
    expect(step("START")).toBeNull();
    for (let i = 0; i < 40; i++) {
      clock.now += MS;
      controller.tick();
    }
    expect(controller.mechanicsOf(team.id)?.fuel01).toBeGreaterThanOrEqual(0.9);
    expect(step("STOP")).toBeNull();
    walkTo(flap);
    expect(step("DISCONNECT")).toBeNull();
    walkTo(pit.pump);
    expect(step("RETURN_HOSE")).toBeNull();
    walkTo(flap);
    expect(step("CLOSE_FLAP")).toBeNull();

    // Back in the seats: both must be near their doors.
    expect(controller.setSeat(team.id, "codriver", "seat")).toBeNull();
    expect(controller.setSeat(team.id, "driver", "seat")).toBeNull();
    clock.now += MS;
    controller.tick();
    expect(events.some((e) => e.kind === "pit_release")).toBe(true);

    // Leave the box and finish.
    driveTo(road.x, road.z);
    const exit = events.find((e) => e.kind === "pit_exit");
    expect(exit).toBeDefined();
    const pitMs = (exit?.data?.pitMs as number | undefined) ?? 0;
    expect(pitMs).toBeGreaterThan(0);
    expect(pitMs).toBeLessThanOrEqual((exit?.atServerMs ?? 0) - enteredAt);
    for (let s = pit.s; s <= STAGE.finishS + 10; s += 5) {
      const p = poseAt(STAGE.samples, s);
      clock.now += 50;
      controller.reportPose(team.id, pose(seq++, p.x, p.y, p.z, p.heading));
      controller.tick();
    }
    const entry = results[0]?.results[0];
    expect(entry?.status).toBe("finished");
    expect(entry?.pitMs).toBe(pitMs);
    expect(entry?.totalMs).toBe((entry?.rawMs ?? 0) + (entry?.penaltyMs ?? 0) + pitMs);
  });
});
