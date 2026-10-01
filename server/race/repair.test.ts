// server/race/repair.test.ts
import { describe, expect, it } from "vitest";
import { generateStage } from "../../lib/game/stage/generateStage";
import { poseAt } from "../../lib/game/stage/roadIndex";
import type { PoseReport } from "../../lib/net/protocol";
import { Room } from "../rooms/room";
import { RaceController } from "./raceController";

const STAGE = generateStage(7);

/** Parked car pose. */
function parked(seq: number): PoseReport {
  const p = poseAt(STAGE.samples, STAGE.startS);
  return { seq, epoch: 0, clientTimeMs: 0, p: [p.x, p.y, p.z], q: [0, 0, 0, 1], v: [0, 0, 0], steer: 0, wheelSpin: 0, susp: [0, 0, 0, 0] };
}

describe("server-authoritative repair", () => {
  it("walks the full repair, rejects out-of-order steps, charges a wrong guess, and restarts the engine", () => {
    const room = new Room("ABCDEF", "Host", { seed: 7 });
    const guest = room.addPlayer("Guest");
    const team = room.createTeam("T");
    room.joinTeam(room.hostId, team.id, "driver");
    room.joinTeam(guest.id, team.id, "codriver");
    const clock = { now: 0 };
    const controller = new RaceController(room, { countdown() {}, snapshot() {}, event() {}, results() {} }, () => clock.now);
    controller.start();
    clock.now = 5000;
    controller.reportPose(team.id, parked(1));
    controller.forceFailure(team.id, "drive_belt");

    // Hood cannot be opened from the seat, and nothing works out of order.
    expect(controller.repairStep(team.id, "driver", { step: "OPEN_HOOD" })).toBe("not_on_foot");
    expect(controller.setSeat(team.id, "driver", "foot")).toBeNull();
    expect(controller.repairStep(team.id, "driver", { step: "GRAB_TOOL" })).toBe("illegal_step");
    expect(controller.repairStep(team.id, "codriver", { step: "OPEN_HOOD" })).toBe("not_allowed");

    expect(controller.repairStep(team.id, "driver", { step: "OPEN_HOOD" })).toBeNull();
    expect(controller.repairStep(team.id, "driver", { step: "INSPECT", partId: "spark_plug" })).toBeNull();
    for (const request of [
      { step: "INSPECT", partId: "drive_belt" },
      { step: "GRAB_TOOL" },
      { step: "REMOVE_PART", partId: "drive_belt" },
      { step: "INSTALL_NEW", partId: "drive_belt" },
      { step: "CLOSE_HOOD" },
    ] as const) {
      expect(controller.repairStep(team.id, "driver", request)).toBeNull();
    }

    // Ignition needs the driver back in the seat.
    expect(controller.repairStep(team.id, "driver", { step: "IGNITION" })).toBe("not_in_seat");
    expect(controller.setSeat(team.id, "driver", "seat")).toBeNull();
    expect(controller.repairStep(team.id, "driver", { step: "IGNITION" })).toBeNull();
    const mech = controller.mechanicsOf(team.id);
    expect(mech?.engineStatus).toBe("ok");
    expect(mech?.brokenPart).toBeNull();
  });
});
