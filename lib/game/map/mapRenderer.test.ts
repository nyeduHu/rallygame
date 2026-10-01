// lib/game/map/mapRenderer.test.ts
import { describe, expect, it } from "vitest";
import {
  fitRoadToViewport,
  mapHeadingToCanvasAngle,
  projectNextPoint,
  type MapWorldPoint,
} from "./mapRenderer";

describe("map geometry", () => {
  it("fits every road sample within the padded viewport", () => {
    const samples = [
      { x: -30, y: 0, z: -20, s: 0, heading: 0 },
      { x: 30, y: 0, z: -20, s: 60, heading: Math.PI / 2 },
      { x: 30, y: 0, z: 20, s: 100, heading: Math.PI },
    ];
    const margin = 24;
    const viewport = { width: 320, height: 180 };
    const points = fitRoadToViewport(samples, viewport, margin);

    expect(points).toHaveLength(samples.length);
    points.forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(margin);
      expect(point.x).toBeLessThanOrEqual(viewport.width - margin);
      expect(point.y).toBeGreaterThanOrEqual(margin);
      expect(point.y).toBeLessThanOrEqual(viewport.height - margin);
    });
  });

  it("keeps overview endpoints inside the visible area below the header", () => {
    const samples = [
      { x: -2, y: 0, z: -5, s: 0, heading: 0 },
      { x: 0, y: 0, z: 0, s: 5, heading: Math.PI / 4 },
      { x: 2, y: 0, z: 5, s: 10, heading: Math.PI / 2 },
    ];
    const headerHeight = 36;
    const visibleViewport = { width: 320, height: 446 };
    const points = fitRoadToViewport(samples, visibleViewport, 24);
    const canvasPoints = points.map((point) => ({ ...point, y: point.y + headerHeight }));

    canvasPoints.forEach((point) => {
      expect(point.y).toBeGreaterThanOrEqual(headerHeight + 24);
      expect(point.y).toBeLessThanOrEqual(headerHeight + visibleViewport.height - 24);
    });
  });

  it("places the point 600 metres ahead above the car in NEXT mode", () => {
    const car: MapWorldPoint = { x: 12, z: -8, s: 100, heading: Math.PI / 3 };
    const ahead: MapWorldPoint = {
      x: car.x + Math.sin(car.heading) * 600,
      z: car.z + Math.cos(car.heading) * 600,
      s: 700,
      heading: car.heading,
    };
    const viewport = { width: 600, height: 400 };
    const carMarkerY = viewport.height * 0.72;
    const projected = projectNextPoint(ahead, car, viewport, 0.5, 0.72);

    expect(projected.x).toBeCloseTo(viewport.width / 2);
    expect(projected.y).toBeLessThan(carMarkerY);
    expect(projected.y).toBeCloseTo(carMarkerY - 600 * 0.5);
    expect(projected.heading).toBeCloseTo(0);
    expect(mapHeadingToCanvasAngle(projected.heading)).toBeCloseTo(-Math.PI / 2);
  });

  it("rotates projected road headings into the canvas frame", () => {
    expect(mapHeadingToCanvasAngle(0)).toBeCloseTo(-Math.PI / 2);
    expect(mapHeadingToCanvasAngle(Math.PI / 2)).toBeCloseTo(0);
  });
});
