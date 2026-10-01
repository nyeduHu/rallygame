// server/race/onFoot.test.ts
import { describe, expect, it } from "vitest";
import { generateStage } from "../../lib/game/stage/generateStage";
import { poseAt } from "../../lib/game/stage/roadIndex";
import type { PoseReport } from "../../lib/net/protocol";
import { Room } from "../rooms/room";
import { RaceController } from "./raceController";

const STAGE = generateStage(7);

/** Pose at s with speed v along x. */
function pose(seq: number, s: number, v: number): PoseReport {
  const p = poseAt(STAGE.samples, s);
  return { seq, epoch: 0, clientTimeMs: 0, p: [p.x, p.y, p.z], q: [0, 0, 0, 1], v: [v, 0, 0], steer: 0, wheelSpin: 0, susp: [0, 0, 0, 0] };
}

describe("on-foot seat rules", () => {
  it("needs a stopped car to exit, rejects forged foot poses, and re-entry only near the door", () => {
    const room = new Room("ABCDEF", "Host", { seed: 7 });
    const guest = room.addPlayer("Guest");
    const team = room.createTeam("T");
    room.joinTeam(room.hostId, team.id, "driver");
    room.joinTeam(guest.id, team.id, "codriver");
    const clock = { now: 0 };
    const controller = new RaceController(room, { countdown() {}, snapshot() {}, event() {}, results() {} }, () => clock.now);
    controller.start();
    clock.now = 5000;

    controller.reportPose(team.id, pose(1, STAGE.startS, 20));
    expect(controller.setSeat(team.id, "driver", "foot")).toBe("car_moving");
    clock.now += 100;
    controller.reportPose(team.id, pose(2, STAGE.startS, 0));
    expect(controller.setSeat(team.id, "driver", "foot")).toBeNull();

    // Out of reach of the door: cannot get back in.
    expect(controller.setSeat(team.id, "driver", "seat")).toBeNull();
    expect(controller.setSeat(team.id, "driver", "foot")).toBeNull();
    const car = pose(2, STAGE.startS, 0).p;
    clock.now += 100;
    expect(controller.reportFootPose(team.id, "driver", { seq: 1, p: [car[0] + 500, car[1], car[2]], yaw: 0 })).toBe(false);
    clock.now += 100;
    expect(controller.reportFootPose(team.id, "driver", { seq: 2, p: [car[0] + 30, car[1], car[2]], yaw: 0 })).toBe(false);
    clock.now += 20_000;
    expect(controller.reportFootPose(team.id, "driver", { seq: 3, p: [car[0] + 30, car[1], car[2]], yaw: 0 })).toBe(true);
    expect(controller.setSeat(team.id, "driver", "seat")).toBe("too_far");
  });
});
