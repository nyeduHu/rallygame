// lib/game/stage/networkIndex.ts
import { RoadIndex, type RoadProjection } from "./roadIndex";
import type { RoadBranch, RoadSample } from "./types";

/** Projection onto the road network; `s` is the equivalent arc length on the reference route. */
export interface NetworkProjection extends RoadProjection {
  /** Branch the point is nearest to, or null for the reference route. */
  branchId: number | null;
  /** Arc length along that branch (equals `s` for the reference route). */
  localS: number;
  /** Metres driven into a dead end (0 elsewhere). */
  deadEndDistance: number;
}

/**
 * Maps a position on a branch to the arc length it is worth on the reference route: an
 * alternative interpolates between its fork and join (so a longer detour progresses slower), a
 * dead end holds at its fork.
 * @param branch - The branch.
 * @param localS - Arc length along the branch.
 * @returns Equivalent reference arc length.
 */
export function equivalentS(branch: RoadBranch, localS: number): number {
  if (branch.kind === "dead_end" || branch.joinS === null) return branch.forkS;
  const fraction = branch.length > 0 ? Math.min(1, Math.max(0, localS / branch.length)) : 0;
  return branch.forkS + (branch.joinS - branch.forkS) * fraction;
}

/**
 * Spatial index over the reference route and all branches. Race progress, terrain and props
 * ask it "nearest road" questions, so every road counts as road.
 */
export class NetworkIndex {
  private readonly reference: RoadIndex;
  private readonly branchIndexes: Array<{ branch: RoadBranch; index: RoadIndex }>;

  /**
   * @param samples - Reference route samples.
   * @param branches - Side roads.
   */
  constructor(samples: ReadonlyArray<RoadSample>, branches: ReadonlyArray<RoadBranch> = []) {
    this.reference = new RoadIndex(samples);
    this.branchIndexes = branches.map((branch) => ({ branch, index: new RoadIndex(branch.samples) }));
  }

  /**
   * Finds the nearest road point within maxDistance, on any road. Ties go to the reference route.
   * @param x - World x.
   * @param z - World z.
   * @param maxDistance - Search radius.
   * @returns Projection or null if no road is in range.
   */
  nearest(x: number, z: number, maxDistance: number): NetworkProjection | null {
    const main = this.reference.nearest(x, z, maxDistance);
    let best: NetworkProjection | null = main ? { ...main, branchId: null, localS: main.s, deadEndDistance: 0 } : null;
    for (const { branch, index } of this.branchIndexes) {
      const hit = index.nearest(x, z, maxDistance);
      if (!hit || (best && hit.distance >= best.distance)) continue;
      best = {
        ...hit,
        s: equivalentS(branch, hit.s),
        branchId: branch.id,
        localS: hit.s,
        deadEndDistance: branch.kind === "dead_end" ? hit.s : 0,
      };
    }
    return best;
  }
}
