// server/race/network.test.ts
import { describe, expect, it } from "vitest";
import { NETWORK } from "../../lib/game/constants";
import { generateStage } from "../../lib/game/stage/generateStage";
import { NetworkIndex } from "../../lib/game/stage/networkIndex";
import { poseAt } from "../../lib/game/stage/roadIndex";
import type { PoseReport, RaceEvent, RoomResults, WorldSnapshot } from "../../lib/net/protocol";
import { Room } from "../rooms/room";
import { RaceController } from "./raceController";

const STAGE = generateStage(3);
const HOP_M = 4;

/** Pose report at a world position. */
function pose(seq: number, x: number, y: number, z: number): PoseReport {
  return { seq, epoch: 0, clientTimeMs: 0, p: [x, y, z], q: [0, 0, 0, 1], v: [0, 0, 0], steer: 0, wheelSpin: 0, susp: [0, 0, 0, 0] };
}

describe("race on a road network", () => {
  it("a dead end costs one wrong-turn penalty and the stage can still be finished", () => {
    const room = new Room("ABCDEF", "Host", { seed: 3 });
    const guest = room.addPlayer("Guest");
    const team = room.createTeam("T");
    room.joinTeam(room.hostId, team.id, "driver");
    room.joinTeam(guest.id, team.id, "codriver");
    const clock = { now: 0 };
    const events: RaceEvent[] = [];
    const results: RoomResults[] = [];
    const snapshots: WorldSnapshot[] = [];
    const controller = new RaceController(
      room,
      { countdown() {}, snapshot: (s) => snapshots.push(s), event: (e) => events.push(e), results: (r) => results.push(r) },
      () => clock.now,
    );
    controller.start();
    clock.now = 5000;

    const routeIndex = new NetworkIndex(STAGE.samples, []);
    const deadEnd = STAGE.branches.find((branch) => {
      const first = branch.samples[0];
      const onRoute = (routeIndex.nearest(first.x, first.z, 2)?.distance ?? Infinity) < 1;
      return onRoute && branch.pendant[branch.pendant.length - 1] > NETWORK.WRONG_WAY_GRACE_M + 60;
    });
    if (!deadEnd) throw new Error("expected a dead-end road leaving the route");

    const forkS = routeIndex.nearest(deadEnd.samples[0].x, deadEnd.samples[0].z, 2)?.s ?? 0;
    let seq = 1;
    /** Reports the car at a position and advances the clock. */
    const at = (x: number, y: number, z: number): void => {
      clock.now += 50;
      controller.reportPose(team.id, pose(seq++, x, y, z));
      controller.tick();
    };
    /** Drives the reference route between two arc lengths. */
    const driveReference = (from: number, to: number): void => {
      for (let s = from; s <= to; s += HOP_M) {
        const p = poseAt(STAGE.samples, s);
        at(p.x, p.y, p.z);
      }
    };

    // Start, then the dead end first: drive in past the grace distance and back out.
    driveReference(STAGE.startS - 5, forkS);
    const deepEnough = deadEnd.pendant.findIndex((depth) => depth > NETWORK.WRONG_WAY_GRACE_M + 20);
    const into = deadEnd.samples.slice(0, deepEnough + 1);
    for (let i = 0; i < into.length; i += 2) at(into[i].x, into[i].y, into[i].z);
    expect(snapshots[snapshots.length - 1].teams[0].wrongWay).toBe(true);
    for (let i = into.length - 1; i >= 0; i -= 2) at(into[i].x, into[i].y, into[i].z);
    const afterDeadEnd = controller.penaltyMsOf(team.id);
    expect(afterDeadEnd).toBe(NETWORK.WRONG_WAY_PENALTY_S * 1000);

    // Back on the route, finish the stage.
    driveReference(forkS, STAGE.finishS + 10);
    const entry = results[0]?.results[0];
    expect(entry?.status).toBe("finished");
    expect(entry?.navErrors).toBe(1);
    expect(entry?.penaltyMs).toBe(afterDeadEnd);
  });
});
