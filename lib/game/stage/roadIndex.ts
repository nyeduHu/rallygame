// lib/game/stage/roadIndex.ts
import { TERRAIN } from "../constants";
import type { RoadPose, RoadSample } from "./types";

/** Result of projecting a world point onto the road centreline. */
export interface RoadProjection {
  /** Index of the segment start sample. */
  index: number;
  /** Arc length of the projected point. */
  s: number;
  /** Interpolated road height. */
  y: number;
  /** Horizontal distance to the centreline. */
  distance: number;
  /** Signed lateral offset; positive is left of travel direction. */
  lateral: number;
  heading: number;
}

/** Keeps cell keys positive and unique for any realistic stage size. */
const CELL_KEY_OFFSET = 32768;
const CELL_KEY_STRIDE = 65536;

/**
 * Spatial hash over centreline samples. Terrain generation, prop placement and
 * race progress all need "nearest road point" queries, so one index serves them all.
 */
export class RoadIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly cellSize: number;

  /**
   * @param samples - Centreline samples (with elevation once available).
   * @param cellSize - Hash cell size.
   */
  constructor(
    private readonly samples: ReadonlyArray<RoadSample>,
    cellSize: number = TERRAIN.SPATIAL_CELL,
  ) {
    this.cellSize = cellSize;
    samples.forEach((sample, index) => {
      const key = this.key(this.cellOf(sample.x), this.cellOf(sample.z));
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(index);
      else this.cells.set(key, [index]);
    });
  }

  /**
   * @param value - World coordinate.
   * @returns Cell coordinate.
   */
  private cellOf(value: number): number {
    return Math.floor(value / this.cellSize);
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
   * Finds the nearest centreline point within maxDistance, refining from the
   * nearest sample to the exact segment projection for smooth heights.
   * @param x - World x.
   * @param z - World z.
   * @param maxDistance - Search radius.
   * @returns Projection or null if nothing is within range.
   */
  nearest(x: number, z: number, maxDistance: number): RoadProjection | null {
    const reach = Math.ceil(maxDistance / this.cellSize);
    const cx = this.cellOf(x);
    const cz = this.cellOf(z);
    let bestIndex = -1;
    let bestDistSq = maxDistance * maxDistance;
    for (let ix = cx - reach; ix <= cx + reach; ix++) {
      for (let iz = cz - reach; iz <= cz + reach; iz++) {
        const bucket = this.cells.get(this.key(ix, iz));
        if (!bucket) continue;
        for (const index of bucket) {
          const sample = this.samples[index];
          const dx = sample.x - x;
          const dz = sample.z - z;
          const distSq = dx * dx + dz * dz;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestIndex = index;
          }
        }
      }
    }
    if (bestIndex < 0) return null;

    const before = projectOnSegment(this.samples, bestIndex - 1, x, z);
    const after = projectOnSegment(this.samples, bestIndex, x, z);
    if (before && after) return before.distance <= after.distance ? before : after;
    return before ?? after;
  }
}

/**
 * Projects a point onto the segment [index, index + 1] of a centreline.
 * @param samples - Centreline samples.
 * @param index - Segment start sample index.
 * @param x - World x.
 * @param z - World z.
 * @returns Projection or null if the segment does not exist.
 */
export function projectOnSegment(samples: ReadonlyArray<RoadSample>, index: number, x: number, z: number): RoadProjection | null {
  if (index < 0 || index >= samples.length - 1) return null;
  const a = samples[index];
  const b = samples[index + 1];
  const sx = b.x - a.x;
  const sz = b.z - a.z;
  const lengthSq = sx * sx + sz * sz;
  const t = lengthSq > 0 ? Math.min(1, Math.max(0, ((x - a.x) * sx + (z - a.z) * sz) / lengthSq)) : 0;
  const px = a.x + sx * t;
  const pz = a.z + sz * t;
  const heading = a.heading + (b.heading - a.heading) * t;
  const leftX = Math.cos(heading);
  const leftZ = -Math.sin(heading);
  const dx = x - px;
  const dz = z - pz;
  return {
    index,
    s: a.s + (b.s - a.s) * t,
    y: a.y + (b.y - a.y) * t,
    distance: Math.hypot(dx, dz),
    lateral: dx * leftX + dz * leftZ,
    heading,
  };
}

/**
 * Interpolates the road pose at an arc length using binary search.
 * @param samples - Centreline samples.
 * @param s - Arc length (clamped to the road).
 * @returns Interpolated pose.
 */
export function poseAt(samples: ReadonlyArray<RoadSample>, s: number): RoadPose {
  const last = samples.length - 1;
  if (s <= samples[0].s) return { ...samples[0] };
  if (s >= samples[last].s) return { ...samples[last] };
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].s <= s) low = mid;
    else high = mid;
  }
  const a = samples[low];
  const b = samples[high];
  const t = (s - a.s) / (b.s - a.s);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    heading: a.heading + (b.heading - a.heading) * t,
  };
}

/**
 * Left-pointing horizontal unit vector for a heading.
 * @param heading - Road heading.
 * @returns [x, z] of the left vector.
 */
export function leftVector(heading: number): [number, number] {
  return [Math.cos(heading), -Math.sin(heading)];
}
