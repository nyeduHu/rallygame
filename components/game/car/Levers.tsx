// components/game/car/Levers.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { PALETTE } from "@/lib/game/palette";
import type { GameSession } from "@/lib/game/session";

const { GEAR_LEVER, HANDBRAKE } = COCKPIT;
const CYLINDER_SEGMENTS = 8;
const SPHERE_SEGMENTS = 8;

interface LeversProps {
  session: GameSession;
}

/**
 * Gear lever (tilts back in reverse) and handbrake (lifts while Space is held).
 * @param props - Game session.
 * @returns Lever group.
 */
export function Levers({ session }: LeversProps) {
  const gearRef = useRef<Group>(null);
  const handbrakeRef = useRef<Group>(null);

  useFrame((_, delta) => {
    const { vehicle } = session;
    if (gearRef.current) {
      gearRef.current.rotation.x = vehicle.drivetrain.reverse ? GEAR_LEVER.REVERSE_TILT : GEAR_LEVER.FORWARD_TILT;
    }
    if (handbrakeRef.current) {
      const target = -(vehicle.handbrake ? HANDBRAKE.PULLED_ANGLE : HANDBRAKE.REST_ANGLE);
      const current = handbrakeRef.current.rotation.x;
      const blend = 1 - Math.exp(-HANDBRAKE.RESPONSE * delta);
      handbrakeRef.current.rotation.x = current + (target - current) * blend;
    }
  });

  return (
    <group name="levers">
      <group ref={gearRef} position={[...GEAR_LEVER.BASE]}>
        <mesh position={[0, GEAR_LEVER.LENGTH / 2, 0]}>
          <cylinderGeometry args={[GEAR_LEVER.RADIUS, GEAR_LEVER.RADIUS, GEAR_LEVER.LENGTH, CYLINDER_SEGMENTS]} />
          <meshStandardMaterial color={PALETTE.lever} flatShading />
        </mesh>
        <mesh position={[0, GEAR_LEVER.LENGTH, 0]}>
          <sphereGeometry args={[GEAR_LEVER.KNOB_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS]} />
          <meshStandardMaterial color={PALETTE.leverKnob} flatShading />
        </mesh>
      </group>
      <group ref={handbrakeRef} position={[...HANDBRAKE.PIVOT]} rotation={[-HANDBRAKE.REST_ANGLE, 0, 0]}>
        <mesh position={[0, HANDBRAKE.LENGTH / 2, 0]}>
          <boxGeometry args={[HANDBRAKE.THICKNESS, HANDBRAKE.LENGTH, HANDBRAKE.THICKNESS]} />
          <meshStandardMaterial color={PALETTE.lever} flatShading />
        </mesh>
      </group>
    </group>
  );
}
