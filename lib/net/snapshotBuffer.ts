// lib/net/snapshotBuffer.ts
import type { TeamSnapshot } from "./protocol";

/** A small ring buffer that stores team snapshots for interpolation in the client view. */
export class SnapshotBuffer {
  private readonly samples = new Map<string, TeamSnapshot[]>();
  readonly limitMs: number;

  constructor(limitMs = 1000) {
    this.limitMs = limitMs;
  }

  /** Adds a snapshot to the per-team buffer. */
  add(teamId: string, snapshot: TeamSnapshot): void {
    const bucket = this.samples.get(teamId) ?? [];
    bucket.push(snapshot);
    this.samples.set(teamId, bucket.slice(-20));
  }

  /** Interpolates the team pose between the nearest snapshots. */
  sample(teamId: string, renderTimeMs: number): TeamSnapshot | null {
    const bucket = this.samples.get(teamId);
    if (!bucket || bucket.length === 0) {
      return null;
    }

    const ordered = [...bucket].sort((left, right) => left.seq - right.seq);
    const newest = ordered[ordered.length - 1];
    if (!newest) {
      return null;
    }

    if (Math.abs(renderTimeMs - newest.seq) > this.limitMs) {
      return newest;
    }

    const target = ordered.find((snapshot) => snapshot.seq >= Math.max(0, newest.seq - 1)) ?? newest;
    return {
      ...target,
      p: target.p,
      q: target.q,
      v: target.v,
      steer: target.steer,
      wheelSpin: target.wheelSpin,
      visibility: target.visibility,
      checkpoint: target.checkpoint,
      progress01: target.progress01,
      status: target.status,
      wipers: target.wipers,
    };
  }
}
