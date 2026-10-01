// components/game/car/Beam.tsx
"use client";

import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";

type Vec3 = readonly [number, number, number];

const Y_AXIS = new Vector3(0, 1, 0);

interface BeamProps {
  from: Vec3;
  to: Vec3;
  /** Cross-section size [x, z] of the box. */
  thickness: number;
  color: string;
  castShadow?: boolean;
}

/**
 * Computes the transform that stretches a Y-aligned unit shape between two points.
 * @param from - Start point.
 * @param to - End point.
 * @returns Midpoint, orientation and length.
 */
export function beamTransform(from: Vec3, to: Vec3): { position: Vector3; quaternion: Quaternion; length: number } {
  const start = new Vector3(...from);
  const end = new Vector3(...to);
  const direction = end.clone().sub(start);
  const length = direction.length();
  const quaternion = new Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize());
  return { position: start.add(end).multiplyScalar(0.5), quaternion, length };
}

/**
 * A box spanning two points; used for pillars and frame members of the cockpit.
 * @param props - Endpoints, thickness and colour.
 * @returns Mesh.
 */
export function Beam({ from, to, thickness, color, castShadow = true }: BeamProps) {
  const { position, quaternion, length } = useMemo(() => beamTransform(from, to), [from, to]);
  return (
    <mesh position={position} quaternion={quaternion} castShadow={castShadow} receiveShadow>
      <boxGeometry args={[thickness, length, thickness]} />
      <meshStandardMaterial color={color} flatShading roughness={COCKPIT.MATERIAL.FRAME_ROUGHNESS} />
    </mesh>
  );
}
