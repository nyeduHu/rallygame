// server/race/teamMechanics.test.ts
import { describe, expect, it } from "vitest";
import { MECHANICS } from "../../lib/game/constants";
import { generateStage } from "../../lib/game/stage/generateStage";
import { poseAt } from "../../lib/game/stage/roadIndex";
import type { PoseReport, RaceEvent, RoomResults } from "../../lib/net/protocol";
import { Room } from "../rooms/room";
import { RaceController } from "./raceController";

const SEED = 7;
const STAGE = generateStage(SEED);

/** Builds a controller with one full team and a manual clock. */
function setup(): { controller: RaceController; teamId: string; clock: { now: number }; results: RoomResults[]; events: RaceEvent[] } {
  const room = new Room("ABCDEF", "Host", { seed: SEED });
  const guest = room.addPlayer("Guest");
  const team = room.createTeam("Team 1");
  room.joinTeam(room.hostId, team.id, "driver");
  room.joinTeam(guest.id, team.id, "codriver");
  const clock = { now: 0 };
  const results: RoomResults[] = [];
  const events: RaceEvent[] = [];
  const controller = new RaceController(
    room,
    { countdown() {}, snapshot() {}, event: (e) => events.push(e), results: (r) => results.push(r) },
    () => clock.now,
  );
  controller.start();
  clock.now = 5000;
  return { controller, teamId: team.id, clock, results, events };
}

/** Pose on the road at s. */
function pose(seq: number, s: number): PoseReport {
  const p = poseAt(STAGE.samples, s);
  return { seq, epoch: 0, clientTimeMs: 0, p: [p.x, p.y, p.z], q: [0, 0, 0, 1], v: [0, 0, 0], steer: 0, wheelSpin: 0, susp: [0, 0, 0, 0] };
}

describe("team mechanics on the server", () => {
  it("clean path: a crash adds a penalty that lands in totalMs (D9)", () => {
    const { controller, teamId, clock, results } = setup();
    const stage = STAGE;
    controller.reportPose(teamId, pose(1, stage.startS));
    controller.reportImpact(teamId, { kind: "solid", impulse: MECHANICS.CRASH_IMPULSE });
    let seq = 2;
    for (let s = stage.startS; s <= stage.finishS + 10; s += 5) {
      clock.now += 50;
      controller.reportPose(teamId, pose(seq++, s));
      controller.tick();
    }
    const entry = results[0].results[0];
    expect(entry.status).toBe("finished");
    expect(entry.crashes).toBe(1);
    expect(entry.penaltyMs).toBe(4000);
    expect(entry.totalMs).toBe(entry.rawMs + entry.penaltyMs + entry.pitMs);
  });

  it("failure path: overheating warning, engine failure, then DNF after no repair", () => {
    const { controller, teamId, clock, results } = setup();
    controller.reportPose(teamId, pose(1, STAGE.startS));
    // Full throttle at standstill heats the engine.
    const inputs = { throttle01: 1, brake01: 0, steer: 0, handbrake: false, rpm: 7200 };
    let sawOverheat = false;
    for (let i = 0; i < 20000 && results.length === 0; i++) {
      clock.now += 100;
      controller.setInputs(teamId, inputs);
      controller.tick();
      const snapshotStatus = controller.mechanicsOf(teamId)?.engineStatus;
      if (snapshotStatus === "overheating") sawOverheat = true;
    }
    expect(sawOverheat).toBe(true);
    expect(results[0].results[0].status).toBe("dnf");
  });
});
