// lib/game/map/mazeMap.ts
import { MAZE_MAP } from "../constants";
import type { CornerInfo, RoadSample, StageData } from "../stage/types";

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

/** A hint: the next turns on the correct route, shown for a while. */
export interface MapHint {
  corners: CornerInfo[];
  /** Route arc length the highlighted path starts from. */
  fromS: number;
  /** Route arc length the highlighted path ends at. */
  toS: number;
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

/**
 * The next turns on the correct route after a progress point.
 * @param corners - Route corners.
 * @param progress - Car progress on the route.
 * @param count - How many turns to return.
 * @returns Upcoming corners in order.
 */
export function nextTurns(corners: ReadonlyArray<CornerInfo>, progress: number, count: number): CornerInfo[] {
  return corners.filter((corner) => corner.apexS > progress).slice(0, count);
}

/**
 * Builds a hint from the car's progress.
 * @param corners - Route corners.
 * @param progress - Car progress on the route.
 * @param now - Clock in seconds.
 * @returns Hint, or null when no turns remain.
 */
export function makeHint(corners: ReadonlyArray<CornerInfo>, progress: number, now: number): MapHint | null {
  const turns = nextTurns(corners, progress, MAZE_MAP.HINT_TURNS);
  if (turns.length === 0) return null;
  return { corners: turns, fromS: progress, toS: turns[turns.length - 1].endS, expiresAt: now + MAZE_MAP.HINT_SECONDS };
}

/**
 * Route samples between two arc lengths.
 * @param samples - Route samples.
 * @param fromS - Start arc length.
 * @param toS - End arc length.
 * @returns The samples inside the range.
 */
export function routeSlice(samples: ReadonlyArray<RoadSample>, fromS: number, toS: number): RoadSample[] {
  return samples.filter((sample) => sample.s >= fromS && sample.s <= toS);
}
