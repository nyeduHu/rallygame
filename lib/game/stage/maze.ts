// lib/game/stage/maze.ts
import { MAZE, ROAD } from "../constants";
import type { Rng } from "../random";
import type { Interval } from "./pitStop";
import { appendArc, appendStraight, type LayoutCursor, type RoadLayout } from "./roadLayout";
import type { CornerClassId, CornerInfo, RoadBranch, RoadSample, WallBox } from "./types";

/** Horizontal point or direction. */
interface Vec {
  x: number;
  z: number;
}

/** One road under construction: samples plus what is needed to hang more roads off it. */
interface BuiltRoad {
  samples: RoadSample[];
  corners: CornerInfo[];
  /** Grid node of each polyline vertex (-1 for free points such as the lead-in). */
  nodes: number[];
  /** Fillet radius and directions at each polyline vertex (radius 0 when the road goes straight). */
  turns: Array<{ radius: number; dirIn: Vec; dirOut: Vec }>;
  /** Node this road leaves from (-1 for the route itself). */
  attach: number;
  /** Reference arc length of the junction this road hangs off. */
  forkS: number;
  rootDistance: number;
}

/** Finished maze, still flat (no elevation). */
export interface MazeResult {
  layout: RoadLayout;
  branches: RoadBranch[];
  /** Stretches of the route the pit must avoid (doors and junctions). */
  zones: Interval[];
  walls: WallBox[];
  startS: number;
  finishS: number;
  /** Null when no valid checkpoint spacing exists. */
  checkpointS: number[] | null;
  /** Rooms on the correct route. */
  routeCells: number;
}

const DIRS: ReadonlyArray<Vec> = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

/** @returns Grid node id. */
const nodeId = (col: number, row: number): number => row * MAZE.COLS + col;
/** @returns World centre of a node. */
const centreOf = (node: number): Vec => ({ x: (node % MAZE.COLS) * MAZE.CELL, z: Math.floor(node / MAZE.COLS) * MAZE.CELL });
/** @returns Order-independent edge key. */
const edgeKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);
/** @returns Unit direction from a to b. */
const unit = (a: Vec, b: Vec): Vec => {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
};
/** @returns True when two unit vectors point the same way. */
const sameDir = (a: Vec, b: Vec): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;

/**
 * Neighbouring nodes of a node inside the grid.
 * @param node - Grid node.
 * @returns Adjacent node ids.
 */
function gridNeighbours(node: number): number[] {
  const col = node % MAZE.COLS;
  const row = Math.floor(node / MAZE.COLS);
  return DIRS.map((d) => ({ c: col + d.x, r: row + d.z }))
    .filter(({ c, r }) => c >= 0 && c < MAZE.COLS && r >= 0 && r < MAZE.ROWS)
    .map(({ c, r }) => nodeId(c, r));
}

/**
 * Random spanning tree by the growing-tree algorithm (winding corridors with plenty of forks).
 * @param rng - Seeded generator.
 * @param root - First node.
 * @returns Tree adjacency lists.
 */
function spanningTree(rng: Rng, root: number): number[][] {
  const adjacency: number[][] = Array.from({ length: MAZE.COLS * MAZE.ROWS }, () => []);
  const visited = new Set<number>([root]);
  const active = [root];
  while (active.length > 0) {
    const pick = rng.chance(MAZE.GROW_NEWEST_CHANCE) ? active.length - 1 : rng.int(0, active.length - 1);
    const node = active[pick];
    const options = gridNeighbours(node).filter((n) => !visited.has(n));
    if (options.length === 0) {
      active.splice(pick, 1);
      continue;
    }
    const next = options[rng.int(0, options.length - 1)];
    visited.add(next);
    adjacency[node].push(next);
    adjacency[next].push(node);
    active.push(next);
  }
  return adjacency;
}

/**
 * Tree path between two nodes.
 * @param adjacency - Tree adjacency.
 * @param from - Start node.
 * @param to - End node.
 * @returns Nodes from `from` to `to` inclusive.
 */
function treePath(adjacency: number[][], from: number, to: number): number[] {
  const parent = new Map<number, number>([[from, -1]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    for (const next of adjacency[queue[head]]) {
      if (parent.has(next)) continue;
      parent.set(next, queue[head]);
      queue.push(next);
    }
  }
  const path: number[] = [];
  for (let node = to; node !== -1; node = parent.get(node) ?? -1) path.push(node);
  return path.reverse();
}

/**
 * Height (in rooms) of the subtree behind `node` when entered from `from`.
 * @param adjacency - Tree adjacency.
 * @param node - Subtree root.
 * @param from - Node we came from.
 * @returns Longest chain length below and including `node`.
 */
function subtreeDepth(adjacency: number[][], node: number, from: number): number {
  let best = 0;
  for (const next of adjacency[node]) if (next !== from) best = Math.max(best, subtreeDepth(adjacency, next, node));
  return best + 1;
}

/**
 * Corner class for a fillet radius (all maze turns are 90 degrees).
 * @param radius - Fillet radius.
 * @returns Class id.
 */
function classFor(radius: number): CornerClassId {
  return radius < 40 ? "tight" : "medium";
}

/**
 * Lays a polyline down as straights joined by 90 degree arcs.
 * @param rng - Seeded generator.
 * @param points - Polyline vertices.
 * @param nodes - Grid node of each vertex.
 * @param attach - Node the road leaves from.
 * @param forkS - Reference junction arc length.
 * @param rootDistance - Side-road distance to the first sample.
 * @returns The built road.
 */
function layRoad(rng: Rng, points: Vec[], nodes: number[], attach: number, forkS: number, rootDistance: number): BuiltRoad {
  const first = unit(points[0], points[1]);
  const heading = Math.atan2(first.x, first.z);
  const cursor: LayoutCursor = { x: points[0].x, z: points[0].z, heading, s: 0, samples: [{ x: points[0].x, y: 0, z: points[0].z, s: 0, heading }] };
  const corners: CornerInfo[] = [];
  const turns: BuiltRoad["turns"] = [{ radius: 0, dirIn: first, dirOut: first }];
  let consumed = 0;
  for (let i = 1; i < points.length; i++) {
    const dirIn = unit(points[i - 1], points[i]);
    const dirOut = i + 1 < points.length ? unit(points[i], points[i + 1]) : dirIn;
    const cross = dirIn.x * dirOut.z - dirIn.z * dirOut.x;
    const turning = Math.abs(cross) > 0.5;
    const radius = turning ? rng.range(MAZE.FILLET_MIN, MAZE.FILLET_MAX) : 0;
    const leg = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    const straight = leg - consumed - radius;
    if (straight > 1e-6) appendStraight(cursor, straight);
    if (turning) {
      const startS = cursor.s;
      const direction: 1 | -1 = cross < 0 ? 1 : -1;
      appendArc(cursor, radius, Math.PI / 2, direction);
      corners.push({ startS, endS: cursor.s, apexS: (startS + cursor.s) / 2, radius, angle: Math.PI / 2, direction, classId: classFor(radius) });
    }
    turns.push({ radius, dirIn, dirOut });
    consumed = radius;
  }
  return { samples: cursor.samples, corners, nodes, turns, attach, forkS, rootDistance };
}

/**
 * Nearest sample of a road to a point.
 * @param samples - Road samples.
 * @param point - World point.
 * @returns Arc length of the closest sample.
 */
function nearestS(samples: ReadonlyArray<RoadSample>, point: Vec): number {
  let best = samples[0];
  let bestSq = Infinity;
  for (const sample of samples) {
    const distSq = (sample.x - point.x) ** 2 + (sample.z - point.z) ** 2;
    if (distSq < bestSq) {
      bestSq = distSq;
      best = sample;
    }
  }
  return best.s;
}

/**
 * Builds the wall boxes: every room edge is a wall except doors on tree edges and the two
 * entrances of the route.
 * @param open - Tree edges.
 * @param startRow - Row of the entrance (west wall).
 * @param endRow - Row of the exit (east wall).
 * @returns Wall boxes at zero elevation.
 */
function buildWalls(open: Set<string>, startRow: number, endRow: number): WallBox[] {
  const walls: WallBox[] = [];
  const half = MAZE.CELL / 2;
  const thick = MAZE.WALL_THICKNESS / 2;
  const door = MAZE.DOOR_WIDTH / 2;
  /**
   * @param fixed - Constant coordinate of the wall line.
   * @param from - Start of the edge along the line.
   * @param hasDoor - Whether a door interrupts the edge.
   * @param vertical - True when the line runs along z.
   */
  const addEdge = (fixed: number, from: number, hasDoor: boolean, vertical: boolean): void => {
    const pieces: Array<[number, number]> = hasDoor
      ? [
          [from - thick, from + half - door],
          [from + half + door, from + MAZE.CELL + thick],
        ]
      : [[from - thick, from + MAZE.CELL + thick]];
    for (const [a, b] of pieces) {
      const centre = (a + b) / 2;
      const halfLength = (b - a) / 2;
      walls.push(
        vertical
          ? { x: fixed, z: centre, halfX: thick, halfZ: halfLength, y: 0, height: MAZE.WALL_HEIGHT }
          : { x: centre, z: fixed, halfX: halfLength, halfZ: thick, y: 0, height: MAZE.WALL_HEIGHT },
      );
    }
  };
  for (let row = 0; row < MAZE.ROWS; row++) {
    for (let col = 0; col <= MAZE.COLS; col++) {
      const interior = col > 0 && col < MAZE.COLS;
      const hasDoor = interior ? open.has(edgeKey(nodeId(col - 1, row), nodeId(col, row))) : col === 0 ? row === startRow : row === endRow;
      addEdge(col * MAZE.CELL - half, row * MAZE.CELL - half, hasDoor, true);
    }
  }
  for (let col = 0; col < MAZE.COLS; col++) {
    for (let row = 0; row <= MAZE.ROWS; row++) {
      const interior = row > 0 && row < MAZE.ROWS;
      const hasDoor = interior && open.has(edgeKey(nodeId(col, row - 1), nodeId(col, row)));
      addEdge(row * MAZE.CELL - half, col * MAZE.CELL - half, hasDoor, false);
    }
  }
  return walls;
}

/**
 * Snaps the evenly spaced checkpoints to straights away from corners, doors and junctions.
 * @param corners - Route corners.
 * @param junctions - Arc lengths of the junctions on the route.
 * @param startS - Start line.
 * @param finishS - Finish line.
 * @returns Checkpoint arc lengths, or null if one cannot be placed.
 */
function snapCheckpoints(corners: ReadonlyArray<CornerInfo>, junctions: ReadonlyArray<number>, startS: number, finishS: number): number[] | null {
  const blocked = (s: number): boolean =>
    corners.some((c) => s > c.startS - MAZE.GATE_CORNER_CLEAR_M && s < c.endS + MAZE.GATE_CORNER_CLEAR_M) ||
    junctions.some((j) => Math.abs(s - j) < MAZE.GATE_JUNCTION_CLEAR_M);
  const spacing = (finishS - startS) / (ROAD.CHECKPOINT_COUNT + 1);
  const reach = spacing / 3;
  const result: number[] = [];
  for (let k = 0; k < ROAD.CHECKPOINT_COUNT; k++) {
    const nominal = startS + spacing * (k + 1);
    let found: number | null = null;
    for (let offset = 0; offset <= reach && found === null; offset += MAZE.GATE_SNAP_STEP_M) {
      for (const candidate of [nominal + offset, nominal - offset]) {
        if (!blocked(candidate)) {
          found = candidate;
          break;
        }
      }
    }
    if (found === null) return null;
    result.push(found);
  }
  return result;
}

/**
 * Generates a maze: a walled grid of rooms, one unique route from the west entrance to the east
 * exit, and every other corridor a dead end.
 * @param rng - Seeded generator for this attempt.
 * @returns Maze, or null when this attempt cannot host a stage.
 */
export function generateMaze(rng: Rng): MazeResult | null {
  const startRow = rng.int(0, MAZE.ROWS - 1);
  const startNode = nodeId(0, startRow);
  const tree = spanningTree(rng, startNode);
  const exits = Array.from({ length: MAZE.ROWS }, (_, row) => nodeId(MAZE.COLS - 1, row));
  const exitNode = exits.reduce((best, node) =>
    Math.abs(treePath(tree, startNode, node).length - MAZE.TARGET_CELLS) < Math.abs(treePath(tree, startNode, best).length - MAZE.TARGET_CELLS) ? node : best,
  );
  const path = treePath(tree, startNode, exitNode);
  const endRow = Math.floor(exitNode / MAZE.COLS);

  const lead = MAZE.CELL / 2 + MAZE.LEAD_METRES;
  const startCentre = centreOf(startNode);
  const endCentre = centreOf(exitNode);
  const points: Vec[] = [{ x: startCentre.x - lead, z: startCentre.z }, ...path.map(centreOf), { x: endCentre.x + lead, z: endCentre.z }];
  const route = layRoad(rng, points, [-1, ...path, -1], -1, 0, 0);

  const roads: BuiltRoad[] = [];
  /**
   * Hangs a side road off every unused tree edge at each vertex of `parent`.
   * @param parent - Road whose nodes may have side roads.
   * @param isRoute - True for the correct route.
   */
  const spawn = (parent: BuiltRoad, isRoute: boolean): void => {
    for (let i = 0; i < parent.nodes.length; i++) {
      const node = parent.nodes[i];
      if (node < 0) continue;
      const used = new Set([i === 1 ? parent.attach : parent.nodes[i - 1], parent.nodes[i + 1] ?? -1]);
      for (const child of tree[node]) {
        if (used.has(child)) continue;
        const dir = unit(centreOf(node), centreOf(child));
        const turn = parent.turns[i];
        const shifted = turn.radius > 0 && (sameDir(dir, turn.dirIn) || sameDir(dir, { x: -turn.dirOut.x, z: -turn.dirOut.z }));
        const origin: Vec = shifted
          ? { x: centreOf(node).x - dir.x * turn.radius, z: centreOf(node).z - dir.z * turn.radius }
          : centreOf(node);
        const chain = [child];
        for (let at = child, from = node; ; ) {
          const next = tree[at].filter((n) => n !== from).sort((a, b) => subtreeDepth(tree, b, at) - subtreeDepth(tree, a, at))[0];
          if (next === undefined) break;
          chain.push(next);
          from = at;
          at = next;
        }
        const localS = nearestS(parent.samples, origin);
        const road = layRoad(rng, [origin, ...chain.map(centreOf)], [-1, ...chain], node, isRoute ? localS : parent.forkS, isRoute ? 0 : parent.rootDistance + localS);
        roads.push(road);
        spawn(road, false);
      }
    }
  };
  spawn(route, true);

  const branches: RoadBranch[] = roads.map((road, id) => ({
    id,
    kind: "dead_end",
    forkS: road.forkS,
    joinS: null,
    samples: road.samples,
    corners: road.corners,
    length: road.samples[road.samples.length - 1].s,
    rootDistance: road.rootDistance,
  }));

  const open = new Set<string>();
  tree.forEach((neighbours, node) => neighbours.forEach((n) => open.add(edgeKey(node, n))));

  const zones: Interval[] = [];
  const junctionClear = MAZE.JUNCTION_PIT_CLEAR_M;
  for (const road of roads) if (road.rootDistance === 0) zones.push({ from: road.forkS - junctionClear, to: road.forkS + junctionClear });
  for (let i = 1; i < path.length; i++) {
    const a = centreOf(path[i - 1]);
    const b = centreOf(path[i]);
    const s = nearestS(route.samples, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    zones.push({ from: s - MAZE.DOOR_PIT_CLEAR_M, to: s + MAZE.DOOR_PIT_CLEAR_M });
  }

  const length = route.samples[route.samples.length - 1].s;
  const startS = ROAD.START_LINE_OFFSET;
  const finishS = length - ROAD.FINISH_LINE_OFFSET;
  return {
    layout: { samples: route.samples, corners: route.corners },
    branches,
    zones,
    walls: buildWalls(open, startRow, endRow),
    startS,
    finishS,
    checkpointS: snapCheckpoints(route.corners, roads.filter((road) => road.rootDistance === 0).map((road) => road.forkS), startS, finishS),
    routeCells: path.length,
  };
}
