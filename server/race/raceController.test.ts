// server/race/raceController.test.ts
import { describe, expect, it } from "vitest";
import { generateStage } from "../../lib/game/stage/generateStage";
import { poseAt } from "../../lib/game/stage/roadIndex";
import type { PoseReport, RoomResults, WorldSnapshot } from "../../lib/net/protocol";
import { Room } from "../rooms/room";
import { RaceController } from "./raceController";

describe("RaceController", () => {
  it("rejects forged poses and finishes a driven team with server time", () => {
    const room = new Room("ABCDEF", "Host", { seed: 7 });
    const guest = room.addPlayer("Guest");
    const team = room.createTeam("Team 1");
    room.joinTeam(room.hostId, team.id, "driver");
    room.joinTeam(guest.id, team.id, "codriver");
    let clock = 0;
    let latest: WorldSnapshot | null = null;
    let results: RoomResults | null = null;
    const controller = new RaceController(
      room,
      { countdown() {}, snapshot: (s) => { latest = s; }, event() {}, results: (r) => { results = r; } },
      () => clock,
    );
    controller.start();
    clock = 5000;
    // Walk the centreline in plausible steps through the finish.
    const stage = generateStage(7);
    let seq = 1;
    /** Builds a pose at arc length s moving forward. */
    const at = (s: number): PoseReport => {
      const pose = poseAt(stage.samples, s);
      return { seq: seq++, clientTimeMs: 0, p: [pose.x, pose.y, pose.z], q: [0, 0, 0, 1], v: [20, 0, 0], steer: 0, wheelSpin: 0, susp: [0, 0, 0, 0] };
    };
    expect(controller.reportPose(team.id, at(stage.startS))).toBe(true);
    const forged = at(stage.startS + 500);
    expect(controller.reportPose(team.id, forged)).toBe(false);
    for (let s = stage.startS; s <= stage.finishS + 10; s += 1) {
      clock += 50;
      controller.reportPose(team.id, at(s));
    }
    controller.tick();
    expect(latest).not.toBeNull();
    expect(results).not.toBeNull();
  });
});
