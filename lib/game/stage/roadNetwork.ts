// lib/game/stage/roadNetwork.ts
import { CORNER_CLASSES, ROAD, ROAD_NETWORK } from "../constants";
import type { Rng } from "../random";
import type { Interval } from "./pitStop";
import { SampleGraph } from "./progress";
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
  /** Junction site of each polyline vertex (-1 for lead-ins, bend points and joins). */
  nodes: number[];
  /** True when the road ends by joining another road. */
  loops: boolean;
}

/** Finished network, still flat (no elevation). */
export interface RoadNetworkResult {
  layout: RoadLayout;
  branches: RoadBranch[];
  /** Stretches of the route the pit must avoid (junctions). */
  zones: Interval[];
  startS: number;
  finishS: number;
  /** Route arc length of each checkpoint gate. */
  checkpointS: number[];
}

const DIRS: ReadonlyArray<Vec> = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];
/** Turns smaller than this are treated as straight. */
const STRAIGHT_EPSILON = 1e-4;
/** Passes that shrink corners competing for one section. */
const SHRINK_PASSES = 6;
const HAIRPIN_MIN_ANGLE = (CORNER_CLASSES[0].angleMin * 140) / 150;
/** Cost used to compare routes before the roads exist (roads are a little longer than straight lines). */
const SECTION_COST_FACTOR = 1.08;
/** Keeps spatial-hash keys unique for any realistic stage size. */
const HASH_STRIDE = 100_000;

/** @returns Site id. */
const siteId = (col: number, row: number): number => row * ROAD_NETWORK.COLS + col;
/** @returns Unit direction from a to b. */
const unit = (a: Vec, b: Vec): Vec => {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
};
/** @returns Order-independent edge key. */
const edgeKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);
/** @returns Column of a site. */
const colOf = (site: number): number => site % ROAD_NETWORK.COLS;
/** @returns Row of a site. */
const rowOf = (site: number): number => Math.floor(site / ROAD_NETWORK.COLS);
/** @returns The two sites of an edge key. */
const sitesOf = (key: string): [number, number] => {
  const [a, b] = key.split("-").map(Number);
  return [a, b];
};

/**
 * Sector of a column: sectors are separated by the cut columns, each cut crossed by one road.
 * @param col - Column.
 * @returns Sector index.
 */
function sectorOf(col: number): number {
  return ROAD_NETWORK.CUT_COLUMNS.filter((cut) => col > cut).length;
}

/**
 * Neighbouring sites on the grid.
 * @param site - Site id.
 * @returns Adjacent site ids.
 */
function gridNeighbours(site: number): number[] {
  return DIRS.map((d) => ({ c: colOf(site) + d.x, r: rowOf(site) + d.z }))
    .filter(({ c, r }) => c >= 0 && c < ROAD_NETWORK.COLS && r >= 0 && r < ROAD_NETWORK.ROWS)
    .map(({ c, r }) => siteId(c, r));
}

/**
 * Builds the road graph: inside each sector a random spanning tree (winding roads, dead ends)
 * plus extra roads that create loops; between sectors exactly one road per cut.
 * @param rng - Seeded generator.
 * @param startRow - Row of the entrance; the cut roads stay within a row or so of each other.
 * @returns Edge keys, adjacency lists and the road crossing each cut.
 */
function buildGraph(rng: Rng, startRow: number): { edges: Set<string>; adjacency: number[][]; cutEdges: Array<[number, number]> } {
  const edges = new Set<string>();
  const cutEdges: Array<[number, number]> = [];
  const sectorCount = ROAD_NETWORK.CUT_COLUMNS.length + 1;
  const everySite = Array.from({ length: ROAD_NETWORK.COLS * ROAD_NETWORK.ROWS }, (_, site) => site);
  for (let sector = 0; sector < sectorCount; sector++) {
    const sites = everySite.filter((site) => sectorOf(colOf(site)) === sector);
    const inSector = new Set(sites);
    const root = sites[rng.int(0, sites.length - 1)];
    const visited = new Set<number>([root]);
    const active = [root];
    while (active.length > 0) {
      const pick = rng.chance(ROAD_NETWORK.GROW_NEWEST_CHANCE) ? active.length - 1 : rng.int(0, active.length - 1);
      const site = active[pick];
      const options = gridNeighbours(site).filter((n) => inSector.has(n) && !visited.has(n));
      if (options.length === 0) {
        active.splice(pick, 1);
        continue;
      }
      const next = options[rng.int(0, options.length - 1)];
      visited.add(next);
      edges.add(edgeKey(site, next));
      active.push(next);
    }
    for (const site of sites) {
      for (const other of gridNeighbours(site)) {
        if (other > site && inSector.has(other) && !edges.has(edgeKey(site, other)) && rng.chance(ROAD_NETWORK.LOOP_CHANCE)) edges.add(edgeKey(site, other));
      }
    }
  }
  let row = startRow;
  for (const cut of ROAD_NETWORK.CUT_COLUMNS) {
    row = Math.min(ROAD_NETWORK.ROWS - 1, Math.max(0, row + rng.int(-1, 1)));
    const from = siteId(cut, row);
    const to = siteId(cut + 1, row);
    edges.add(edgeKey(from, to));
    cutEdges.push([from, to]);
  }
  const adjacency: number[][] = everySite.map(() => []);
  for (const key of edges) {
    const [a, b] = sitesOf(key);
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return { edges, adjacency, cutEdges };
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
 * The sideways bends between two junction sites.
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
 * @param loops - True when the road ends by joining another road.
 * @returns The built road, or null when a corner would not fit.
 */
function layRoad(rng: Rng, points: Vec[], nodes: number[], loops: boolean): BuiltRoad | null {
  const count = points.length;
  const dirs = points.slice(1).map((point, i) => unit(points[i], point));
  const legs = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.z - points[i].z));
  if (legs.some((leg) => leg < 1)) return null;
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
  return { samples: cursor.samples, corners, nodes, loops };
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
 * Whether a road may meet another at this angle between its direction and the other's heading.
 * @param dir - Unit direction of the joining road.
 * @param heading - Heading of the road it meets.
 * @returns True when the angle is inside the allowed range.
 */
function goodAngle(dir: Vec, heading: number): boolean {
  const angle = Math.acos(Math.min(1, Math.max(-1, dir.x * Math.sin(heading) + dir.z * Math.cos(heading))));
  return angle >= ROAD_NETWORK.FORK_ANGLE_MIN && angle <= ROAD_NETWORK.FORK_ANGLE_MAX;
}

/**
 * Places a gate on the single road through a cut, away from corners and junctions.
 * @param corners - Route corners.
 * @param junctions - Arc lengths of junctions on the route.
 * @param from - Route arc length where the cut road starts.
 * @param to - Route arc length where the cut road ends.
 * @returns Gate arc length, or null when the whole road is crowded.
 */
function placeGate(corners: ReadonlyArray<CornerInfo>, junctions: ReadonlyArray<number>, from: number, to: number): number | null {
  const blocked = (s: number): boolean =>
    corners.some((c) => c.radius < ROAD_NETWORK.GATE_BLOCKING_RADIUS_M && s > c.startS - ROAD_NETWORK.GATE_CORNER_CLEAR_M && s < c.endS + ROAD_NETWORK.GATE_CORNER_CLEAR_M) ||
    junctions.some((j) => Math.abs(s - j) < ROAD_NETWORK.GATE_JUNCTION_CLEAR_M);
  const middle = (from + to) / 2;
  const reach = (to - from) / 2;
  for (let offset = 0; offset <= reach; offset += ROAD_NETWORK.GATE_SNAP_STEP_M) {
    for (const candidate of [middle + offset, middle - offset]) if (!blocked(candidate)) return candidate;
  }
  return null;
}

/**
 * Whether every pair of roads keeps its distance away from junctions.
 * @param roads - Centrelines of every road.
 * @param junctions - Points where roads meet.
 * @returns True when no two roads touch except at junctions.
 */
function roadsSeparated(roads: ReadonlyArray<ReadonlyArray<RoadSample>>, junctions: ReadonlyArray<Vec>): boolean {
  const cell = ROAD_NETWORK.MIN_ROAD_SEPARATION_M;
  const key = (cx: number, cz: number): number => cx * HASH_STRIDE + cz;
  const hash = new Map<number, Array<{ road: number; sample: RoadSample }>>();
  const exemptSq = ROAD_NETWORK.SEPARATION_EXEMPT_M ** 2;
  const checked = roads.map((samples) => samples.map((sample) => !junctions.some((j) => (j.x - sample.x) ** 2 + (j.z - sample.z) ** 2 < exemptSq)));
  roads.forEach((samples, road) => {
    samples.forEach((sample, i) => {
      if (!checked[road][i]) return;
      const k = key(Math.floor(sample.x / cell), Math.floor(sample.z / cell));
      const bucket = hash.get(k);
      if (bucket) bucket.push({ road, sample });
      else hash.set(k, [{ road, sample }]);
    });
  });
  const minSq = ROAD_NETWORK.MIN_ROAD_SEPARATION_M ** 2;
  for (const [road, samples] of roads.entries()) {
    for (const [i, sample] of samples.entries()) {
      if (!checked[road][i]) continue;
      const cx = Math.floor(sample.x / cell);
      const cz = Math.floor(sample.z / cell);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          for (const other of hash.get(key(ix, iz)) ?? []) {
            if (other.road !== road && (other.sample.x - sample.x) ** 2 + (other.sample.z - sample.z) ** 2 < minSq) return false;
          }
        }
      }
    }
  }
  return true;
}

/**
 * Shortest path between two sites by estimated road length.
 * @param adjacency - Graph adjacency.
 * @param from - Start site.
 * @param to - End site.
 * @param cost - Length of the road section between two neighbouring sites.
 * @returns Sites in order, or null when unreachable.
 */
function shortestSitePath(adjacency: number[][], from: number, to: number, cost: (a: number, b: number) => number): number[] | null {
  const dist = new Map<number, number>([[from, 0]]);
  const previous = new Map<number, number>();
  const open = new Set<number>([from]);
  while (open.size > 0) {
    let current = -1;
    for (const site of open) if (current < 0 || (dist.get(site) as number) < (dist.get(current) as number)) current = site;
    open.delete(current);
    if (current === to) break;
    for (const next of adjacency[current]) {
      const candidate = (dist.get(current) as number) + cost(current, next);
      if (candidate < (dist.get(next) ?? Infinity)) {
        dist.set(next, candidate);
        previous.set(next, current);
        open.add(next);
      }
    }
  }
  if (!dist.has(to)) return null;
  const result = [to];
  while (result[0] !== from) result.unshift(previous.get(result[0]) as number);
  return result;
}

/**
 * Generates the network: jittered junction sites joined by flowing roads in sectors. Inside a
 * sector there are loops and dead ends; between sectors a single road passes each checkpoint.
 * The route is the shortest way from the west entrance to the east exit; every other road
 * gets a progress value (distance saved) and a dead-end depth so races stay fair on any road.
 * @param rng - Seeded generator for this attempt.
 * @returns Network, or null when this attempt cannot host a stage.
 */
export function generateRoadNetwork(rng: Rng): RoadNetworkResult | null {
  const { COLS, ROWS, CELL } = ROAD_NETWORK;
  const jitter = CELL * ROAD_NETWORK.SITE_JITTER;
  const position: Vec[] = Array.from({ length: COLS * ROWS }, (_, site) => ({
    x: colOf(site) * CELL + rng.range(-jitter, jitter),
    z: rowOf(site) * CELL + rng.range(-jitter, jitter),
  }));
  const startRow = rng.int(0, ROWS - 1);
  const { edges, adjacency, cutEdges } = buildGraph(rng, startRow);

  // Bends are drawn once per road section so the route estimate and the real roads agree.
  const bends = new Map<string, Vec[]>();
  for (const key of edges) {
    const [a, b] = sitesOf(key);
    bends.set(key, bendPoints(rng, position[a], position[b]));
  }
  /**
   * @param from - Site the section starts at.
   * @param to - Site the section ends at.
   * @returns Bend points in travel order.
   */
  const sectionBends = (from: number, to: number): Vec[] => {
    const stored = bends.get(edgeKey(from, to)) ?? [];
    return from < to ? stored : [...stored].reverse();
  };
  const sectionLength = (from: number, to: number): number => {
    const pts = [position[from], ...sectionBends(from, to), position[to]];
    return pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - pts[i].x, p.z - pts[i].z), 0) * SECTION_COST_FACTOR;
  };

  const lastCutRow = rowOf(cutEdges[cutEdges.length - 1][1]);
  const startSite = siteId(0, startRow);
  const exitSite = siteId(COLS - 1, Math.min(ROWS - 1, Math.max(0, lastCutRow + rng.int(-1, 1))));
  const path = shortestSitePath(adjacency, startSite, exitSite, sectionLength);
  if (!path) return null;

  const lead = ROAD_NETWORK.LEAD_METRES;
  const routePoints: Vec[] = [{ x: position[startSite].x - lead, z: position[startSite].z }];
  const routeNodes = [-1];
  path.forEach((site, i) => {
    if (i > 0) {
      for (const bend of sectionBends(path[i - 1], site)) {
        routePoints.push(bend);
        routeNodes.push(-1);
      }
    }
    routePoints.push(position[site]);
    routeNodes.push(site);
  });
  routePoints.push({ x: position[exitSite].x + lead, z: position[exitSite].z });
  routeNodes.push(-1);
  const route = layRoad(rng, routePoints, routeNodes, false);
  if (!route) return null;
  const length = route.samples[route.samples.length - 1].s;
  if (length < ROAD_NETWORK.MIN_SOLUTION_M || length > ROAD_NETWORK.MAX_SOLUTION_M) return null;

  // Every other road: trails that continue straight through sites, started from a road already built.
  const roads: BuiltRoad[] = [route];
  const siteRoads = new Map<number, number>();
  route.nodes.forEach((site) => {
    if (site >= 0) siteRoads.set(site, 0);
  });
  const used = new Set<string>(path.slice(1).map((site, i) => edgeKey(path[i], site)));
  const pending = [...edges].filter((key) => !used.has(key)).sort();
  for (let guard = 0; guard < edges.size * 2; guard++) {
    const startEdge = pending.find((key) => !used.has(key) && sitesOf(key).some((site) => siteRoads.has(site)));
    if (!startEdge) break;
    const [ea, eb] = sitesOf(startEdge);
    const first = siteRoads.has(ea) ? ea : eb;
    let next = first === ea ? eb : ea;
    const origin = nearestSample(roads[siteRoads.get(first) as number].samples, position[first]);
    const points: Vec[] = [{ x: origin.x, z: origin.z }];
    const nodes = [-1];
    const visited = new Set<number>([first]);
    let current = first;
    let joined: RoadSample | null = null;
    for (;;) {
      used.add(edgeKey(current, next));
      for (const bend of sectionBends(current, next)) {
        points.push(bend);
        nodes.push(-1);
      }
      if (siteRoads.has(next)) {
        joined = nearestSample(roads[siteRoads.get(next) as number].samples, position[next]);
        points.push({ x: joined.x, z: joined.z });
        nodes.push(-1);
        break;
      }
      points.push(position[next]);
      nodes.push(next);
      visited.add(next);
      const arrival = unit(points[points.length - 2], points[points.length - 1]);
      const options = adjacency[next].filter((n) => !used.has(edgeKey(next, n)) && !visited.has(n));
      if (options.length === 0) break;
      const turnOf = (site: number): number => {
        const d = unit(position[next], position[site]);
        return Math.acos(Math.min(1, Math.max(-1, d.x * arrival.x + d.z * arrival.z)));
      };
      current = next;
      next = options.reduce((best, n) => (turnOf(n) < turnOf(best) ? n : best));
    }
    // A road that would leave or join at an awkward angle is left out.
    if (!goodAngle(unit(points[0], points[1]), origin.heading)) continue;
    if (joined && !goodAngle(unit(points[points.length - 2], points[points.length - 1]), joined.heading)) continue;
    const road = layRoad(rng, points, nodes, joined !== null);
    if (!road) continue;
    roads.push(road);
    road.nodes.forEach((site) => {
      if (site >= 0 && !siteRoads.has(site)) siteRoads.set(site, roads.length - 1);
    });
  }

  // Progress: distance saved on the way to the finish, from the geometry itself.
  const graph = new SampleGraph(roads.map((road) => road.samples));
  const finishNode = graph.nodeOf(0, route.samples.length - 1);
  const startNode = graph.nodeOf(0, 0);
  const field = graph.distancesTo([finishNode]);
  const total = field.dist[startNode];
  const progressOf = (road: number, i: number): number => total - field.dist[graph.nodeOf(road, i)];
  for (let i = 0; i < route.samples.length; i++) {
    if (Math.abs(progressOf(0, i) - route.samples[i].s) > ROAD_NETWORK.ROUTE_PROGRESS_TOLERANCE_M) return null;
  }
  const pendant = graph.pendantDistances([startNode, finishNode]);
  const branches: RoadBranch[] = roads.slice(1).map((road, k) => ({
    id: k,
    samples: road.samples,
    corners: road.corners,
    length: road.samples[road.samples.length - 1].s,
    progress: road.samples.map((_, i) => progressOf(k + 1, i)),
    pendant: road.samples.map((_, i) => pendant[graph.nodeOf(k + 1, i)]),
    loops: road.loops,
  }));
  if (branches.some((branch) => branch.progress.some((p) => !Number.isFinite(p)))) return null;
  const deadEnds = branches.filter((branch) => branch.pendant.some((p) => p > 0)).length;
  const routeLoops = branches.filter((branch) => branch.loops && branch.pendant.every((p) => p === 0)).length;
  if (deadEnds < ROAD_NETWORK.MIN_DEAD_ENDS || routeLoops < ROAD_NETWORK.MIN_ROUTE_LOOPS) return null;

  const junctionNodes = graph.junctionNodes();
  const junctionPoints = junctionNodes.map((node) => ({ x: graph.samples[node].x, z: graph.samples[node].z }));
  if (!roadsSeparated(roads.map((road) => road.samples), junctionPoints)) return null;
  const routeJunctions = junctionNodes.filter((node) => graph.roadOf[node] === 0).map((node) => graph.samples[node].s);

  const startS = ROAD.START_LINE_OFFSET;
  const finishS = length - ROAD.FINISH_LINE_OFFSET;
  const checkpointS: number[] = [];
  for (const [from, to] of cutEdges) {
    const a = nearestSample(route.samples, position[from]).s;
    const b = nearestSample(route.samples, position[to]).s;
    const gate = placeGate(route.corners, routeJunctions, Math.min(a, b), Math.max(a, b));
    if (gate === null) return null;
    checkpointS.push(gate);
  }
  checkpointS.sort((x, y) => x - y);

  const zones: Interval[] = routeJunctions.map((s) => ({ from: s - ROAD_NETWORK.JUNCTION_PIT_CLEAR_M, to: s + ROAD_NETWORK.JUNCTION_PIT_CLEAR_M }));
  return { layout: { samples: route.samples, corners: route.corners }, branches, zones, startS, finishS, checkpointS };
}
