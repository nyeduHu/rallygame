// components/game/car/CarExterior.tsx
"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Mesh, type Object3D } from "three";
import { CAR_MODEL_SCALE, CAR_MODEL_WHEEL_RADIUS, CAR_WHEEL_NODE_NAMES, MODEL_PATHS } from "@/lib/game/assets";
import { VEHICLE } from "@/lib/game/constants";
import { restingRideHeight, staticCompression } from "@/lib/game/physics/vehicle";
import type { GameSession } from "@/lib/game/session";

interface CarExteriorProps {
  session: GameSession;
}

/** Kenney wheel nodes are listed FL, FR, RL, RR to match Vehicle.wheels order. */
const WHEEL_ORDER = CAR_WHEEL_NODE_NAMES;
/** Visual wheels are resized so they match the physics wheel radius. */
const WHEEL_VISUAL_SCALE = VEHICLE.WHEEL_RADIUS / (CAR_MODEL_WHEEL_RADIUS * CAR_MODEL_SCALE);
/** Settled wheel-centre height in model units, so resized wheels touch the ground. */
const WHEEL_REST_Y = VEHICLE.WHEEL_RADIUS / CAR_MODEL_SCALE;

/**
 * Kenney hatchback for the chase camera, with wheels that spin, steer and follow
 * suspension travel from the physics state.
 * @param props - Game session.
 * @returns Car model.
 */
export function CarExterior({ session }: CarExteriorProps) {
  const { scene } = useGLTF(MODEL_PATHS.car);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  const wheels = useMemo(
    () =>
      WHEEL_ORDER.map((name) => {
        return model.getObjectByName(name) ?? null;
      }),
    [model],
  );

  useEffect(() => {
    wheels.forEach((wheel) => {
      wheel?.scale.setScalar(WHEEL_VISUAL_SCALE);
      // Steer (Y) must apply after spin (X) so the wheel spins about its own axle.
      wheel?.rotation.set(0, 0, 0, "YXZ");
    });
  }, [wheels]);

  useFrame(() => {
    const restCompression = staticCompression();
    session.vehicle.wheels.forEach((state, i) => {
      const node: Object3D | null = wheels[i];
      if (!node) return;
      node.rotation.x = state.spinAngle;
      node.rotation.y = state.steerAngle;
      const travel = state.inContact ? state.compression - restCompression : -restCompression;
      node.position.y = WHEEL_REST_Y + travel / CAR_MODEL_SCALE;
    });
  });

  return (
    <primitive object={model} position={[0, -restingRideHeight(), 0]} scale={CAR_MODEL_SCALE} />
  );
}
