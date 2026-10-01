// server/race/raceController.ts
import { VEHICLE } from "../../lib/game/constants";
import { stepCheckpoints, type CheckpointState } from "../../lib/game/race/checkpointLogic";
import { generateStage } from "../../lib/game/stage/generateStage";
import { RoadIndex } from "../../lib/game/stage/roadIndex";
import type { StageData } from "../../lib/game/stage/types";
import { NET } from "../../lib/net/netConstants";
import type { PoseReport, RaceCountdown, RaceEvent, RoomResults, TeamSnapshot, WorldSnapshot } from "../../lib/net/protocol";
import type { Room } from "../rooms/room";
import { computeTotalMs, sortResults, type TeamResult } from "./results";
import { type AcceptedPose, validatePose, ViolationCounter } from "./poseValidator";

/** Outbound channels so the controller stays free of socket code. */
export interface RaceSink {
  countdown(payload: RaceCountdown): void;
  snapshot(payload: WorldSnapshot): void;
  event(payload: RaceEvent): void;
  results(payload: RoomResults): void;
}

interface TeamRaceState {
  teamId: string;
  name: string;
  progress: CheckpointState;
  splits: number[];
  lastPose: AcceptedPose | null;
  wipers: boolean;
  status: TeamSnapshot["status"];
  finishedAtMs: number | null;
  violations: ViolationCounter;
  suspicious: boolean;
}

const NEUTRAL_POSE: Pick<PoseReport, "p" | "q" | "v" | "steer" | "wheelSpin" | "seq"> = {
  p: [0, 0, 0],
  q: [0, 0, 0, 1],
  v: [0, 0, 0],
  steer: 0,
  wheelSpin: 0,
  seq: 0,
};

/** Authoritative race state for one room: validates poses, tracks progress, builds snapshots and results. */
export class RaceController {
  private readonly stage: StageData;
  private readonly index: RoadIndex;
  private readonly teams = new Map<string, TeamRaceState>();
  private goAtMs = 0;
  private done = false;

  /**
   * @param room - Room being raced (only fully seated teams participate).
   * @param sink - Outbound event channels.
   * @param now - Injectable server clock in ms.
   */
  constructor(
    private readonly room: Room,
    private readonly sink: RaceSink,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.stage = generateStage(room.seed);
    this.index = new RoadIndex(this.stage.samples);
    for (const team of room.teams.values()) {
      if (!team.driverId || !team.codriverId) continue;
      this.teams.set(team.id, {
        teamId: team.id,
        name: team.name,
        progress: { progressS: this.stage.startS - VEHICLE.SPAWN_BEHIND_START, nextCheckpoint: 0, finished: false },
        splits: [],
        lastPose: null,
        wipers: false,
        status: "racing",
        finishedAtMs: null,
        violations: new ViolationCounter(),
        suspicious: false,
      });
    }
  }

  /** Starts the synchronised countdown for every team at the same instant. */
  start(): void {
    this.goAtMs = this.now() + NET.COUNTDOWN_SECONDS * 1000;
    this.sink.countdown({ goAtServerMs: this.goAtMs });
  }

  /** @returns True once every team has finished or is out. */
  get finished(): boolean {
    return this.done;
  }

  /**
   * Accepts a driver pose if it passes validation and advances server-side progress.
   * @param teamId - Reporting team.
   * @param report - Pose report.
   * @returns True when the pose was accepted.
   */
  reportPose(teamId: string, report: PoseReport): boolean {
    const team = this.teams.get(teamId);
    const nowMs = this.now();
    if (!team || team.status !== "racing" || nowMs < this.goAtMs) return false;
    const projection = this.index.nearest(report.p[0], report.p[2], NET.MAX_OFF_ROAD_METRES);
    const reason = validatePose(report, team.lastPose, nowMs, projection ? Math.abs(projection.lateral) : null);
    if (reason || !projection) {
      if (team.violations.record(nowMs) && !team.suspicious) {
        team.suspicious = true;
        console.error(`race: team ${teamId} flagged suspicious (${reason ?? "off_road"})`);
      }
      return false;
    }
    const wasReset = team.lastPose !== null && report.epoch > team.lastPose.report.epoch;
    team.lastPose = { report, atMs: nowMs };
    // A reset teleports the car; re-anchor progress so the jump guard in stepCheckpoints does not freeze it.
    if (wasReset) team.progress = { ...team.progress, progressS: projection.s };
    const step = stepCheckpoints(team.progress, projection.s, projection.lateral, this.stage.checkpointS, this.stage.finishS);
    team.progress = step.state;
    if (step.event?.kind === "checkpoint") {
      team.splits.push(nowMs - this.goAtMs);
      this.sink.event({ teamId, kind: "checkpoint", atServerMs: nowMs, data: { index: step.event.index, splitMs: nowMs - this.goAtMs } });
    } else if (step.event?.kind === "finish") {
      team.status = "finished";
      team.finishedAtMs = nowMs;
      this.sink.event({ teamId, kind: "finish", atServerMs: nowMs, data: { rawMs: nowMs - this.goAtMs } });
    }
    return true;
  }

  /**
   * Stores the co-driver wiper state; the server owns it and echoes it in snapshots.
   * @param teamId - Team toggling wipers.
   * @param on - New state.
   */
  setWipers(teamId: string, on: boolean): void {
    const team = this.teams.get(teamId);
    if (team) team.wipers = on;
  }

  /** Marks a team DNF (for example the driver left) and emits the event. */
  markDnf(teamId: string, reason: string): void {
    const team = this.teams.get(teamId);
    if (!team || team.status !== "racing") return;
    team.status = "dnf";
    this.sink.event({ teamId, kind: "dnf", atServerMs: this.now(), data: { reason } });
  }

  /** One 20 Hz step: emits a snapshot and, once all teams are done, the final results. */
  tick(): void {
    const nowMs = this.now();
    if (this.done || nowMs < this.goAtMs) return;
    if (this.room.phase === "countdown") this.room.phase = "racing";
    this.sink.snapshot({
      serverNowMs: nowMs,
      raceElapsedMs: nowMs - this.goAtMs,
      weather: { kind: "clear", intensity: 0 },
      teams: [...this.teams.values()].map((team) => this.teamSnapshot(team)),
    });
    if ([...this.teams.values()].every((team) => team.status !== "racing")) this.complete();
  }

  /** @returns Snapshot entry for a team using its latest validated pose. */
  private teamSnapshot(team: TeamRaceState): TeamSnapshot {
    const pose = team.lastPose?.report ?? NEUTRAL_POSE;
    const span = this.stage.finishS - this.stage.startS;
    return {
      teamId: team.teamId,
      seq: pose.seq,
      p: pose.p,
      q: pose.q,
      v: pose.v,
      steer: pose.steer,
      wheelSpin: pose.wheelSpin,
      wipers: team.wipers,
      visibility: 1,
      checkpoint: team.progress.nextCheckpoint,
      progress01: Math.min(1, Math.max(0, (team.progress.progressS - this.stage.startS) / span)),
      status: team.status,
    };
  }

  /** Builds the ranking, sends per-team results and the full table, and ends the room. */
  private complete(): void {
    this.done = true;
    const span = this.stage.finishS - this.stage.startS;
    const entries: TeamResult[] = [...this.teams.values()].map((team) => {
      const rawMs = team.finishedAtMs === null ? 0 : team.finishedAtMs - this.goAtMs;
      return {
        teamId: team.teamId,
        name: team.name,
        status: team.status === "finished" ? "finished" : "dnf",
        rawMs,
        penaltyMs: 0,
        pitMs: 0,
        totalMs: team.status === "finished" ? computeTotalMs(rawMs, 0, 0) : (1 - (team.progress.progressS - this.stage.startS) / span) * 1e9,
        damage01: 0,
        fuel01: 1,
        navErrors: 0,
        crashes: 0,
      };
    });
    const ranked = sortResults(entries);
    for (const entry of ranked) {
      this.sink.event({ teamId: entry.teamId, kind: "team_result", atServerMs: this.now(), data: { ...entry } });
    }
    this.room.phase = "results";
    this.sink.results({ results: ranked });
  }
}
