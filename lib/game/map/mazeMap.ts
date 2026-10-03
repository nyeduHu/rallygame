// lib/game/map/mazeMap.ts
import { MAZE_MAP } from "../constants";
import { SampleGraph } from "../stage/progress";
import type { CornerInfo, StageData } from "../stage/types";

/** CAR keeps the car in the middle of the screen; FULL fits the whole maze. */
export type MapMode = "CAR" | "FULL";

/** Where the tablet is looking. Pan is a world offset from the mode's natural centre. */
export interface MapView {
  mode: MapMode;
  zoom: number;
  panX: number;
  panZ: number;
}

/** Keys held on the tablet this frame. */
export interface MapKeys {
  zoomIn: boolean;
  zoomOut: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/** Axis-aligned bounds of every road. */
export interface MapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Pixel rectangle the map is drawn into. */
export interface MapViewport {
  width: number;
  height: number;
}

/** A hint: the shortest way home from the car, up to the fifth corner, shown for a while. */
export interface MapHint {
  /** Points of the highlighted path. */
  points: Array<{ x: number; z: number }>;
  /** The corners the path passes, in order. */
  corners: CornerInfo[];
  expiresAt: number;
}

/** @returns A fresh view centred on the car. */
export function createView(): MapView {
  return { mode: "CAR", zoom: 1, panX: 0, panZ: 0 };
}

/**
 * Switches between the centred and whole-maze views, clearing zoom and pan.
 * @param view - Current view.
 * @returns The other view.
 */
export function toggleMode(view: MapView): MapView {
  return { mode: view.mode === "CAR" ? "FULL" : "CAR", zoom: 1, panX: 0, panZ: 0 };
}

/**
 * Bounds of the whole road network.
 * @param stage - Stage with its side roads.
 * @returns Bounds.
 */
export function networkBounds(stage: Pick<StageData, "samples" | "branches">): MapBounds {
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const road of [stage.samples, ...stage.branches.map((branch) => branch.samples)]) {
    for (const sample of road) {
      bounds.minX = Math.min(bounds.minX, sample.x);
      bounds.maxX = Math.max(bounds.maxX, sample.x);
      bounds.minZ = Math.min(bounds.minZ, sample.z);
      bounds.maxZ = Math.max(bounds.maxZ, sample.z);
    }
  }
  return bounds;
}

/**
 * Base pixels per metre of a mode before the zoom multiplier.
 * @param mode - View mode.
 * @param bounds - Network bounds.
 * @param viewport - Map pixels.
 * @returns Pixels per metre.
 */
export function baseScale(mode: MapMode, bounds: MapBounds, viewport: MapViewport): number {
  if (mode === "CAR") return viewport.height / MAZE_MAP.CAR_VIEW_METRES;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  return Math.min((viewport.width - 2 * MAZE_MAP.FIT_MARGIN) / width, (viewport.height - 2 * MAZE_MAP.FIT_MARGIN) / depth);
}

/**
 * Applies the held keys for one frame.
 * @param view - Current view.
 * @param keys - Held keys.
 * @param deltaSeconds - Frame time.
 * @param scale - Current pixels per metre (pan speed is constant on screen).
 * @returns Updated view.
 */
export function stepView(view: MapView, keys: MapKeys, deltaSeconds: number, scale: number): MapView {
  const zoomDirection = (keys.zoomIn ? 1 : 0) - (keys.zoomOut ? 1 : 0);
  const zoom = Math.min(MAZE_MAP.ZOOM_MAX, Math.max(MAZE_MAP.ZOOM_MIN, view.zoom * Math.exp(zoomDirection * MAZE_MAP.ZOOM_RATE * deltaSeconds)));
  const metres = (MAZE_MAP.PAN_PIXELS_PER_SECOND * deltaSeconds) / scale;
  // Screen right is world -x (the map is not mirrored), screen up is world +z.
  const panX = view.panX + ((keys.left ? 1 : 0) - (keys.right ? 1 : 0)) * metres;
  const panZ = view.panZ + ((keys.up ? 1 : 0) - (keys.down ? 1 : 0)) * metres;
  return zoom === view.zoom && panX === view.panX && panZ === view.panZ ? view : { ...view, zoom, panX, panZ };
}

/**
 * World-to-pixel projection for the current view; north is up.
 * @param view - Current view.
 * @param car - Car world position.
 * @param bounds - Network bounds.
 * @param viewport - Map pixels.
 * @returns Projection and the pixels-per-metre in use.
 */
export function makeProjection(
  view: MapView,
  car: { x: number; z: number },
  bounds: MapBounds,
  viewport: MapViewport,
): { project: (x: number, z: number) => { x: number; y: number }; scale: number } {
  const scale = baseScale(view.mode, bounds, viewport) * view.zoom;
  const centreX = (view.mode === "CAR" ? car.x : (bounds.minX + bounds.maxX) / 2) + view.panX;
  const centreZ = (view.mode === "CAR" ? car.z : (bounds.minZ + bounds.maxZ) / 2) + view.panZ;
  return {
    scale,
    project: (x, z) => ({ x: viewport.width / 2 - (x - centreX) * scale, y: viewport.height / 2 - (z - centreZ) * scale }),
  };
}

/** Everything needed to answer "which way is home from here". */
export interface HintContext {
  graph: SampleGraph;
  /** Next hop toward the finish for every node. */
  next: Int32Array;
  /** Corner whose apex sits at a node. */
  cornerAt: Map<number, CornerInfo>;
}

/**
 * Prepares hints for a stage: the sample graph, the way to the finish from everywhere, and where
 * every corner is.
 * @param stage - Stage with its route and other roads.
 * @returns Hint context.
 */
export function createHintContext(stage: Pick<StageData, "samples" | "corners" | "branches">): HintContext {
  const roads = [{ samples: stage.samples, corners: stage.corners }, ...stage.branches];
  const graph = new SampleGraph(roads.map((road) => road.samples));
  const finish = graph.nodeOf(0, stage.samples.length - 1);
  const { next } = graph.distancesTo([finish]);
  const cornerAt = new Map<number, CornerInfo>();
  roads.forEach((road, roadIndex) => {
    for (const corner of road.corners) {
      const index = road.samples.findIndex((sample) => sample.s >= corner.apexS);
      if (index >= 0) cornerAt.set(graph.nodeOf(roadIndex, index), corner);
    }
  });
  return { graph, next, cornerAt };
}

/**
 * Builds a hint: the shortest way to the finish from where the car is, through the next turns.
 * @param context - Hint context of the stage.
 * @param x - Car world x.
 * @param z - Car world z.
 * @param now - Clock in seconds.
 * @returns Hint, or null when the car is already at the finish.
 */
export function makeHint(context: HintContext, x: number, z: number, now: number): MapHint | null {
  const points: Array<{ x: number; z: number }> = [];
  const corners: CornerInfo[] = [];
  let node = context.graph.nearestNode(x, z);
  while (node >= 0 && corners.length < MAZE_MAP.HINT_TURNS) {
    const sample = context.graph.samples[node];
    points.push({ x: sample.x, z: sample.z });
    const corner = context.cornerAt.get(node);
    if (corner && !corners.includes(corner)) corners.push(corner);
    node = context.next[node];
  }
  if (corners.length === 0) return null;
  // Carry on a little past the last turn so the highlight leads out of it.
  for (let i = 0; i < MAZE_MAP.HINT_TAIL_SAMPLES && node >= 0; i++) {
    const sample = context.graph.samples[node];
    points.push({ x: sample.x, z: sample.z });
    node = context.next[node];
  }
  return { points, corners, expiresAt: now + MAZE_MAP.HINT_SECONDS };
}

/**
 * How wild a corner is, 1 (fast sweeper) to 4 (tight or hairpin).
 * @param corner - Corner of any road.
 * @returns Severity number.
 */
export function cornerSeverity(corner: CornerInfo): 1 | 2 | 3 | 4 {
  if (corner.angle >= MAZE_MAP.HAIRPIN_SEVERITY_ANGLE) return 4;
  const [fast, medium, tight] = MAZE_MAP.SEVERITY_RADII;
  if (corner.radius >= fast) return 1;
  if (corner.radius >= medium) return 2;
  return corner.radius >= tight ? 3 : 4;
}
