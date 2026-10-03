// lib/game/map/mazeMap.test.ts
import { describe, expect, it } from "vitest";
import { MAZE_MAP } from "../constants";
import type { CornerInfo } from "../stage/types";
import { baseScale, cornerSeverity, createView, createHintContext, makeHint, makeProjection, stepView, toggleMode, type MapKeys } from "./mazeMap";

const BOUNDS = { minX: -100, maxX: 900, minZ: -50, maxZ: 550 };
const VIEWPORT = { width: 1024, height: 560 };
const NO_KEYS: MapKeys = { zoomIn: false, zoomOut: false, left: false, right: false, up: false, down: false };
const SECOND = 1;
const TURN_COUNT = 8;

/** Corners 100 m apart. */
const CORNERS: CornerInfo[] = Array.from({ length: TURN_COUNT }, (_, i) => ({
  startS: 100 + i * 100, endS: 130 + i * 100, apexS: 115 + i * 100, radius: 30, angle: Math.PI / 2, direction: 1, classId: "tight",
}));

describe("maze map view", () => {
  it("zooms with E / Q within limits and pans with WASD", () => {
    let view = createView();
    view = stepView(view, { ...NO_KEYS, zoomIn: true }, SECOND, 1);
    expect(view.zoom).toBeGreaterThan(1);
    for (let i = 0; i < 20; i++) view = stepView(view, { ...NO_KEYS, zoomIn: true }, SECOND, 1);
    expect(view.zoom).toBe(MAZE_MAP.ZOOM_MAX);
    view = stepView(createView(), { ...NO_KEYS, up: true }, SECOND, 1);
    expect(view.panZ).toBeGreaterThan(0);
    view = stepView(createView(), { ...NO_KEYS, left: true }, SECOND, 1);
    expect(view.panX).toBeGreaterThan(0);
  });

  it("toggles between the car view and the whole maze, resetting zoom and pan", () => {
    const zoomed = { ...createView(), zoom: 3, panX: 20 };
    const full = toggleMode(zoomed);
    expect(full).toEqual({ mode: "FULL", zoom: 1, panX: 0, panZ: 0 });
    expect(toggleMode(full).mode).toBe("CAR");
  });

  it("centres the car in the car view and fits the maze in the full view", () => {
    const car = { x: 300, z: 200 };
    const centred = makeProjection(createView(), car, BOUNDS, VIEWPORT).project(car.x, car.z);
    expect(centred.x).toBeCloseTo(VIEWPORT.width / 2);
    expect(centred.y).toBeCloseTo(VIEWPORT.height / 2);
    const full = makeProjection(toggleMode(createView()), car, BOUNDS, VIEWPORT);
    const corner = full.project(BOUNDS.minX, BOUNDS.minZ);
    const opposite = full.project(BOUNDS.maxX, BOUNDS.maxZ);
    for (const p of [corner, opposite]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(VIEWPORT.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(VIEWPORT.height);
    }
    expect(baseScale("FULL", BOUNDS, VIEWPORT)).toBeLessThan(baseScale("CAR", BOUNDS, VIEWPORT));
  });

  it("puts north up and does not mirror east-west (world +x is screen left)", () => {
    const { project } = makeProjection(createView(), { x: 0, z: 0 }, BOUNDS, VIEWPORT);
    expect(project(0, 50).y).toBeLessThan(project(0, 0).y);
    expect(project(50, 0).x).toBeLessThan(project(0, 0).x);
  });

  it("hints the shortest way home through the next five turns, from wherever the car is", () => {
    const samples = Array.from({ length: 401 }, (_, i) => ({ x: 0, y: 0, z: i * 2, s: i * 2, heading: 0 }));
    const context = createHintContext({ samples, corners: CORNERS, branches: [] });
    const hint = makeHint(context, 0, 250, 10);
    expect(hint?.corners.map((corner) => corner.startS)).toEqual([300, 400, 500, 600, 700]);
    expect(hint?.expiresAt).toBe(10 + MAZE_MAP.HINT_SECONDS);
    expect(hint?.points[0].z).toBeCloseTo(250, 0);
    expect(makeHint(context, 0, 799, 0)).toBeNull();
  });

  it("grades corners from 1 (fast) to 4 (tight)", () => {
    const corner = (radius: number, angle = 1): CornerInfo => ({ startS: 0, endS: 10, apexS: 5, radius, angle, direction: 1, classId: "medium" });
    expect([200, 100, 50, 30].map((radius) => cornerSeverity(corner(radius)))).toEqual([1, 2, 3, 4]);
    expect(cornerSeverity(corner(200, 2.6))).toBe(4);
  });
});
