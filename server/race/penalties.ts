// server/race/penalties.ts
import { navMistakeSeconds, PENALTY } from "../../lib/game/race/penalties";
import { NETWORK, ROAD } from "../../lib/game/constants";
import type { CornerInfo } from "../../lib/game/stage/types";

const MS_PER_SECOND = 1000;
const CORRIDOR_HALF_WIDTH = ROAD.WIDTH / 2 + ROAD.SHOULDER_WIDTH;

/** Per-team penalty ledger: time penalties, crash and navigation counters. */
export class PenaltyLedger {
  penaltyMs = 0;
  navErrors = 0;
  crashes = 0;
  smallMistakes = 0;
  wrongTurns = 0;
  private onWrongTurn = false;
  private offRoadSeconds = 0;
  private lastNavAtMs = Number.NEGATIVE_INFINITY;
  private readonly hitCones = new Set<number>();

  /**
   * Records a crash.
   * @returns Penalty added in milliseconds.
   */
  addCrash(): number {
    this.crashes += 1;
    return this.add(PENALTY.CRASH_SECONDS);
  }

  /**
   * Records a cone or barrier hit; each object counts once.
   * @param objectId - Stable id of the object that was hit.
   * @returns Penalty added in milliseconds (0 for a repeat).
   */
  addObjectHit(objectId: number): number {
    if (this.hitCones.has(objectId)) return 0;
    this.hitCones.add(objectId);
    this.smallMistakes += 1;
    return this.add(PENALTY.SMALL_MISTAKE_SECONDS);
  }

  /**
   * Tracks off-road time and issues a navigation penalty when it is long enough near a corner.
   * @param lateral - Signed distance from the road centreline.
   * @param progressS - Car arc length.
   * @param corners - Stage corners.
   * @param dt - Seconds since the last update.
   * @param nowMs - Server time.
   * @returns Penalty added in milliseconds (0 most of the time).
   */
  trackOffRoad(lateral: number, progressS: number, corners: ReadonlyArray<CornerInfo>, dt: number, nowMs: number): number {
    if (Math.abs(lateral) <= CORRIDOR_HALF_WIDTH) {
      this.offRoadSeconds = 0;
      return 0;
    }
    this.offRoadSeconds += dt;
    const nearCorner = corners.some(
      (corner) => corner.endS > progressS && corner.startS - progressS < PENALTY.NAV_CORNER_LOOKAHEAD_M,
    );
    const cooled = nowMs - this.lastNavAtMs >= PENALTY.NAV_COOLDOWN_S * MS_PER_SECOND;
    if (this.offRoadSeconds < PENALTY.NAV_OFFROAD_GRACE_S || !nearCorner || !cooled) return 0;
    this.navErrors += 1;
    this.lastNavAtMs = nowMs;
    const added = this.add(navMistakeSeconds(this.offRoadSeconds));
    this.offRoadSeconds = 0;
    return added;
  }

  /**
   * Tracks time spent far into a dead-end road; charges one navigation mistake per visit.
   * @param deadEndDistance - Metres driven into a dead end (0 when not on one).
   * @returns Penalty added in milliseconds (0 unless a wrong turn was just confirmed).
   */
  trackDeadEnd(deadEndDistance: number): number {
    if (deadEndDistance <= NETWORK.WRONG_WAY_GRACE_M) {
      // Back near the junction: the next excursion counts as a new wrong turn.
      if (deadEndDistance < NETWORK.WRONG_WAY_GRACE_M / 2) this.onWrongTurn = false;
      return 0;
    }
    if (this.onWrongTurn) return 0;
    this.onWrongTurn = true;
    this.wrongTurns += 1;
    this.navErrors += 1;
    return this.add(NETWORK.WRONG_WAY_PENALTY_S);
  }

  /**
   * Adds a flat time penalty (for example a wrong repair guess).
   * @param seconds - Penalty in seconds.
   */
  addPenaltySeconds(seconds: number): void {
    this.add(seconds);
  }

  /** Adds seconds to the ledger. */
  private add(seconds: number): number {
    const ms = seconds * MS_PER_SECOND;
    this.penaltyMs += ms;
    return ms;
  }
}
