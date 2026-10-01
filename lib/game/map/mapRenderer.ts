// lib/game/map/mapRenderer.ts
import type { RoadSample } from "../stage/types";

export interface MapViewport {
  width: number;
  height: number;
}

export interface MapPoint {
  x: number;
  y: number;
  s: number;
  heading: number;
}

export interface MapWorldPoint {
  x: number;
  z: number;
  s: number;
  heading: number;
}

/**
 * Converts a world-relative road heading to a clockwise canvas rotation.
 * @param heading - Road heading in world coordinates or relative to the map frame.
 * @returns Rotation that points the marker along the road on the canvas.
 */
export function mapHeadingToCanvasAngle(heading: number): number {
  return Math.atan2(-Math.cos(heading), Math.sin(heading));
}

/**
 * Fits world-space road samples into a padded top-down map viewport.
 * @param samples - Ordered stage centreline.
 * @param viewport - Pixel dimensions of the map area.
 * @param margin - Minimum padding from each viewport edge.
 * @returns Road samples mapped to canvas coordinates.
 */
export function fitRoadToViewport(
  samples: ReadonlyArray<RoadSample>,
  viewport: MapViewport,
  margin: number,
): MapPoint[] {
  if (samples.length === 0) return [];
  const bounds = samples.reduce(
    (result, sample) => ({
      minX: Math.min(result.minX, sample.x),
      maxX: Math.max(result.maxX, sample.x),
      minZ: Math.min(result.minZ, sample.z),
      maxZ: Math.max(result.maxZ, sample.z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
  const worldWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const worldHeight = Math.max(bounds.maxZ - bounds.minZ, 1);
  const scale = Math.min((viewport.width - margin * 2) / worldWidth, (viewport.height - margin * 2) / worldHeight);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  return samples.map((sample) => ({
    x: viewport.width / 2 + (sample.x - centerX) * scale,
    y: viewport.height / 2 - (sample.z - centerZ) * scale,
    s: sample.s,
    heading: sample.heading,
  }));
}

/**
 * Projects a world point into a forward-facing NEXT map window.
 * @param point - Road point to display.
 * @param car - Current interpolated car position and heading.
 * @param viewport - Pixel dimensions of the map area.
 * @param pixelsPerMetre - NEXT zoom scale.
 * @param carVerticalRatio - Car marker's vertical anchor in the viewport.
 * @returns Canvas point with the road ahead oriented toward the top edge.
 */
export function projectNextPoint(
  point: MapWorldPoint,
  car: MapWorldPoint,
  viewport: MapViewport,
  pixelsPerMetre: number,
  carVerticalRatio: number,
): MapPoint {
  const dx = point.x - car.x;
  const dz = point.z - car.z;
  const forward = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
  const lateral = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
  return {
    x: viewport.width / 2 + lateral * pixelsPerMetre,
    y: viewport.height * carVerticalRatio - forward * pixelsPerMetre,
    s: point.s,
    heading: point.heading - car.heading,
  };
}
