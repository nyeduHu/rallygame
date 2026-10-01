// server/race/raceController.ts
import { DRIVETRAIN, VEHICLE } from "../../lib/game/constants";
import { stepCheckpoints, type CheckpointState } from "../../lib/game/race/checkpointLogic";
import { generateStage } from "../../lib/game/stage/generateStage";
import { RoadIndex } from "../../lib/game/stage/roadIndex";
import type { StageData } from "../../lib/game/stage/types";
import { NET } from "../../lib/net/netConstants";
import type { CarImpact, CarInputs, PoseReport, RaceCountdown, RaceEvent, RoomResults, TeamSnapshot, WorldSnapshot } from "../../lib/net/protocol";
import type { Room } from "../rooms/room";
import { initialMechanics, stepMechanics, applyCrash, type MechanicalState } from "../../lib/game/vehicle/mechanics";
import { MECHANICS } from "../../lib/game/constants";
import { PENALTY } from "../../lib/game/race/penalties";
import { PenaltyLedger } from "./penalties";
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
  mech: MechanicalState;
  ledger: PenaltyLedger;
  inputs: CarInputs | null;
  lastLateral: number;
  hoodOpen: boolean;
  crashIndex: number;
  /** Server time the engine last failed, for the repair-timeout DNF. */
  failedAtMs: number | null;
  /** Impulse reported since the last tick, applied by the mechanics step. */
  pendingImpulse: number;
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
  private lastTickMs = 0;
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
        mech: initialMechanics(),
        ledger: new PenaltyLedger(),
        inputs: null,
        lastLateral: 0,
        hoodOpen: false,
        crashIndex: 0,
        failedAtMs: null,
        pendingImpulse: 0,
      });
    }
  }

  /** Starts the synchronised countdown for every team at the same instant. */
  start(): void {
    this.goAtMs = this.now() + NET.COUNTDOWN_SECONDS * 1000;
    this.lastTickMs = this.goAtMs;
    this.sink.countdown({ goAtServerMs: this.goAtMs });
  }

  /** @returns A team's current mechanical state (for snapshots and tests), or null. */
  mechanicsOf(teamId: string): MechanicalState | null {
    return this.teams.get(teamId)?.mech ?? null;
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
    team.lastLateral = projection.lateral;
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
    this.dnfAbsentDrivers(nowMs);
    const dt = Math.max(0, (nowMs - this.lastTickMs) / 1000);
    this.lastTickMs = nowMs;
    for (const team of this.teams.values()) if (team.status === "racing") this.stepTeam(team, dt, nowMs);
    this.sink.snapshot({
      serverNowMs: nowMs,
      raceElapsedMs: nowMs - this.goAtMs,
      weather: { kind: "clear", intensity: 0 },
      teams: [...this.teams.values()].map((team) => this.teamSnapshot(team)),
    });
    if ([...this.teams.values()].every((team) => team.status !== "racing")) this.complete();
  }

  /**
   * Records driver inputs used by the fuel/heat model.
   * @param teamId - Team.
   * @param inputs - Latest pedals and rpm.
   */
  setInputs(teamId: string, inputs: CarInputs): void {
    const team = this.teams.get(teamId);
    if (team) team.inputs = inputs;
  }

  /**
   * Applies a client-reported impact: solid impacts feed damage and crashes, cones are small mistakes.
   * @param teamId - Team.
   * @param impact - Reported impact (impulse clamped).
   */
  reportImpact(teamId: string, impact: CarImpact): void {
    const team = this.teams.get(teamId);
    if (!team || team.status !== "racing") return;
    const impulse = Math.min(impact.impulse, PENALTY.MAX_IMPACT_IMPULSE);
    if (impact.kind === "cone") {
      team.ledger.addObjectHit(impact.objectId ?? -1);
      return;
    }
    team.pendingImpulse = Math.max(team.pendingImpulse, impulse);
    if (impulse >= MECHANICS.CRASH_IMPULSE) {
      team.ledger.addCrash();
      team.mech = applyCrash(team.mech, this.stage.seed, team.crashIndex);
      team.crashIndex += 1;
    }
  }

  /**
   * Integrates mechanics and penalties for one team and applies mechanical DNF rules.
   * @param team - Team state.
   * @param dt - Seconds since the last tick.
   * @param nowMs - Server time.
   */
  private stepTeam(team: TeamRaceState, dt: number, nowMs: number): void {
    const speed = team.lastPose ? Math.hypot(...team.lastPose.report.v) : 0;
    team.mech = stepMechanics(team.mech, {
      throttle01: team.inputs?.throttle01 ?? 0,
      rpm01: Math.min(1, (team.inputs?.rpm ?? 0) / DRIVETRAIN.REDLINE_RPM),
      speedMs: speed,
      surface: null,
      impactImpulse: team.pendingImpulse,
      ambientTemp01: MECHANICS.DEFAULT_AMBIENT,
      hoodOpen: team.hoodOpen,
      dt,
    });
    team.pendingImpulse = 0;
    team.ledger.trackOffRoad(team.lastLateral, team.progress.progressS, this.stage.corners, dt, nowMs);

    if (team.mech.engineStatus === "failed") team.failedAtMs ??= nowMs;
    else team.failedAtMs = null;
    if (team.mech.damage01 >= 1) this.markDnf(team.teamId, "destroyed");
    else if (team.failedAtMs !== null && nowMs - team.failedAtMs > PENALTY.DNF_AFTER_FAILED_SECONDS * 1000) {
      this.markDnf(team.teamId, "engine_failed");
    }
  }

  /** Marks teams DNF when their driver has been gone longer than the reconnect grace period. */
  private dnfAbsentDrivers(nowMs: number): void {
    for (const team of this.teams.values()) {
      if (team.status !== "racing") continue;
      const driverId = this.room.teams.get(team.teamId)?.driverId;
      const driver = driverId ? this.room.players.get(driverId) : undefined;
      const goneSince = driver && !driver.connected ? driver.disconnectedAtMs : null;
      if (goneSince !== null && goneSince !== undefined && nowMs - goneSince > NET.RECONNECT_GRACE_S * 1000) {
        this.markDnf(team.teamId, "driver_left");
      }
    }
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
      fuel: team.mech.fuel01,
      engineHealth: team.mech.engineHealth01,
      temperature: team.mech.temperature01,
      damage: team.mech.damage01,
      engineStatus: team.mech.engineStatus,
      brokenPart: team.mech.brokenPart,
      penaltyMs: team.ledger.penaltyMs,
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
        penaltyMs: team.ledger.penaltyMs,
        pitMs: 0,
        totalMs: team.status === "finished" ? computeTotalMs(rawMs, team.ledger.penaltyMs, 0) : (1 - (team.progress.progressS - this.stage.startS) / span) * 1e9,
        damage01: team.mech.damage01,
        fuel01: team.mech.fuel01,
        navErrors: team.ledger.navErrors,
        crashes: team.ledger.crashes,
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
