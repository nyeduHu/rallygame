// lib/net/snapshotBuffer.ts
import { Quaternion } from "three";
import { NET } from "./netConstants";
import type { TeamSnapshot } from "./protocol";

interface TimedSnapshot {
  atMs: number;
  snapshot: TeamSnapshot;
}

/** Interpolated pose returned to the renderer. */
export type SampledPose = TeamSnapshot;

const BUFFER_WINDOW_MS = 1000;
const MAX_EXTRAPOLATION_MS = 250;
const MS_PER_SECOND = 1000;

/** Per-team ring buffer of server snapshots, interpolated at a delayed render time. */
export class SnapshotBuffer {
  private readonly samples = new Map<string, TimedSnapshot[]>();

  /**
   * Stores a team snapshot and drops anything older than the buffer window.
   * @param teamId - Team the snapshot belongs to.
   * @param snapshot - Server snapshot entry.
   * @param serverNowMs - Server time the snapshot was produced.
   */
  add(teamId: string, snapshot: TeamSnapshot, serverNowMs: number): void {
    const bucket = (this.samples.get(teamId) ?? []).filter((entry) => serverNowMs - entry.atMs <= BUFFER_WINDOW_MS);
    bucket.push({ atMs: serverNowMs, snapshot });
    this.samples.set(teamId, bucket);
  }

  /**
   * Interpolates (or briefly extrapolates) a team's pose.
   * @param teamId - Team to sample.
   * @param renderTimeMs - Server-time estimate minus the interpolation delay.
   * @returns Pose, or null when nothing has been received.
   */
  sample(teamId: string, renderTimeMs: number): SampledPose | null {
    const bucket = this.samples.get(teamId);
    const newest = bucket?.[bucket.length - 1];
    if (!bucket || !newest) return null;
    const oldest = bucket[0];
    if (renderTimeMs <= oldest.atMs) return oldest.snapshot;

    if (renderTimeMs >= newest.atMs) {
      const ahead = Math.min(renderTimeMs - newest.atMs, MAX_EXTRAPOLATION_MS) / MS_PER_SECOND;
      const { p, v } = newest.snapshot;
      return { ...newest.snapshot, p: [p[0] + v[0] * ahead, p[1] + v[1] * ahead, p[2] + v[2] * ahead] };
    }

    const nextIndex = bucket.findIndex((entry) => entry.atMs >= renderTimeMs);
    const before = bucket[nextIndex - 1];
    const after = bucket[nextIndex];
    const t = (renderTimeMs - before.atMs) / (after.atMs - before.atMs);
    const a = before.snapshot;
    const b = after.snapshot;
    const q = new Quaternion(...a.q).slerp(new Quaternion(...b.q), t);
    return {
      ...b,
      p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t, a.p[2] + (b.p[2] - a.p[2]) * t],
      q: [q.x, q.y, q.z, q.w],
      steer: a.steer + (b.steer - a.steer) * t,
    };
  }

  /** @returns The render time to pass to {@link sample}. */
  static renderTime(serverNowMs: number): number {
    return serverNowMs - NET.INTERPOLATION_DELAY_MS;
  }
}
