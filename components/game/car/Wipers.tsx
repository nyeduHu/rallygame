// components/game/car/Wipers.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { WIPERS } from "@/lib/game/constants";
import { damp } from "@/lib/game/math";
import { PALETTE } from "@/lib/game/palette";
import { useGameStore } from "@/lib/game/store";
import { windshieldRuntime } from "@/lib/game/weather/runtime";
import { beamTransform } from "./Beam";

const BLADE_X = [0.42, -0.1] as const;
const PARK_DAMPING = 8;
/** Parked blades lie along the windshield base, pointing toward the car centre. */
const PARK_ANGLE = Math.PI / 2;
const FULL_TURN = Math.PI * 2;

/**
 * Two wiper blades pivoting at the windshield base. The sweep phase advances only while the
 * wipers are on; the dirt model does the cleaning, the blades just decorate it.
 * @returns Blade groups in the windshield plane.
 */
export function Wipers() {
  const { BASE, TOP } = COCKPIT.WINDSHIELD;
  const { position, quaternion, length } = useMemo(() => beamTransform(BASE, TOP), [BASE, TOP]);
  const bladeRefs = useRef<Array<Group | null>>([null, null]);

  useFrame((_, delta) => {
    const on = useGameStore.getState().wipersOn;
    // Cosine ease gives a natural stop at each end of the sweep.
    const target = on ? PARK_ANGLE - WIPERS.SWEEP_ANGLE * (0.5 - 0.5 * Math.cos(windshieldRuntime.wipePhase * FULL_TURN)) : PARK_ANGLE;
    bladeRefs.current.forEach((blade) => {
      if (!blade) return;
      blade.rotation.z = on ? target : damp(blade.rotation.z, PARK_ANGLE, PARK_DAMPING, delta);
    });
  });

  return (
    <group position={position} quaternion={quaternion}>
      {BLADE_X.map((x, i) => (
        <group key={x} position={[x, -length / 2, 0.01]} ref={(node) => { bladeRefs.current[i] = node; }}>
          <mesh position={[0, WIPERS.BLADE_LENGTH / 2, 0]}>
            <boxGeometry args={[WIPERS.BLADE_THICKNESS, WIPERS.BLADE_LENGTH, WIPERS.BLADE_THICKNESS]} />
            <meshStandardMaterial color={PALETTE.leverKnob} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}
