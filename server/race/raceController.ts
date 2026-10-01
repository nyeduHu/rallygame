// server/race/raceController.ts
import { DRIVETRAIN, ON_FOOT, VEHICLE } from "../../lib/game/constants";
import { applyRefuelStep, initialRefuel, stepRefuel, tangle, type RefuelState } from "../../lib/game/refuel/refuelMachine";
import { isInsidePitBox } from "../../lib/game/stage/pitStop";
import { NETWORK, PIT, REFUEL } from "../../lib/game/constants";
import { applyStep, settle, type RepairState } from "../../lib/game/repair/repairMachine";
import { REPAIR } from "../../lib/game/constants";
import { canExit, canReenter, doorPosition } from "../../lib/game/onfoot/onFootController";
import { stepCheckpoints, type CheckpointState } from "../../lib/game/race/checkpointLogic";
import { generateStage } from "../../lib/game/stage/generateStage";
import { NetworkIndex } from "../../lib/game/stage/networkIndex";
import type { StageData } from "../../lib/game/stage/types";
import { NET } from "../../lib/net/netConstants";
import type { CarImpact, CarInputs, FootPose, OnFootView, PoseReport, RefuelStepPayload, RepairStepPayload, Role, RaceCountdown, RaceEvent, RoomResults, TeamSnapshot, WorldSnapshot } from "../../lib/net/protocol";
import type { Room } from "../rooms/room";
import { initialMechanics, stepMechanics, applyCrash, type BrokenPart, type MechanicalState } from "../../lib/game/vehicle/mechanics";
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
  deadEndDistance: number;
  hoodOpen: boolean;
  crashIndex: number;
  /** Server time the engine last failed, for the repair-timeout DNF. */
  failedAtMs: number | null;
  /** Impulse reported since the last tick, applied by the mechanics step. */
  pendingImpulse: number;
  /** Seat occupancy and, while on foot, the last accepted foot pose per role. */
  occupancy: Record<Role, "seat" | "foot">;
  foot: Record<Role, { report: FootPose; atMs: number } | null>;
  repair: RepairState;
  /** Server time the current repair started, and total time spent repairing. */
  repairStartedMs: number | null;
  repairDurationMs: number;
  refuel: RefuelState;
  /** Pit accounting (D9): time spent in the pit box is excluded from raw time. */
  pitStartMs: number | null;
  pitMs: number;
  spilled: boolean;
  pitReady: boolean;
}

/**
 * Heading (yaw about +y) of a pose from its quaternion.
 * @param pose - Pose report.
 * @returns Yaw in radians where 0 faces +z.
 */
function headingOf(pose: PoseReport): number {
  const [x, y, z, w] = pose.q;
  return Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
}

/** Off-road time inside or near the pit box is not a navigation mistake. */
const PIT_NAV_MARGIN_M = 12;

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
  private readonly index: NetworkIndex;
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
    this.index = new NetworkIndex(this.stage.samples, this.stage.branches);
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
        deadEndDistance: 0,
        hoodOpen: false,
        crashIndex: 0,
        failedAtMs: null,
        pendingImpulse: 0,
        occupancy: { driver: "seat", codriver: "seat" },
        foot: { driver: null, codriver: null },
        repair: { kind: "idle" },
        repairStartedMs: null,
        repairDurationMs: 0,
        refuel: initialRefuel(),
        pitStartMs: null,
        pitMs: 0,
        spilled: false,
        pitReady: false,
      });
    }
  }

  /** Starts the synchronised countdown for every team at the same instant. */
  start(): void {
    this.goAtMs = this.now() + NET.COUNTDOWN_SECONDS * 1000;
    this.lastTickMs = this.goAtMs;
    this.sink.countdown({ goAtServerMs: this.goAtMs });
  }

  /**
   * Validates and applies a seat change. Exiting needs a (near) stationary car; re-entering needs
   * the player to stand within reach of their own door.
   * @param teamId - Team.
   * @param role - Player's role.
   * @param to - Requested state.
   * @returns Null when accepted, otherwise an error code.
   */
  setSeat(teamId: string, role: Role, to: "seat" | "foot"): string | null {
    const team = this.teams.get(teamId);
    if (!team || team.status === "dnf" || team.status === "finished") return "not_allowed";
    if (team.occupancy[role] === to) return null;
    const car = team.lastPose?.report;
    if (to === "foot") {
      if (!car || !canExit(Math.hypot(...car.v))) return "car_moving";
      team.occupancy[role] = "foot";
      const yaw = headingOf(car);
      const door = doorPosition({ x: car.p[0], z: car.p[2], yaw }, role);
      const side = role === "driver" ? 1 : -1;
      const out = { x: door.x + side * (ON_FOOT.EXIT_OFFSET_X - ON_FOOT.DOOR_OFFSET_X) * Math.cos(yaw), z: door.z - side * (ON_FOOT.EXIT_OFFSET_X - ON_FOOT.DOOR_OFFSET_X) * Math.sin(yaw) };
      team.foot[role] = { report: { seq: 0, p: [out.x, car.p[1], out.z], yaw }, atMs: this.now() };
      return null;
    }
    const foot = team.foot[role]?.report;
    if (!car || !foot) return "not_allowed";
    const door = doorPosition({ x: car.p[0], z: car.p[2], yaw: headingOf(car) }, role);
    if (!canReenter({ x: foot.p[0], z: foot.p[2] }, door)) return "too_far";
    team.occupancy[role] = "seat";
    team.foot[role] = null;
    return null;
  }

  /**
   * Accepts an on-foot pose if the player is out, the sequence advances, the speed is plausible
   * and they stay near the car.
   * @param teamId - Team.
   * @param role - Player's role.
   * @param pose - Reported pose.
   * @returns True when accepted.
   */
  reportFootPose(teamId: string, role: Role, pose: FootPose): boolean {
    const team = this.teams.get(teamId);
    const previous = team?.foot[role];
    const car = team?.lastPose?.report;
    if (!team || !previous || !car || team.occupancy[role] !== "foot") return false;
    if (!pose.p.every(Number.isFinite) || pose.seq <= previous.report.seq) return false;
    const nowMs = this.now();
    const dt = Math.max(0, (nowMs - previous.atMs) / 1000);
    const moved = Math.hypot(pose.p[0] - previous.report.p[0], pose.p[2] - previous.report.p[2]);
    if (moved > ON_FOOT.MAX_SPEED_MS * ON_FOOT.SERVER_SPEED_SLACK * dt + NET.POSE_SLACK_METRES) return false;
    if (Math.hypot(pose.p[0] - car.p[0], pose.p[2] - car.p[2]) > ON_FOOT.MAX_DISTANCE_FROM_CAR_M) return false;
    team.foot[role] = { report: pose, atMs: nowMs };
    return true;
  }

  /**
   * Applies a repair step if the teammate is in the right place and the machine accepts it.
   * @param teamId - Team.
   * @param role - Player's role (driver or co-driver can repair).
   * @param request - Requested step.
   * @returns Null when accepted, otherwise an error code.
   */
  repairStep(teamId: string, role: Role, request: RepairStepPayload): string | null {
    const team = this.teams.get(teamId);
    if (!team || (team.status !== "racing" && team.status !== "pit")) return "not_allowed";
    const car = team.lastPose?.report;
    const foot = team.foot[role]?.report;
    if (request.step === "IGNITION") {
      if (team.occupancy[role] !== "seat") return "not_in_seat";
    } else {
      if (team.occupancy[role] !== "foot" || !car || !foot) return "not_on_foot";
      if (Math.hypot(foot.p[0] - car.p[0], foot.p[2] - car.p[2]) > REPAIR.MAX_DISTANCE_M) return "too_far";
    }
    const result = applyStep(team.repair, request, { engineStatus: team.mech.engineStatus, brokenPart: team.mech.brokenPart });
    if (!result.ok) return result.error;
    const nowMs = this.now();
    team.repair = settle(result.state);
    // Any accepted step is repair progress, which holds off the engine-failed DNF timer.
    if (team.failedAtMs !== null) team.failedAtMs = nowMs;
    if (team.repairStartedMs === null) team.repairStartedMs = nowMs;
    if (result.penaltySeconds > 0) team.ledger.addPenaltySeconds(result.penaltySeconds);
    if (result.effect === "hood_open") team.hoodOpen = true;
    if (result.effect === "hood_closed") team.hoodOpen = false;
    if (result.effect === "cooled") {
      team.mech = { ...team.mech, temperature01: Math.min(team.mech.temperature01, REPAIR.COOLED_TEMPERATURE), engineStatus: "ok", failHoldSeconds: 0 };
      this.finishRepair(team, nowMs);
    }
    if (result.effect === "engine_restarted") {
      team.mech = {
        ...team.mech,
        engineStatus: "ok",
        brokenPart: null,
        failHoldSeconds: 0,
        engineHealth01: Math.max(team.mech.engineHealth01, REPAIR.RESTORED_HEALTH),
        temperature01: Math.min(team.mech.temperature01, REPAIR.COOLED_TEMPERATURE),
      };
      team.failedAtMs = null;
      this.finishRepair(team, nowMs);
    }
    return null;
  }

  /**
   * Forces an engine failure with a given broken part (scripted tests and debugging).
   * @param teamId - Team.
   * @param part - Part to break.
   */
  forceFailure(teamId: string, part: BrokenPart): void {
    const team = this.teams.get(teamId);
    if (team) team.mech = { ...team.mech, engineStatus: "failed", brokenPart: part };
  }

  /**
   * Sets a team's fuel level (scripted tests and debugging).
   * @param teamId - Team.
   * @param fuel01 - New fuel fraction.
   */
  setFuel(teamId: string, fuel01: number): void {
    const team = this.teams.get(teamId);
    if (team) team.mech = { ...team.mech, fuel01 };
  }

  /** @returns The last accepted car position for a team (tests and tools). */
  lastCarPosition(teamId: string): { x: number; z: number } | null {
    const report = this.teams.get(teamId)?.lastPose?.report;
    return report ? { x: report.p[0], z: report.p[2] } : null;
  }

  /** @returns A player's last accepted on-foot position (tests and tools). */
  footPosition(teamId: string, role: Role): { x: number; z: number } | null {
    const report = this.teams.get(teamId)?.foot[role]?.report;
    return report ? { x: report.p[0], z: report.p[2] } : null;
  }

  /** @returns World position of the team's fuel flap (tests and tools). */
  flapPosition(teamId: string): { x: number; z: number } | null {
    const car = this.teams.get(teamId)?.lastPose?.report;
    if (!car) return null;
    const yaw = headingOf(car);
    const [lx, , lz] = REFUEL.FLAP_LOCAL;
    return { x: car.p[0] + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: car.p[2] - lx * Math.sin(yaw) + lz * Math.cos(yaw) };
  }

  /** Records the elapsed repair time and clears the start marker. */
  private finishRepair(team: TeamRaceState, nowMs: number): void {
    if (team.repairStartedMs !== null) team.repairDurationMs += nowMs - team.repairStartedMs;
    team.repairStartedMs = null;
  }

  /** @returns A team's accumulated time penalties in ms (tests and tools). */
  penaltyMsOf(teamId: string): number {
    return this.teams.get(teamId)?.ledger.penaltyMs ?? 0;
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
    if (!team || (team.status !== "racing" && team.status !== "pit") || nowMs < this.goAtMs) return false;
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
    team.deadEndDistance = projection.deadEndDistance;
    team.ledger.trackDeadEnd(projection.deadEndDistance);
    team.lastPose = { report, atMs: nowMs };
    this.updatePit(team, report, nowMs);
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
    if (!team || (team.status !== "racing" && team.status !== "pit")) return;
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
    for (const team of this.teams.values()) {
      if (team.status === "racing") this.stepTeam(team, dt, nowMs);
      else if (team.status === "pit") this.stepPit(team, dt, nowMs);
    }
    this.sink.snapshot({
      serverNowMs: nowMs,
      raceElapsedMs: nowMs - this.goAtMs,
      weather: { kind: "clear", intensity: 0 },
      teams: [...this.teams.values()].map((team) => this.teamSnapshot(team)),
      onFoot: this.onFootViews(),
    });
    if ([...this.teams.values()].every((team) => team.status === "finished" || team.status === "dnf")) this.complete();
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
    if (!team || (team.status !== "racing" && team.status !== "pit")) return;
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
    const nearPit = this.stage.pit && team.lastPose && isInsidePitBox(this.stage.pit, team.lastPose.report.p[0], team.lastPose.report.p[2], PIT_NAV_MARGIN_M);
    if (!nearPit) team.ledger.trackOffRoad(team.lastLateral, team.progress.progressS, this.stage.corners, dt, nowMs);

    if (team.mech.engineStatus === "failed") team.failedAtMs ??= nowMs;
    else team.failedAtMs = null;
    if (team.mech.damage01 >= 1) this.markDnf(team.teamId, "destroyed");
    else if (team.failedAtMs !== null && nowMs - team.failedAtMs > PENALTY.DNF_AFTER_FAILED_SECONDS * 1000) {
      this.markDnf(team.teamId, "engine_failed");
    }
  }

  /**
   * Moves a team into or out of the pit box and keeps the pit clock (D9).
   * @param team - Team state.
   * @param report - Latest accepted pose.
   * @param nowMs - Server time.
   */
  private updatePit(team: TeamRaceState, report: PoseReport, nowMs: number): void {
    const pit = this.stage.pit;
    if (!pit) return;
    const inside = isInsidePitBox(pit, report.p[0], report.p[2]);
    const speed = Math.hypot(...report.v);
    if (team.status === "racing" && inside && speed < PIT.MAX_ENTRY_SPEED_MS) {
      team.status = "pit";
      team.pitStartMs = nowMs;
      team.pitReady = false;
      this.sink.event({ teamId: team.teamId, kind: "pit_enter", atServerMs: nowMs });
    } else if (team.status === "pit" && !inside) {
      team.pitMs += nowMs - (team.pitStartMs ?? nowMs);
      team.pitStartMs = null;
      team.status = "racing";
      team.refuel = initialRefuel();
      team.pitReady = false;
      this.sink.event({ teamId: team.teamId, kind: "pit_exit", atServerMs: nowMs, data: { pitMs: team.pitMs } });
    }
  }

  /**
   * Applies a co-driver refuelling step: on foot, near the pump (hose, pump lever) or the car flap.
   * @param teamId - Team.
   * @param role - Player's role (only the co-driver refuels).
   * @param request - Requested step.
   * @returns Null when accepted, otherwise an error code.
   */
  refuelStep(teamId: string, role: Role, request: RefuelStepPayload): string | null {
    const team = this.teams.get(teamId);
    const pit = this.stage.pit;
    const car = team?.lastPose?.report;
    const foot = team?.foot.codriver?.report;
    if (!team || !pit || role !== "codriver" || team.status !== "pit" || !car) return "not_allowed";
    if (team.occupancy.codriver !== "foot" || !foot) return "not_on_foot";
    const yaw = headingOf(car);
    const [lx, , lz] = REFUEL.FLAP_LOCAL;
    const flap = { x: car.p[0] + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: car.p[2] - lx * Math.sin(yaw) + lz * Math.cos(yaw) };
    const nearFlap = Math.hypot(foot.p[0] - flap.x, foot.p[2] - flap.z) <= REFUEL.MAX_DISTANCE_M;
    const nearPump = Math.hypot(foot.p[0] - pit.pump.x, foot.p[2] - pit.pump.z) <= REFUEL.MAX_DISTANCE_M;
    const atFlap = request.step === "OPEN_FLAP" || request.step === "CLOSE_FLAP" || request.step === "CONNECT" || request.step === "DISCONNECT";
    if (atFlap ? !nearFlap : !nearPump) return "too_far";
    const result = applyRefuelStep(team.refuel, request.step);
    if (!result.ok) return result.error;
    team.refuel = result.state;
    return null;
  }

  /**
   * Integrates fuel while the pump runs, snaps tangled hoses, penalises spills, and announces
   * when the team may leave.
   * @param team - Team state.
   * @param dt - Seconds since the last tick.
   * @param nowMs - Server time.
   */
  private stepPit(team: TeamRaceState, dt: number, nowMs: number): void {
    const pit = this.stage.pit;
    if (!pit) return;
    const foot = team.foot.codriver?.report;
    if (foot && team.refuel.kind === "hose_held") {
      const result = tangle(team.refuel, Math.hypot(foot.p[0] - pit.pump.x, foot.p[2] - pit.pump.z));
      if (result.tangled) {
        team.refuel = result.state;
        team.ledger.addPenaltySeconds(REFUEL.TANGLE_PENALTY_S);
      }
    }
    const filled = stepRefuel(team.refuel, team.mech.fuel01, dt);
    team.mech = { ...team.mech, fuel01: filled.fuel01 };
    if (filled.overflowed && !team.spilled) {
      team.spilled = true;
      team.ledger.addPenaltySeconds(REFUEL.SPILL_PENALTY_S);
    }
    const ready =
      team.mech.fuel01 >= PIT.MIN_FUEL_TO_RELEASE &&
      team.mech.engineStatus !== "failed" &&
      !team.hoodOpen &&
      team.occupancy.driver === "seat" &&
      team.occupancy.codriver === "seat" &&
      team.refuel.kind === "idle";
    if (ready && !team.pitReady) this.sink.event({ teamId: team.teamId, kind: "pit_release", atServerMs: nowMs });
    team.pitReady = ready;
  }

  /** Marks teams DNF when their driver has been gone longer than the reconnect grace period. */
  private dnfAbsentDrivers(nowMs: number): void {
    for (const team of this.teams.values()) {
      if (team.status !== "racing" && team.status !== "pit") continue;
      const driverId = this.room.teams.get(team.teamId)?.driverId;
      const driver = driverId ? this.room.players.get(driverId) : undefined;
      const goneSince = driver && !driver.connected ? driver.disconnectedAtMs : null;
      if (goneSince !== null && goneSince !== undefined && nowMs - goneSince > NET.RECONNECT_GRACE_S * 1000) {
        this.markDnf(team.teamId, "driver_left");
      }
    }
  }

  /** @returns Every player currently out of a car, for rendering. */
  private onFootViews(): OnFootView[] {
    const views: OnFootView[] = [];
    for (const team of this.teams.values()) {
      for (const role of ["driver", "codriver"] as const) {
        const foot = team.foot[role];
        if (team.occupancy[role] === "foot" && foot) views.push({ teamId: team.teamId, role, p: foot.report.p, yaw: foot.report.yaw });
      }
    }
    return views;
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
      occupancy: team.occupancy,
      repair: "part" in team.repair ? { kind: team.repair.kind, part: team.repair.part } : { kind: team.repair.kind },
      hoodOpen: team.hoodOpen,
      refuel: team.refuel,
      pitReady: team.pitReady,
      wrongWay: team.deadEndDistance > NETWORK.WRONG_WAY_GRACE_M,
    };
  }

  /** Builds the ranking, sends per-team results and the full table, and ends the room. */
  private complete(): void {
    this.done = true;
    const span = this.stage.finishS - this.stage.startS;
    const entries: TeamResult[] = [...this.teams.values()].map((team) => {
      const rawMs = team.finishedAtMs === null ? 0 : team.finishedAtMs - this.goAtMs - team.pitMs;
      return {
        teamId: team.teamId,
        name: team.name,
        status: team.status === "finished" ? "finished" : "dnf",
        rawMs,
        penaltyMs: team.ledger.penaltyMs,
        pitMs: team.pitMs,
        totalMs: team.status === "finished" ? computeTotalMs(rawMs, team.ledger.penaltyMs, team.pitMs) : (1 - (team.progress.progressS - this.stage.startS) / span) * 1e9,
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
