// components/game/car/Gauges.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import type { Group } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { DRIVETRAIN, UNITS } from "@/lib/game/constants";
import { clamp } from "@/lib/game/math";
import { PALETTE } from "@/lib/game/palette";
import type { GameSession } from "@/lib/game/session";

const { CENTER, SPACING, RADIUS, RIM_WIDTH, NEEDLE_LENGTH, NEEDLE_WIDTH, SWEEP, START_ANGLE, SPEED_FULL_SCALE_KMH, TILT } =
  COCKPIT.GAUGES;
const CIRCLE_SEGMENTS = 16;
/** Small offsets stop the face, rim and needle from z-fighting. */
const LAYER_OFFSET = 0.002;

interface GaugeProps {
  x: number;
  needleRef: RefObject<Group | null>;
}

/**
 * Analogue dial with a needle that pivots at its centre.
 * @param props - Horizontal offset and needle ref.
 * @returns Gauge group.
 */
function Gauge({ x, needleRef }: GaugeProps) {
  return (
    <group position={[x, 0, 0]}>
      <mesh>
        <ringGeometry args={[RADIUS, RADIUS + RIM_WIDTH, CIRCLE_SEGMENTS]} />
        <meshStandardMaterial color={PALETTE.gaugeRim} flatShading />
      </mesh>
      <mesh position={[0, 0, -LAYER_OFFSET]}>
        <circleGeometry args={[RADIUS, CIRCLE_SEGMENTS]} />
        <meshStandardMaterial color={PALETTE.gaugeFace} />
      </mesh>
      <group ref={needleRef} position={[0, 0, LAYER_OFFSET]} rotation={[0, 0, START_ANGLE]}>
        <mesh position={[0, NEEDLE_LENGTH / 2, 0]}>
          <planeGeometry args={[NEEDLE_WIDTH, NEEDLE_LENGTH]} />
          <meshBasicMaterial color={PALETTE.gaugeNeedle} />
        </mesh>
      </group>
    </group>
  );
}

interface GaugesProps {
  session: GameSession;
}

/**
 * Physical speedometer and tachometer in the binnacle behind the wheel.
 * @param props - Game session.
 * @returns Gauge cluster.
 */
export function Gauges({ session }: GaugesProps) {
  const speedNeedle = useRef<Group>(null);
  const rpmNeedle = useRef<Group>(null);

  useFrame(() => {
    const speedKmh = Math.abs(session.vehicle.forwardSpeed) * UNITS.MS_TO_KMH;
    const speedFraction = clamp(speedKmh / SPEED_FULL_SCALE_KMH, 0, 1);
    const rpmFraction = clamp(session.vehicle.drivetrain.rpm / DRIVETRAIN.REDLINE_RPM, 0, 1);
    if (speedNeedle.current) speedNeedle.current.rotation.z = START_ANGLE - speedFraction * SWEEP;
    if (rpmNeedle.current) rpmNeedle.current.rotation.z = START_ANGLE - rpmFraction * SWEEP;
  });

  // Rotated to face the driver (who looks along +z) and tilted up toward their eyes.
  return (
    <group position={[...CENTER]} rotation={[TILT, Math.PI, 0]}>
      <Gauge x={-SPACING / 2} needleRef={speedNeedle} />
      <Gauge x={SPACING / 2} needleRef={rpmNeedle} />
    </group>
  );
}
