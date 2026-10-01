// components/game/repair/EngineSmoke.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { createRng } from "@/lib/game/random";
import { useGameStore } from "@/lib/game/store";

const COUNT = 60;
const AXES = 3;
const SMOKE_SEED = 5;
const RISE_SPEED = 0.9;
const MAX_HEIGHT = 1.4;
const SPREAD = 0.25;

interface SmokeState {
  geometry: BufferGeometry;
  material: PointsMaterial;
  heights: Float32Array;
  offsets: Float32Array;
}

/** @returns Particle buffers for the smoke plume (deterministic). */
function createSmoke(): SmokeState {
  const rng = createRng(SMOKE_SEED);
  const heights = new Float32Array(COUNT);
  const offsets = new Float32Array(COUNT * 2);
  for (let i = 0; i < COUNT; i++) {
    heights[i] = rng.range(0, MAX_HEIGHT);
    offsets[i * 2] = rng.range(-SPREAD, SPREAD);
    offsets[i * 2 + 1] = rng.range(-SPREAD, SPREAD);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(COUNT * AXES), AXES));
  const material = new PointsMaterial({ color: "#4b4f57", size: 0.22, transparent: true, opacity: 0.6, depthWrite: false });
  return { geometry, material, heights, offsets };
}

/**
 * Smoke rising from the engine while it is overheating or failed, the visual cue for trouble.
 * @returns Points cloud in car-local space.
 */
export function EngineSmoke() {
  const ref = useRef<Points>(null);
  const state = useRef<SmokeState | null>(null);

  useFrame((_, delta) => {
    const points = ref.current;
    if (!points) return;
    if (!state.current) {
      state.current = createSmoke();
      points.geometry = state.current.geometry;
      points.material = state.current.material;
    }
    const { geometry, material, heights, offsets } = state.current;
    const status = useGameStore.getState().mech.engineStatus;
    points.visible = status !== "ok";
    if (!points.visible) return;
    material.opacity = status === "failed" ? 0.75 : 0.4;
    const attribute = geometry.getAttribute("position");
    const array = attribute.array;
    const [ox, oy, oz] = COCKPIT.ENGINE_BAY.SMOKE_ORIGIN;
    for (let i = 0; i < COUNT; i++) {
      heights[i] = (heights[i] + RISE_SPEED * delta) % MAX_HEIGHT;
      array[i * AXES] = ox + offsets[i * 2] * (1 + heights[i]);
      array[i * AXES + 1] = oy + heights[i];
      array[i * AXES + 2] = oz + offsets[i * 2 + 1] * (1 + heights[i]);
    }
    attribute.needsUpdate = true;
  });

  return <points ref={ref} frustumCulled={false} />;
}
