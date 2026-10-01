// components/game/scene/SkidMarks.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { FX, VEHICLE } from "@/lib/game/constants";
import type { SessionView } from "@/lib/game/sessionView";
import { FRAME_PRIORITY } from "./framePriority";

const SIDES = [1, -1] as const;
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const HIDDEN_SCALE = new Vector3(0, 0, 0);
const UNIT = new Vector3(1, 1, 1);

interface SkidMarksProps {
  session: SessionView;
}

/**
 * Dark quads left by the rear tyres while sliding, kept in a ring buffer so the oldest marks
 * are overwritten. Only the locally simulated car leaves marks.
 * @param props - Session for pose and slip.
 * @returns Instanced mesh in world space.
 */
export function SkidMarks({ session }: SkidMarksProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const cursor = useRef(0);
  const last = useRef([new Vector3(Infinity, 0, 0), new Vector3(Infinity, 0, 0)]);
  const scratch = useRef({ matrix: new Matrix4(), position: new Vector3(), quaternion: new Quaternion(), local: new Vector3(), scale: new Vector3(1, 1, 1) });

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new Matrix4().compose(new Vector3(0, -10000, 0), FLAT, HIDDEN_SCALE);
    for (let i = 0; i < FX.MAX_SKID_SEGMENTS; i++) mesh.setMatrixAt(i, matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || session.vehicle.slipSpeed < FX.SKID_MIN_SLIP_MS) return;
    const s = scratch.current;
    SIDES.forEach((side, index) => {
      s.local.set(side * VEHICLE.WHEEL_HALF_TRACK, 0, VEHICLE.WHEEL_REAR_Z);
      s.position.copy(s.local).applyQuaternion(session.renderQuaternion).add(session.renderPosition);
      s.position.y -= VEHICLE.WHEEL_RADIUS - FX.SKID_LIFT;
      if (s.position.distanceTo(last.current[index]) < FX.SKID_SPACING_M) return;
      last.current[index].copy(s.position);
      s.quaternion.copy(session.renderQuaternion);
      // Lay the quad flat on the ground while keeping the car's heading.
      s.quaternion.multiply(FLAT);
      s.scale.copy(UNIT);
      mesh.setMatrixAt(cursor.current, s.matrix.compose(s.position, s.quaternion, s.scale));
      cursor.current = (cursor.current + 1) % FX.MAX_SKID_SEGMENTS;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, FRAME_PRIORITY.CAR + 0.5);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, FX.MAX_SKID_SEGMENTS]} frustumCulled={false}>
      <planeGeometry args={[FX.SKID_WIDTH, FX.SKID_LENGTH]} />
      <meshBasicMaterial color={FX.SKID_COLOR} transparent opacity={0.55} depthWrite={false} />
    </instancedMesh>
  );
}
