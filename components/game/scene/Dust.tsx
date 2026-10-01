// components/game/scene/Dust.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { BufferAttribute, BufferGeometry, Points, PointsMaterial, Vector3 } from "three";
import { FX, VEHICLE } from "@/lib/game/constants";
import { createRng } from "@/lib/game/random";
import type { SessionView } from "@/lib/game/sessionView";
import { FRAME_PRIORITY } from "./framePriority";

const AXES = 3;
const HIDDEN_Y = -10000;
const DUST_SEED = 11;
const SPEED_FOR_FULL_RATE = 30;

interface DustState {
  geometry: BufferGeometry;
  material: PointsMaterial;
  ages: Float32Array;
  velocities: Float32Array;
  cursor: number;
  emitDebt: number;
}

/** @returns Pooled particle buffers; every particle starts hidden and expired. */
function createDust(): DustState {
  const positions = new Float32Array(FX.MAX_DUST_PARTICLES * AXES);
  for (let i = 0; i < FX.MAX_DUST_PARTICLES; i++) positions[i * AXES + 1] = HIDDEN_Y;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, AXES));
  const material = new PointsMaterial({ color: FX.DUST_COLOR, size: FX.DUST_SIZE, transparent: true, opacity: 0.45, depthWrite: false });
  return {
    geometry,
    material,
    ages: new Float32Array(FX.MAX_DUST_PARTICLES).fill(FX.DUST_LIFETIME_S),
    velocities: new Float32Array(FX.MAX_DUST_PARTICLES * AXES),
    cursor: 0,
    emitDebt: 0,
  };
}

interface DustProps {
  session: SessionView;
}

/**
 * Dust kicked up behind the rear tyres on gravel. Particles are pooled in a ring buffer, so
 * nothing is allocated per frame.
 * @param props - Session for car pose, speed and surface.
 * @returns Points cloud in world space.
 */
export function Dust({ session }: DustProps) {
  const pointsRef = useRef<Points>(null);
  const state = useRef<DustState | null>(null);
  const rng = useRef(createRng(DUST_SEED));
  const scratch = useRef({ local: new Vector3(), world: new Vector3() });

  useFrame((_, delta) => {
    const points = pointsRef.current;
    if (!points) return;
    if (!state.current) {
      state.current = createDust();
      points.geometry = state.current.geometry;
      points.material = state.current.material;
    }
    const dust = state.current;
    const array = dust.geometry.getAttribute("position").array;
    const speed = Math.abs(session.vehicle.forwardSpeed);
    const onGravel = "surface" in session.vehicle ? session.vehicle.surface === "gravel" : true;

    dust.emitDebt += (onGravel && speed > FX.DUST_MIN_SPEED_MS ? (speed / SPEED_FOR_FULL_RATE) * FX.DUST_RATE_AT_30MS : 0) * delta;
    const { local, world } = scratch.current;
    while (dust.emitDebt >= 1) {
      dust.emitDebt -= 1;
      const i = dust.cursor;
      dust.cursor = (dust.cursor + 1) % FX.MAX_DUST_PARTICLES;
      const side = rng.current.chance(0.5) ? 1 : -1;
      local.set(side * VEHICLE.WHEEL_HALF_TRACK, 0, VEHICLE.WHEEL_REAR_Z);
      world.copy(local).applyQuaternion(session.renderQuaternion).add(session.renderPosition);
      array[i * AXES] = world.x;
      array[i * AXES + 1] = world.y - VEHICLE.WHEEL_RADIUS;
      array[i * AXES + 2] = world.z;
      dust.ages[i] = 0;
      dust.velocities[i * AXES] = rng.current.range(-0.5, 0.5);
      dust.velocities[i * AXES + 1] = FX.DUST_RISE_SPEED * rng.current.range(0.6, 1.2);
      dust.velocities[i * AXES + 2] = rng.current.range(-0.5, 0.5);
    }
    for (let i = 0; i < FX.MAX_DUST_PARTICLES; i++) {
      if (dust.ages[i] >= FX.DUST_LIFETIME_S) {
        array[i * AXES + 1] = HIDDEN_Y;
        continue;
      }
      dust.ages[i] += delta;
      array[i * AXES] += dust.velocities[i * AXES] * delta;
      array[i * AXES + 1] += dust.velocities[i * AXES + 1] * delta;
      array[i * AXES + 2] += dust.velocities[i * AXES + 2] * delta;
    }
    dust.geometry.getAttribute("position").needsUpdate = true;
  }, FRAME_PRIORITY.CAR + 0.5);

  return <points ref={pointsRef} frustumCulled={false} />;
}
