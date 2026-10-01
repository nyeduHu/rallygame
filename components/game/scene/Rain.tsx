// components/game/scene/Rain.tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from "three";
import { WEATHER } from "@/lib/game/constants";
import { createRng } from "@/lib/game/random";
import { useGameStore } from "@/lib/game/store";

const RAIN_SEED = 1;
const AXES = 3;

interface RainState {
  geometry: BufferGeometry;
  material: PointsMaterial;
  /** Per-drop offset inside the box (x, fall height, z). */
  offsets: Float32Array;
}

/**
 * Builds the drop cloud with a fixed seed so rendering stays deterministic.
 * @returns Geometry, material and drop offsets.
 */
function createRainState(): RainState {
  const rng = createRng(RAIN_SEED);
  const offsets = new Float32Array(WEATHER.MAX_RAIN_PARTICLES * AXES);
  for (let i = 0; i < WEATHER.MAX_RAIN_PARTICLES; i++) {
    offsets[i * AXES] = rng.range(-0.5, 0.5) * WEATHER.RAIN_BOX_SIZE;
    offsets[i * AXES + 1] = rng.range(0, WEATHER.RAIN_BOX_HEIGHT);
    offsets[i * AXES + 2] = rng.range(-0.5, 0.5) * WEATHER.RAIN_BOX_SIZE;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(WEATHER.MAX_RAIN_PARTICLES * AXES), AXES));
  const material = new PointsMaterial({
    color: WEATHER.RAIN_COLOR,
    size: WEATHER.RAIN_POINT_SIZE,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  return { geometry, material, offsets };
}

/**
 * Wraps a coordinate into a box of RAIN_BOX_SIZE centred on `centre`.
 * @param value - Drop offset.
 * @param centre - Camera coordinate.
 * @returns World coordinate inside the box.
 */
function wrapAround(value: number, centre: number): number {
  const size = WEATHER.RAIN_BOX_SIZE;
  const half = size / 2;
  return ((((value - centre + half) % size) + size) % size) - half + centre;
}

/**
 * Falling rain streaks in a box that follows the camera, wrapped so the count stays constant.
 * Opacity scales with intensity; renders nothing when clear.
 * @returns Points cloud.
 */
export function Rain() {
  const pointsRef = useRef<Points>(null);
  const stateRef = useRef<RainState | null>(null);
  const camera = useThree((state) => state.camera);

  useFrame((_, delta) => {
    const points = pointsRef.current;
    if (!points) return;
    if (!stateRef.current) {
      stateRef.current = createRainState();
      points.geometry = stateRef.current.geometry;
      points.material = stateRef.current.material;
    }
    const { geometry, material, offsets } = stateRef.current;
    const { weather } = useGameStore.getState();
    points.visible = weather.kind === "rain" && weather.intensity > 0;
    if (!points.visible) return;
    material.opacity = weather.intensity;
    const attribute = geometry.getAttribute("position");
    const array = attribute.array;
    const count = Math.ceil(WEATHER.MAX_RAIN_PARTICLES * weather.intensity);
    geometry.setDrawRange(0, count);
    for (let i = 0; i < count; i++) {
      const base = i * AXES;
      let fall = offsets[base + 1] - WEATHER.RAIN_FALL_SPEED * delta;
      if (fall < 0) fall += WEATHER.RAIN_BOX_HEIGHT;
      offsets[base + 1] = fall;
      array[base] = wrapAround(offsets[base], camera.position.x);
      array[base + 1] = camera.position.y - WEATHER.RAIN_BOX_HEIGHT / 2 + fall;
      array[base + 2] = wrapAround(offsets[base + 2], camera.position.z);
    }
    attribute.needsUpdate = true;
  });

  return <points ref={pointsRef} frustumCulled={false} />;
}
