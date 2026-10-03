// lib/game/stage/progress.ts
import { ROAD_NETWORK } from "../constants";
import type { RoadSample } from "./types";

/** Keeps spatial-hash keys unique for any realistic stage size. */
const HASH_STRIDE = 100_000;

/** A min-heap of (node, distance) pairs for Dijkstra. */
class MinHeap {
  private readonly nodes: number[] = [];
  private readonly keys: number[] = [];

  /** @returns True when empty. */
  get empty(): boolean {
    return this.nodes.length === 0;
  }

  /**
   * @param node - Node id.
   * @param key - Priority (distance).
   */
  push(node: number, key: number): void {
    let i = this.nodes.length;
    this.nodes.push(node);
    this.keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** @returns The node with the smallest key and that key. */
  pop(): { node: number; key: number } {
    const top = { node: this.nodes[0], key: this.keys[0] };
    const lastNode = this.nodes.pop() as number;
    const lastKey = this.keys.pop() as number;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.nodes.length && this.keys[left] < this.keys[smallest]) smallest = left;
        if (right < this.nodes.length && this.keys[right] < this.keys[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  /**
   * @param a - First index.
   * @param b - Second index.
   */
  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

/** Distances to the finish plus the next hop toward it for every sample. */
export interface FinishField {
  dist: Float64Array;
  /** Next sample on the shortest way to the finish (-1 at the finish). */
  next: Int32Array;
}

/**
 * Every road sample as a node of one graph: neighbours along a road, plus links wherever two
 * roads touch (junctions and crossings). Used to turn the network into a progress measure
 * (distance to the finish) and to find the shortest way home for hints.
 */
export class SampleGraph {
  /** First node of each road. */
  readonly offsets: number[] = [];
  readonly samples: RoadSample[] = [];
  readonly roadOf: number[] = [];
  private readonly neighbours: Array<Array<{ to: number; cost: number }>> = [];

  /**
   * @param roads - Centrelines of every road (the route first).
   */
  constructor(private readonly roads: ReadonlyArray<ReadonlyArray<RoadSample>>) {
    roads.forEach((road, roadIndex) => {
      this.offsets.push(this.samples.length);
      road.forEach((sample) => {
        this.samples.push(sample);
        this.roadOf.push(roadIndex);
        this.neighbours.push([]);
      });
    });
    roads.forEach((road, roadIndex) => {
      for (let i = 1; i < road.length; i++) this.link(this.offsets[roadIndex] + i - 1, this.offsets[roadIndex] + i);
    });
    this.linkTouchingRoads();
  }

  /** @returns Number of nodes. */
  get size(): number {
    return this.samples.length;
  }

  /**
   * @param road - Road index.
   * @param index - Sample index on that road.
   * @returns Global node id.
   */
  nodeOf(road: number, index: number): number {
    return this.offsets[road] + index;
  }

  /**
   * Adds an undirected link weighted by distance.
   * @param a - Node.
   * @param b - Node.
   */
  private link(a: number, b: number): void {
    const cost = Math.hypot(this.samples[a].x - this.samples[b].x, this.samples[a].z - this.samples[b].z);
    this.neighbours[a].push({ to: b, cost });
    this.neighbours[b].push({ to: a, cost });
  }

  /** Links samples of different roads that lie within driving contact of each other. */
  private linkTouchingRoads(): void {
    const cell = ROAD_NETWORK.LINK_DISTANCE_M;
    const hash = new Map<number, number[]>();
    const key = (cx: number, cz: number): number => cx * HASH_STRIDE + cz;
    this.samples.forEach((sample, node) => {
      const k = key(Math.floor(sample.x / cell), Math.floor(sample.z / cell));
      const bucket = hash.get(k);
      if (bucket) bucket.push(node);
      else hash.set(k, [node]);
    });
    const limitSq = cell * cell;
    this.samples.forEach((sample, node) => {
      const cx = Math.floor(sample.x / cell);
      const cz = Math.floor(sample.z / cell);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          for (const other of hash.get(key(ix, iz)) ?? []) {
            if (other <= node || this.roadOf[other] === this.roadOf[node]) continue;
            if ((this.samples[other].x - sample.x) ** 2 + (this.samples[other].z - sample.z) ** 2 <= limitSq) this.link(node, other);
          }
        }
      }
    });
  }

  /**
   * Nodes that sit where two roads meet.
   * @returns Node ids with a link to another road.
   */
  junctionNodes(): number[] {
    return this.samples.map((_, node) => node).filter((node) => this.neighbours[node].some((edge) => this.roadOf[edge.to] !== this.roadOf[node]));
  }

  /**
   * Shortest distance to the targets for every node, and the next hop on that way.
   * @param targets - Node ids with distance 0.
   * @returns Distances and next hops.
   */
  distancesTo(targets: ReadonlyArray<number>): FinishField {
    const dist = new Float64Array(this.size).fill(Infinity);
    const next = new Int32Array(this.size).fill(-1);
    const heap = new MinHeap();
    for (const target of targets) {
      dist[target] = 0;
      heap.push(target, 0);
    }
    while (!heap.empty) {
      const { node, key } = heap.pop();
      if (key > dist[node]) continue;
      for (const edge of this.neighbours[node]) {
        const candidate = key + edge.cost;
        if (candidate < dist[edge.to]) {
          dist[edge.to] = candidate;
          next[edge.to] = node;
          heap.push(edge.to, candidate);
        }
      }
    }
    return { dist, next };
  }

  /**
   * Distance into a dead end for every node: 0 on any road that leads somewhere (the 2-core of
   * the graph plus the protected ends), otherwise the distance back to that core.
   * @param protectedNodes - Nodes that must never be pruned (start and finish).
   * @returns Distance per node.
   */
  pendantDistances(protectedNodes: ReadonlyArray<number>): Float64Array {
    const degree = this.neighbours.map((edges) => edges.length);
    const pruned = new Uint8Array(this.size);
    const keep = new Set(protectedNodes);
    const stack: number[] = [];
    degree.forEach((d, node) => {
      if (d <= 1 && !keep.has(node)) stack.push(node);
    });
    while (stack.length > 0) {
      const node = stack.pop() as number;
      if (pruned[node]) continue;
      pruned[node] = 1;
      for (const edge of this.neighbours[node]) {
        if (pruned[edge.to]) continue;
        degree[edge.to] -= 1;
        if (degree[edge.to] <= 1 && !keep.has(edge.to)) stack.push(edge.to);
      }
    }
    const core = this.samples.map((_, node) => node).filter((node) => !pruned[node]);
    const result = new Float64Array(this.size);
    const heap = new MinHeap();
    result.fill(Infinity);
    for (const node of core) {
      result[node] = 0;
      heap.push(node, 0);
    }
    while (!heap.empty) {
      const { node, key } = heap.pop();
      if (key > result[node]) continue;
      for (const edge of this.neighbours[node]) {
        if (!pruned[edge.to]) continue;
        const candidate = key + edge.cost;
        if (candidate < result[edge.to]) {
          result[edge.to] = candidate;
          heap.push(edge.to, candidate);
        }
      }
    }
    return result;
  }

  /**
   * Node nearest to a world point.
   * @param x - World x.
   * @param z - World z.
   * @returns Node id.
   */
  nearestNode(x: number, z: number): number {
    let best = 0;
    let bestSq = Infinity;
    this.samples.forEach((sample, node) => {
      const distSq = (sample.x - x) ** 2 + (sample.z - z) ** 2;
      if (distSq < bestSq) {
        bestSq = distSq;
        best = node;
      }
    });
    return best;
  }
}
