// lib/game/stage/roadNetwork.ts
import { CORNER_CLASSES, ROAD, ROAD_NETWORK } from "../constants";
import type { Rng } from "../random";
import type { Interval } from "./pitStop";
import { appendArc, appendStraight, type LayoutCursor, type RoadLayout } from "./roadLayout";
import type { CornerClassId, CornerInfo, RoadBranch, RoadSample } from "./types";

/** Horizontal point. */
interface Vec {
  x: number;
  z: number;
}

/** One road under construction. */
interface BuiltRoad {
  samples: RoadSample[];
  corners: CornerInfo[];
  /** Junction site of each polyline vertex (-1 for lead-ins and bend points). */
  nodes: number[];
  /** Site this road leaves from (-1 for the route itself). */
  attach: number;
  /** Reference arc length of the junction this road hangs off. */
  forkS: number;
  rootDistance: number;
}

/** Finished network, still flat (no elevation). */
export interface RoadNetworkResult {
  layout: RoadLayout;
  branches: RoadBranch[];
  /** Stretches of the route the pit must avoid (junctions). */
  zones: Interval[];
  startS: number;
  finishS: number;
  /** Null when no valid checkpoint spacing exists. */
  checkpointS: number[] | null;
  /** Junction sites on the route to the finish. */
  routeSites: number;
}

const DIRS: ReadonlyArray<Vec> = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];
/** Turns smaller than this are treated as straight. */
const STRAIGHT_EPSILON = 1e-4;
/** Corner angles that decide the class of a corner. */
/** Passes that shrink corners competing for one section. */
const SHRINK_PASSES = 6;
const HAIRPIN_MIN_ANGLE = (CORNER_CLASSES[0].angleMin * 140) / 150;

/** @returns Site id. */
const siteId = (col: number, row: number): number => row * ROAD_NETWORK.COLS + col;
/** @returns Unit direction from a to b. */
const unit = (a: Vec, b: Vec): Vec => {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
};

/**
 * Neighbouring sites on the grid.
 * @param site - Site id.
 * @returns Adjacent site ids.
 */
function gridNeighbours(site: number): number[] {
  const col = site % ROAD_NETWORK.COLS;
  const row = Math.floor(site / ROAD_NETWORK.COLS);
  return DIRS.map((d) => ({ c: col + d.x, r: row + d.z }))
    .filter(({ c, r }) => c >= 0 && c < ROAD_NETWORK.COLS && r >= 0 && r < ROAD_NETWORK.ROWS)
    .map(({ c, r }) => siteId(c, r));
}

/**
 * Random spanning tree (growing-tree algorithm): winding roads with plenty of forks.
 * @param rng - Seeded generator.
 * @param root - First site.
 * @returns Tree adjacency lists.
 */
function spanningTree(rng: Rng, root: number): number[][] {
  const adjacency: number[][] = Array.from({ length: ROAD_NETWORK.COLS * ROAD_NETWORK.ROWS }, () => []);
  const visited = new Set<number>([root]);
  const active = [root];
  while (active.length > 0) {
    const pick = rng.chance(ROAD_NETWORK.GROW_NEWEST_CHANCE) ? active.length - 1 : rng.int(0, active.length - 1);
    const site = active[pick];
    const options = gridNeighbours(site).filter((n) => !visited.has(n));
    if (options.length === 0) {
      active.splice(pick, 1);
      continue;
    }
    const next = options[rng.int(0, options.length - 1)];
    visited.add(next);
    adjacency[site].push(next);
    adjacency[next].push(site);
    active.push(next);
  }
  return adjacency;
}

/**
 * Tree path between two sites.
 * @param adjacency - Tree adjacency.
 * @param from - Start site.
 * @param to - End site.
 * @returns Sites from `from` to `to` inclusive.
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
  for (let site = to; site !== -1; site = parent.get(site) ?? -1) path.push(site);
  return path.reverse();
}

/**
 * Height (in sites) of the subtree behind `site` when entered from `from`.
 * @param adjacency - Tree adjacency.
 * @param site - Subtree root.
 * @param from - Site we came from.
 * @returns Longest chain length.
 */
function subtreeDepth(adjacency: number[][], site: number, from: number): number {
  let best = 0;
  for (const next of adjacency[site]) if (next !== from) best = Math.max(best, subtreeDepth(adjacency, next, site));
  return best + 1;
}

/**
 * Corner class from radius and angle.
 * @param radius - Corner radius.
 * @param angle - Turn angle.
 * @returns Class id.
 */
function classFor(radius: number, angle: number): CornerClassId {
  if (angle >= HAIRPIN_MIN_ANGLE) return "hairpin";
  const tight = CORNER_CLASSES[1];
  const medium = CORNER_CLASSES[2];
  if (radius < tight.radiusMax) return "tight";
  return radius < medium.radiusMax ? "medium" : "fast";
}

/**
 * Preferred radius for a turn: sharper turns get tighter corners, gentle ones sweep.
 * @param rng - Seeded generator.
 * @param angle - Turn angle.
 * @returns Radius before it is limited by the neighbouring sections.
 */
function desiredRadius(rng: Rng, angle: number): number {
  const sharpness = Math.min(1, angle / (Math.PI / 2));
  const low = ROAD_NETWORK.RADIUS_MIN + (1 - sharpness) * 90;
  const high = ROAD_NETWORK.RADIUS_MIN + 50 + (1 - sharpness) * (ROAD_NETWORK.RADIUS_MAX - 70);
  return rng.range(low, high);
}

/**
 * Inserts the sideways bends between two junction sites.
 * @param rng - Seeded generator.
 * @param from - Section start.
 * @param to - Section end.
 * @returns Intermediate points (bends).
 */
function bendPoints(rng: Rng, from: Vec, to: Vec): Vec[] {
  const dir = unit(from, to);
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const side = { x: -dir.z, z: dir.x };
  const offset = rng.range(ROAD_NETWORK.BEND_OFFSET_MIN, ROAD_NETWORK.BEND_OFFSET_MAX) * rng.sign();
  const at = (t: number, lateral: number): Vec => ({ x: from.x + dir.x * length * t + side.x * lateral, z: from.z + dir.z * length * t + side.z * lateral });
  if (rng.chance(ROAD_NETWORK.S_BEND_CHANCE)) return [at(0.33, offset), at(0.67, -offset * rng.range(0.6, 1))];
  return [at(0.5, offset)];
}

/**
 * Lays a polyline down as straights joined by arcs of any angle. Corner radii are chosen from the
 * turn angle, then shrunk where two corners compete for the same section.
 * @param rng - Seeded generator.
 * @param points - Polyline vertices.
 * @param nodes - Site of each vertex (-1 for free points).
 * @param attach - Site the road leaves from.
 * @param forkS - Reference junction arc length.
 * @param rootDistance - Side-road distance to the first sample.
 * @returns The built road, or null when a corner would not fit.
 */
function layRoad(rng: Rng, points: Vec[], nodes: number[], attach: number, forkS: number, rootDistance: number): BuiltRoad | null {
  const count = points.length;
  const dirs = points.slice(1).map((point, i) => unit(points[i], point));
  const legs = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.z - points[i].z));
  // Vertex i (1 .. count-2) joins leg i-1 and leg i.
  const angles = new Array<number>(count).fill(0);
  const radii = new Array<number>(count).fill(0);
  for (let i = 1; i < count - 1; i++) {
    const dot = dirs[i - 1].x * dirs[i].x + dirs[i - 1].z * dirs[i].z;
    angles[i] = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (angles[i] > STRAIGHT_EPSILON) radii[i] = desiredRadius(rng, angles[i]);
  }
  const cutOf = (i: number): number => (radii[i] > 0 ? radii[i] * Math.tan(angles[i] / 2) : 0);
  for (let pass = 0; pass < SHRINK_PASSES; pass++) {
    for (let leg = 0; leg < legs.length; leg++) {
      const before = leg >= 1 ? cutOf(leg) : 0;
      const after = leg + 1 < count - 1 ? cutOf(leg + 1) : 0;
      const limit = ROAD_NETWORK.CORNER_SHARE * 2 * legs[leg];
      if (before + after <= limit) continue;
      const scale = limit / (before + after);
      if (leg >= 1) radii[leg] *= scale;
      if (leg + 1 < count - 1) radii[leg + 1] *= scale;
    }
  }
  if (radii.some((radius, i) => angles[i] > STRAIGHT_EPSILON && radius < ROAD_NETWORK.RADIUS_MIN)) return null;

  const heading = Math.atan2(dirs[0].x, dirs[0].z);
  const cursor: LayoutCursor = { x: points[0].x, z: points[0].z, heading, s: 0, samples: [{ x: points[0].x, y: 0, z: points[0].z, s: 0, heading }] };
  const corners: CornerInfo[] = [];
  let consumed = 0;
  for (let i = 1; i < count; i++) {
    const cut = i < count - 1 ? cutOf(i) : 0;
    const straight = legs[i - 1] - consumed - cut;
    if (straight > 1e-6) appendStraight(cursor, straight);
    if (cut > 0) {
      const startS = cursor.s;
      const cross = dirs[i - 1].x * dirs[i].z - dirs[i - 1].z * dirs[i].x;
      const direction: 1 | -1 = cross < 0 ? 1 : -1;
      appendArc(cursor, radii[i], angles[i], direction);
      corners.push({ startS, endS: cursor.s, apexS: (startS + cursor.s) / 2, radius: radii[i], angle: angles[i], direction, classId: classFor(radii[i], angles[i]) });
    }
    consumed = cut;
  }
  return { samples: cursor.samples, corners, nodes, attach, forkS, rootDistance };
}

/**
 * Nearest sample of a road to a point.
 * @param samples - Road samples.
 * @param point - World point.
 * @returns The closest sample.
 */
function nearestSample(samples: ReadonlyArray<RoadSample>, point: Vec): RoadSample {
  let best = samples[0];
  let bestSq = Infinity;
  for (const sample of samples) {
    const distSq = (sample.x - point.x) ** 2 + (sample.z - point.z) ** 2;
    if (distSq < bestSq) {
      bestSq = distSq;
      best = sample;
    }
  }
  return best;
}

/**
 * Snaps the evenly spaced checkpoints to straights away from corners and junctions.
 * @param corners - Route corners.
 * @param junctions - Arc lengths of the junctions on the route.
 * @param spans - Stretches of the route that an alternative road bypasses (no gate may sit there).
 * @param startS - Start line.
 * @param finishS - Finish line.
 * @returns Checkpoint arc lengths, or null if one cannot be placed.
 */
function snapCheckpoints(corners: ReadonlyArray<CornerInfo>, junctions: ReadonlyArray<number>, spans: ReadonlyArray<Interval>, startS: number, finishS: number): number[] | null {
  const blocked = (s: number): boolean =>
    corners.some((c) => s > c.startS - ROAD_NETWORK.GATE_CORNER_CLEAR_M && s < c.endS + ROAD_NETWORK.GATE_CORNER_CLEAR_M) ||
    junctions.some((j) => Math.abs(s - j) < ROAD_NETWORK.GATE_JUNCTION_CLEAR_M) ||
    spans.some((span) => s > span.from - ROAD_NETWORK.GATE_JUNCTION_CLEAR_M && s < span.to + ROAD_NETWORK.GATE_JUNCTION_CLEAR_M);
  const spacing = (finishS - startS) / (ROAD.CHECKPOINT_COUNT + 1);
  const reach = spacing * ROAD_NETWORK.CHECKPOINT_SNAP_SHARE;
  const result: number[] = [];
  for (let k = 0; k < ROAD.CHECKPOINT_COUNT; k++) {
    const nominal = startS + spacing * (k + 1);
    let found: number | null = null;
    for (let offset = 0; offset <= reach && found === null; offset += ROAD_NETWORK.GATE_SNAP_STEP_M) {
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
 * Polyline for a chain of sites: each section between sites gets bends so the road curves.
 * @param rng - Seeded generator.
 * @param sites - Site chain.
 * @param position - World position of every site.
 * @param origin - Optional point the road starts from instead of the first site.
 * @returns Points and the site of each point.
 */
function chainPoints(rng: Rng, sites: number[], position: Vec[], origin?: Vec): { points: Vec[]; nodes: number[] } {
  const points: Vec[] = [];
  const nodes: number[] = [];
  if (origin) {
    points.push(origin);
    nodes.push(-1);
  }
  sites.forEach((site, i) => {
    const previous = i === 0 ? origin : position[sites[i - 1]];
    if (previous) {
      for (const bend of bendPoints(rng, previous, position[site])) {
        points.push(bend);
        nodes.push(-1);
      }
    }
    points.push(position[site]);
    nodes.push(site);
  });
  return { points, nodes };
}

/**
 * Generates the network: jittered junction sites joined by a random tree of flowing roads, one
 * unique route from the west entrance to the east exit, every other road a dead end.
 * @param rng - Seeded generator for this attempt.
 * @returns Network, or null when this attempt cannot host a stage.
 */
export function generateRoadNetwork(rng: Rng): RoadNetworkResult | null {
  const { COLS, ROWS, CELL } = ROAD_NETWORK;
  const jitter = CELL * ROAD_NETWORK.SITE_JITTER;
  const position: Vec[] = Array.from({ length: COLS * ROWS }, (_, site) => ({
    x: (site % COLS) * CELL + rng.range(-jitter, jitter),
    z: Math.floor(site / COLS) * CELL + rng.range(-jitter, jitter),
  }));

  const startRow = rng.int(0, ROWS - 1);
  const startSite = siteId(0, startRow);
  const tree = spanningTree(rng, startSite);
  const exits = Array.from({ length: ROWS }, (_, row) => siteId(COLS - 1, row));
  const exitSite = exits.reduce((best, site) =>
    Math.abs(treePath(tree, startSite, site).length - ROAD_NETWORK.TARGET_SITES) < Math.abs(treePath(tree, startSite, best).length - ROAD_NETWORK.TARGET_SITES) ? site : best,
  );
  const path = treePath(tree, startSite, exitSite);

  const lead = ROAD_NETWORK.LEAD_METRES;
  const startPoint = { x: position[startSite].x - lead, z: position[startSite].z };
  const endPoint = { x: position[exitSite].x + lead, z: position[exitSite].z };
  const chain = chainPoints(rng, path, position, startPoint);
  const route = layRoad(rng, [...chain.points, endPoint], [...chain.nodes, -1], -1, 0, 0);
  if (!route) return null;

  const roads: BuiltRoad[] = [];
  /**
   * Hangs a side road off every unused tree edge at each junction site of `parent`.
   * @param parent - Road whose sites may have side roads.
   * @param isRoute - True for the route to the finish.
   */
  const spawn = (parent: BuiltRoad, isRoute: boolean): void => {
    for (let i = 0; i < parent.nodes.length; i++) {
      const site = parent.nodes[i];
      if (site < 0) continue;
      const neighbours = new Set<number>();
      for (let k = i - 1; k >= 0; k--) if (parent.nodes[k] >= 0) { neighbours.add(parent.nodes[k]); break; }
      for (let k = i + 1; k < parent.nodes.length; k++) if (parent.nodes[k] >= 0) { neighbours.add(parent.nodes[k]); break; }
      neighbours.add(parent.attach);
      for (const child of tree[site]) {
        if (neighbours.has(child)) continue;
        const origin = nearestSample(parent.samples, position[site]);
        const rest = [child];
        for (let at = child, from = site; ; ) {
          const next = tree[at].filter((n) => n !== from).sort((a, b) => subtreeDepth(tree, b, at) - subtreeDepth(tree, a, at))[0];
          if (next === undefined) break;
          rest.push(next);
          from = at;
          at = next;
        }
        const { points, nodes } = chainPoints(rng, rest, position, { x: origin.x, z: origin.z });
        const leaving = unit(points[0], points[1]);
        const forkAngle = Math.acos(Math.min(1, Math.max(-1, leaving.x * Math.sin(origin.heading) + leaving.z * Math.cos(origin.heading))));
        // A side road that would leave at an awkward angle, or not fit, is simply left out.
        if (forkAngle < ROAD_NETWORK.FORK_ANGLE_MIN || forkAngle > ROAD_NETWORK.FORK_ANGLE_MAX) continue;
        const road = layRoad(rng, points, nodes, site, isRoute ? origin.s : parent.forkS, isRoute ? 0 : parent.rootDistance + origin.s);
        if (!road) continue;
        roads.push(road);
        spawn(road, false);
      }
    }
  };
  spawn(route, true);

  const length = route.samples[route.samples.length - 1].s;
  const startS = ROAD.START_LINE_OFFSET;
  const finishS = length - ROAD.FINISH_LINE_OFFSET;
  const treeJunctions = roads.filter((road) => road.rootDistance === 0).map((road) => road.forkS);
  const alternatives = buildAlternatives(rng, route, path, position, [startS, finishS]);
  if (alternatives.length < ROAD_NETWORK.MIN_ALTERNATIVES) return null;
  const spans = alternatives.map((alternative) => ({ from: alternative.forkS, to: alternative.joinS }));
  const checkpointS = snapCheckpoints(route.corners, [...treeJunctions, ...spans.flatMap((span) => [span.from, span.to])], spans, startS, finishS);
  if (!checkpointS) return null;

  const branches: RoadBranch[] = [
    ...roads.map((road, id): RoadBranch => ({
      id,
      kind: "dead_end",
      forkS: road.forkS,
      joinS: null,
      samples: road.samples,
      corners: road.corners,
      length: road.samples[road.samples.length - 1].s,
      rootDistance: road.rootDistance,
    })),
    ...alternatives.map((alternative, k): RoadBranch => ({
      id: roads.length + k,
      kind: "alternative",
      forkS: alternative.forkS,
      joinS: alternative.joinS,
      samples: alternative.road.samples,
      corners: alternative.road.corners,
      length: alternative.road.samples[alternative.road.samples.length - 1].s,
      rootDistance: 0,
    })),
  ];

  const junctions = [...treeJunctions, ...alternatives.flatMap((alternative) => [alternative.forkS, alternative.joinS])];
  const zones: Interval[] = junctions.map((s) => ({ from: s - ROAD_NETWORK.JUNCTION_PIT_CLEAR_M, to: s + ROAD_NETWORK.JUNCTION_PIT_CLEAR_M }));
  return {
    layout: { samples: route.samples, corners: route.corners },
    branches,
    zones,
    startS,
    finishS,
    checkpointS,
    routeSites: path.length,
  };
}

/** A second way between two points of the route. */
interface Alternative {
  road: BuiltRoad;
  forkS: number;
  joinS: number;
}

/**
 * Adds roads that link two sites of the route that are not neighbours on it: shortcuts and
 * detours the navigator can choose between. They never span the start or finish, and the
 * checkpoints are placed outside their spans, so every route still passes every gate.
 * @param rng - Seeded generator.
 * @param route - The route to the finish.
 * @param path - Sites of the route in order.
 * @param position - World position of every site.
 * @param gates - Arc lengths of the gates already fixed (start and finish).
 * @returns The chosen alternatives (up to ALTERNATIVE_COUNT).
 */
function buildAlternatives(rng: Rng, route: BuiltRoad, path: number[], position: Vec[], gates: number[]): Alternative[] {
  const pairs: Array<[number, number]> = [];
  for (let a = 0; a < path.length; a++) {
    for (let b = a + 2; b < path.length; b++) {
      const gap = Math.hypot(position[path[a]].x - position[path[b]].x, position[path[a]].z - position[path[b]].z);
      if (gap < ROAD_NETWORK.ALTERNATIVE_MAX_GAP_M) pairs.push([a, b]);
    }
  }
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  pairs.sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]));
  const clear = ROAD_NETWORK.GATE_JUNCTION_CLEAR_M;
  const chosen: Alternative[] = [];
  for (const [a, b] of pairs) {
    if (chosen.length >= ROAD_NETWORK.ALTERNATIVE_COUNT) break;
    const from = nearestSample(route.samples, position[path[a]]);
    const to = nearestSample(route.samples, position[path[b]]);
    if (gates.some((gate) => gate > from.s - clear && gate < to.s + clear)) continue;
    if (chosen.some((other) => from.s < other.joinS + ROAD_NETWORK.ALTERNATIVE_SPACING_M && to.s > other.forkS - ROAD_NETWORK.ALTERNATIVE_SPACING_M)) continue;
    const points = [{ x: from.x, z: from.z }, ...bendPoints(rng, from, to), { x: to.x, z: to.z }];
    const leaving = unit(points[0], points[1]);
    const arriving = unit(points[points.length - 2], points[points.length - 1]);
    const off = (dir: Vec, heading: number): number => Math.acos(Math.min(1, Math.max(-1, dir.x * Math.sin(heading) + dir.z * Math.cos(heading))));
    const inRange = (angle: number): boolean => angle >= ROAD_NETWORK.FORK_ANGLE_MIN && angle <= ROAD_NETWORK.ALTERNATIVE_ANGLE_MAX;
    if (!inRange(off(leaving, from.heading)) || !inRange(off(arriving, to.heading))) continue;
    const road = layRoad(rng, points, points.map(() => -1), -1, from.s, 0);
    if (road) chosen.push({ road, forkS: from.s, joinS: to.s });
  }
  return chosen;
}
