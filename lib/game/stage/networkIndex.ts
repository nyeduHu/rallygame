// lib/game/stage/networkIndex.ts
import { ROAD_NETWORK, TERRAIN } from "../constants";
import { projectOnSegment, type RoadProjection } from "./roadIndex";
import type { RoadBranch, RoadSample } from "./types";

/** Projection onto the road network; `s` is race progress (route metres, whichever road the point is on). */
export interface NetworkProjection extends RoadProjection {
  /** Branch the point is nearest to, or null for the reference route. */
  branchId: number | null;
  /** Arc length along that branch (equals `s` for the reference route). */
  localS: number;
  /** Metres driven into a dead end, counted from the route (0 elsewhere). */
  deadEndDistance: number;
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
 * Spatial index over the reference route and all other roads in one hash, so a query costs the
 * same however many roads there are. Ties go to the reference route.
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
    const bias = ROAD_NETWORK.BRANCH_TIE_BIAS_M;
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
    const a = road.samples[hit.index];
    const b = road.samples[hit.index + 1];
    const t = b.s > a.s ? (hit.s - a.s) / (b.s - a.s) : 0;
    const { progress, pendant } = road.branch;
    return {
      ...hit,
      s: progress[hit.index] + (progress[hit.index + 1] - progress[hit.index]) * t,
      branchId: road.branch.id,
      localS: hit.s,
      deadEndDistance: pendant[hit.index] + (pendant[hit.index + 1] - pendant[hit.index]) * t,
    };
  }
}
