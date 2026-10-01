// server/race/poseValidator.ts
import { NET } from "../../lib/net/netConstants";
import type { PoseReport } from "../../lib/net/protocol";

/** Last accepted pose plus the server time it was accepted. */
export interface AcceptedPose {
  report: PoseReport;
  atMs: number;
}

/** Why a pose was rejected. */
export type PoseRejection = "non_finite" | "too_fast" | "teleport" | "stale_seq" | "off_road";

/**
 * Checks a reported pose against physical plausibility so a forged client cannot teleport.
 * @param report - Pose sent by the driver client.
 * @param previous - Last accepted pose, or null for the first report.
 * @param nowMs - Server time of receipt.
 * @param distanceFromRoad - Distance from the road centreline, or null when off the index.
 * @returns Null when accepted, otherwise the rejection reason.
 */
export function validatePose(
  report: PoseReport,
  previous: AcceptedPose | null,
  nowMs: number,
  distanceFromRoad: number | null,
): PoseRejection | null {
  const numbers = [...report.p, ...report.q, ...report.v];
  if (!numbers.every(Number.isFinite)) return "non_finite";
  const speed = Math.hypot(report.v[0], report.v[1], report.v[2]);
  if (speed > NET.MAX_SPEED_MS) return "too_fast";
  if (previous) {
    if (report.seq <= previous.report.seq) return "stale_seq";
    // A reset-to-road is a legitimate jump; the road-distance check below still applies.
    if (report.epoch > previous.report.epoch) return distanceFromRoad === null || distanceFromRoad > NET.MAX_OFF_ROAD_METRES ? "off_road" : null;
    const dt = Math.max(0, (nowMs - previous.atMs) / 1000);
    const previousSpeed = Math.hypot(...previous.report.v);
    const moved = Math.hypot(
      report.p[0] - previous.report.p[0],
      report.p[1] - previous.report.p[1],
      report.p[2] - previous.report.p[2],
    );
    if (moved > previousSpeed * dt + NET.POSE_SLACK_METRES) return "teleport";
  }
  if (distanceFromRoad === null || distanceFromRoad > NET.MAX_OFF_ROAD_METRES) return "off_road";
  return null;
}

/** Sliding 10-second violation counter used to flag suspicious clients in logs. */
export class ViolationCounter {
  private times: number[] = [];

  /**
   * Records a violation.
   * @param nowMs - Server time.
   * @returns True once the team exceeds the per-window limit.
   */
  record(nowMs: number): boolean {
    this.times = this.times.filter((t) => nowMs - t < 10_000);
    this.times.push(nowMs);
    return this.times.length >= NET.MAX_VIOLATIONS_PER_10S;
  }
}
