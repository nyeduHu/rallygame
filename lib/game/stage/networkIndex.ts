// lib/game/stage/networkIndex.ts
import { MAZE, TERRAIN } from "../constants";
import { projectOnSegment, type RoadProjection } from "./roadIndex";
import type { RoadBranch, RoadSample } from "./types";

/** Projection onto the road network; `s` is the equivalent arc length on the reference route. */
export interface NetworkProjection extends RoadProjection {
  /** Branch the point is nearest to, or null for the reference route. */
  branchId: number | null;
  /** Arc length along that branch (equals `s` for the reference route). */
  localS: number;
  /** Metres driven into a dead end, counted from the route (0 elsewhere). */
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

/** Largest sample count of one road, used to pack (road, sample) into one number. */
const ROAD_STRIDE = 1_000_000;

/** Keeps cell keys positive and unique for any realistic stage size. */
const CELL_KEY_OFFSET = 32768;
const CELL_KEY_STRIDE = 65536;

/** One indexed road: the reference route (`branch` null) or a side road. */
interface IndexedRoad {
  branch: RoadBranch | null;
  samples: ReadonlyArray<RoadSample>;
}

/**
 * Spatial index over the reference route and all branches in one hash, so a query costs the
 * same however many side roads a maze has. Ties go to the reference route.
 */
export class NetworkIndex {
  private readonly roads: IndexedRoad[];
  private readonly cells = new Map<number, number[]>();
  private readonly cellSize = TERRAIN.SPATIAL_CELL;

  /**
   * @param samples - Reference route samples.
   * @param branches - Side roads.
   */
  constructor(samples: ReadonlyArray<RoadSample>, branches: ReadonlyArray<RoadBranch> = []) {
    this.roads = [{ branch: null, samples }, ...branches.map((branch) => ({ branch, samples: branch.samples }))];
    this.roads.forEach((road, roadIndex) => {
      road.samples.forEach((sample, index) => {
        const key = this.key(Math.floor(sample.x / this.cellSize), Math.floor(sample.z / this.cellSize));
        const bucket = this.cells.get(key);
        // Pack road and sample into one number; samples per road stay far below the stride.
        const packed = roadIndex * ROAD_STRIDE + index;
        if (bucket) bucket.push(packed);
        else this.cells.set(key, [packed]);
      });
    });
  }

  /**
   * @param cx - Cell x.
   * @param cz - Cell z.
   * @returns Packed integer key.
   */
  private key(cx: number, cz: number): number {
    return (cx + CELL_KEY_OFFSET) * CELL_KEY_STRIDE + (cz + CELL_KEY_OFFSET);
  }

  /**
   * Finds the nearest road point within maxDistance, on any road. Side roads must beat the
   * reference route by a small margin, so where they overlap at a junction the route wins.
   * @param x - World x.
   * @param z - World z.
   * @param maxDistance - Search radius.
   * @returns Projection or null if no road is in range.
   */
  nearest(x: number, z: number, maxDistance: number): NetworkProjection | null {
    const reach = Math.ceil(maxDistance / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    let bestPacked = -1;
    let bestScore = maxDistance * maxDistance;
    let bestRaw = Infinity;
    const bias = MAZE.BRANCH_TIE_BIAS_M;
    for (let ix = cx - reach; ix <= cx + reach; ix++) {
      for (let iz = cz - reach; iz <= cz + reach; iz++) {
        const bucket = this.cells.get(this.key(ix, iz));
        if (!bucket) continue;
        for (const packed of bucket) {
          const roadIndex = Math.floor(packed / ROAD_STRIDE);
          const sample = this.roads[roadIndex].samples[packed - roadIndex * ROAD_STRIDE];
          const dx = sample.x - x;
          const dz = sample.z - z;
          const raw = dx * dx + dz * dz;
          const score = roadIndex === 0 ? raw : raw + bias * bias + 2 * bias * Math.sqrt(raw);
          if (score < bestScore) {
            bestScore = score;
            bestRaw = raw;
            bestPacked = packed;
          }
        }
      }
    }
    if (bestPacked < 0 || bestRaw > maxDistance * maxDistance) return null;
    const roadIndex = Math.floor(bestPacked / ROAD_STRIDE);
    const road = this.roads[roadIndex];
    const index = bestPacked - roadIndex * ROAD_STRIDE;
    const before = projectOnSegment(road.samples, index - 1, x, z);
    const after = projectOnSegment(road.samples, index, x, z);
    const hit = before && after ? (before.distance <= after.distance ? before : after) : (before ?? after);
    if (!hit) return null;
    if (!road.branch) return { ...hit, branchId: null, localS: hit.s, deadEndDistance: 0 };
    return {
      ...hit,
      s: equivalentS(road.branch, hit.s),
      branchId: road.branch.id,
      localS: hit.s,
      deadEndDistance: road.branch.kind === "dead_end" ? road.branch.rootDistance + hit.s : 0,
    };
  }
}
