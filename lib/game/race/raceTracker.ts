// lib/game/race/raceTracker.ts
import { SIMULATION, VEHICLE } from "../constants";
import { stepCheckpoints } from "./checkpointLogic";
import { RoadIndex } from "../stage/roadIndex";
import type { StageData } from "../stage/types";

export type RacePhase = "ready" | "countdown" | "running" | "finished";

/** Immutable race status published to the HUD. */
export interface RaceSnapshot {
  phase: RacePhase;
  countdownRemaining: number;
  /** Stage time in seconds. */
  elapsed: number;
  checkpointsPassed: number;
  checkpointTotal: number;
  splits: number[];
  finishTime: number | null;
  /** 0..1 along the stage. */
  progress: number;
}

/** How far from the road the car may be and still be tracked. */
const TRACKING_RADIUS = 60;

/**
 * Stage timing state machine: countdown, running clock, ordered checkpoints and
 * finish-line detection. Uses arc-length crossings so cutting across hairpins can't
 * skip a gate.
 */
export class RaceTracker {
  private phase: RacePhase = "ready";
  private countdown: number = SIMULATION.COUNTDOWN_SECONDS;
  private elapsed = 0;
  private nextCheckpoint = 0;
  private splits: number[] = [];
  private finishTime: number | null = null;
  private progressS: number;
  private readonly index: RoadIndex;

  /**
   * @param stage - Generated stage.
   */
  constructor(private readonly stage: StageData) {
    this.index = new RoadIndex(stage.samples);
    this.progressS = stage.startS - VEHICLE.SPAWN_BEHIND_START;
  }

  /** Back to the pre-start state. */
  reset(): void {
    this.phase = "ready";
    this.countdown = SIMULATION.COUNTDOWN_SECONDS;
    this.elapsed = 0;
    this.nextCheckpoint = 0;
    this.splits = [];
    this.finishTime = null;
    this.progressS = this.stage.startS - VEHICLE.SPAWN_BEHIND_START;
  }

  /** Starts the 3-2-1 countdown (from the ready state only). */
  beginCountdown(): void {
    if (this.phase === "ready") this.phase = "countdown";
  }

  /** @returns Current phase. */
  get currentPhase(): RacePhase {
    return this.phase;
  }

  /** @returns True when the driver may control the car. */
  get controlsEnabled(): boolean {
    return this.phase === "running" || this.phase === "finished";
  }

  /** @returns Last tracked arc length, used for reset-to-road. */
  get lastProgressS(): number {
    return this.progressS;
  }

  /**
   * Re-anchors progress after the car is teleported (reset to road).
   * @param s - New arc length.
   */
  teleportTo(s: number): void {
    this.progressS = s;
  }

  /**
   * Advances timers and detects gate crossings.
   * @param dt - Fixed step length.
   * @param x - Car world x.
   * @param z - Car world z.
   */
  update(dt: number, x: number, z: number): void {
    if (this.phase === "countdown") {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.phase = "running";
      }
      return;
    }
    if (this.phase !== "running") return;

    this.elapsed += dt;
    const projection = this.index.nearest(x, z, TRACKING_RADIUS);
    if (!projection) return;
    const result = stepCheckpoints(
      { progressS: this.progressS, nextCheckpoint: this.nextCheckpoint, finished: false },
      projection.s,
      projection.lateral,
      this.stage.checkpointS,
      this.stage.finishS,
    );
    this.progressS = result.state.progressS;
    this.nextCheckpoint = result.state.nextCheckpoint;
    if (result.event?.kind === "checkpoint") {
      this.splits = [...this.splits, this.elapsed];
    } else if (result.event?.kind === "finish") {
      this.finishTime = this.elapsed;
      this.phase = "finished";
    }
  }

  /** @returns Snapshot for the HUD. */
  snapshot(): RaceSnapshot {
    const span = this.stage.finishS - this.stage.startS;
    return {
      phase: this.phase,
      countdownRemaining: this.countdown,
      elapsed: this.finishTime ?? this.elapsed,
      checkpointsPassed: this.nextCheckpoint,
      checkpointTotal: this.stage.checkpointS.length,
      splits: this.splits,
      finishTime: this.finishTime,
      progress: Math.min(1, Math.max(0, (this.progressS - this.stage.startS) / span)),
    };
  }
}
