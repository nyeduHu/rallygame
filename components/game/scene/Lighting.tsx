// components/game/scene/Lighting.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3, type DirectionalLight } from "three";
import { RENDER } from "@/lib/game/constants";
import { PALETTE } from "@/lib/game/palette";
import type { SessionView } from "@/lib/game/sessionView";

interface LightingProps {
  session: SessionView;
}

const SUN_OFFSET = new Vector3(RENDER.SUN_DIRECTION.x, RENDER.SUN_DIRECTION.y, RENDER.SUN_DIRECTION.z)
  .normalize()
  .multiplyScalar(RENDER.SUN_DISTANCE);

/**
 * Sky/fog plus a sun whose shadow frustum follows the car, so a small high-res
 * shadow map covers what the driver can actually see up close.
 * @param props - Game session (for car position).
 * @returns Lights, background and fog.
 */
export function Lighting({ session }: LightingProps) {
  const sunRef = useRef<DirectionalLight>(null);

  useEffect(() => {
    const sun = sunRef.current;
    if (!sun) return;
    const camera = sun.shadow.camera;
    camera.left = -RENDER.SHADOW_EXTENT;
    camera.right = RENDER.SHADOW_EXTENT;
    camera.top = RENDER.SHADOW_EXTENT;
    camera.bottom = -RENDER.SHADOW_EXTENT;
    camera.near = RENDER.SHADOW_NEAR;
    camera.far = RENDER.SUN_DISTANCE * 2;
    camera.updateProjectionMatrix();
  }, []);

  useFrame(() => {
    const sun = sunRef.current;
    if (!sun) return;
    const car = session.renderPosition;
    sun.position.copy(car).add(SUN_OFFSET);
    sun.target.position.copy(car);
    sun.target.updateMatrixWorld();
  });

  return (
    <>
      <color attach="background" args={[PALETTE.sky]} />
      <fog attach="fog" args={[PALETTE.sky, RENDER.FOG_NEAR, RENDER.FOG_FAR]} />
      <hemisphereLight args={[PALETTE.hemiSky, PALETTE.hemiGround, RENDER.HEMI_INTENSITY]} />
      <directionalLight
        ref={sunRef}
        color={PALETTE.sunLight}
        intensity={RENDER.SUN_INTENSITY}
        castShadow
        shadow-mapSize={[RENDER.SHADOW_MAP_SIZE, RENDER.SHADOW_MAP_SIZE]}
        shadow-bias={RENDER.SHADOW_BIAS}
      />
    </>
  );
}
