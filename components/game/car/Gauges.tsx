// components/game/car/Gauges.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import type { Group, MeshBasicMaterial } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { DRIVETRAIN, MECHANICS, UNITS } from "@/lib/game/constants";
import { clamp } from "@/lib/game/math";
import { PALETTE } from "@/lib/game/palette";
import type { SessionView } from "@/lib/game/sessionView";
import { useGameStore } from "@/lib/game/store";

const GAUGES = COCKPIT.GAUGES;
const { CENTER, SPACING, RADIUS, RIM_WIDTH, NEEDLE_LENGTH, NEEDLE_WIDTH, SWEEP, START_ANGLE, SPEED_FULL_SCALE_KMH, TILT } =
  COCKPIT.GAUGES;
const CIRCLE_SEGMENTS = 16;
/** Small offsets stop the face, rim and needle from z-fighting. */
const LAYER_OFFSET = 0.002;

interface GaugeProps {
  x: number;
  needleRef: RefObject<Group | null>;
  /** Dial scale relative to the main gauges (1 = full size). */
  scale?: number;
  y?: number;
}

/**
 * Analogue dial with a needle that pivots at its centre.
 * @param props - Horizontal offset and needle ref.
 * @returns Gauge group.
 */
function Gauge({ x, needleRef, scale = 1, y = 0 }: GaugeProps) {
  return (
    <group position={[x, y, 0]} scale={scale}>
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

const WARNING_AMBER = "#f2b33d";
const WARNING_RED = "#e2462f";
const LAMP_OFF = "#2a2c31";
const TWO_PI = Math.PI * 2;

interface LampProps {
  x: number;
  lampRef: RefObject<MeshBasicMaterial | null>;
}

/**
 * Round dashboard warning lamp; colour is driven each frame.
 * @param props - Horizontal offset and material ref.
 * @returns Lamp mesh.
 */
function Lamp({ x, lampRef }: LampProps) {
  return (
    <mesh position={[x, GAUGES.LAMP_OFFSET_Y, LAYER_OFFSET]}>
      <circleGeometry args={[GAUGES.LAMP_RADIUS, CIRCLE_SEGMENTS]} />
      <meshBasicMaterial ref={lampRef} color={LAMP_OFF} />
    </mesh>
  );
}

interface GaugesProps {
  session: SessionView;
}

/**
 * Physical speedometer and tachometer in the binnacle behind the wheel.
 * @param props - Game session.
 * @returns Gauge cluster.
 */
export function Gauges({ session }: GaugesProps) {
  const speedNeedle = useRef<Group>(null);
  const rpmNeedle = useRef<Group>(null);
  const tempNeedle = useRef<Group>(null);
  const fuelNeedle = useRef<Group>(null);
  const overheatLamp = useRef<MeshBasicMaterial>(null);
  const engineLamp = useRef<MeshBasicMaterial>(null);

  useFrame(() => {
    const speedKmh = Math.abs(session.vehicle.forwardSpeed) * UNITS.MS_TO_KMH;
    const speedFraction = clamp(speedKmh / SPEED_FULL_SCALE_KMH, 0, 1);
    const rpmFraction = clamp(session.vehicle.drivetrain.rpm / DRIVETRAIN.REDLINE_RPM, 0, 1);
    if (speedNeedle.current) speedNeedle.current.rotation.z = START_ANGLE - speedFraction * SWEEP;
    if (rpmNeedle.current) rpmNeedle.current.rotation.z = START_ANGLE - rpmFraction * SWEEP;

    const { mech } = useGameStore.getState();
    if (tempNeedle.current) tempNeedle.current.rotation.z = START_ANGLE - clamp(mech.temperature01, 0, 1) * SWEEP;
    if (fuelNeedle.current) fuelNeedle.current.rotation.z = START_ANGLE - clamp(mech.fuel01, 0, 1) * SWEEP;
    // Red lamps blink so they are noticed peripherally; amber is steady.
    const blinkOn = Math.sin(performance.now() / 1000 * GAUGES.LAMP_BLINK_HZ * TWO_PI) > 0;
    const critical = mech.engineStatus === "failed" || mech.temperature01 >= MECHANICS.OVERHEAT_FAIL;
    overheatLamp.current?.color.set(
      critical ? (blinkOn ? WARNING_RED : LAMP_OFF) : mech.temperature01 >= MECHANICS.OVERHEAT_WARN ? WARNING_AMBER : LAMP_OFF,
    );
    engineLamp.current?.color.set(mech.engineStatus === "failed" ? WARNING_RED : LAMP_OFF);
  });

  // Rotated to face the driver (who looks along +z) and tilted up toward their eyes.
  return (
    <group position={[...CENTER]} rotation={[TILT, Math.PI, 0]}>
      <Gauge x={-SPACING / 2} needleRef={speedNeedle} />
      <Gauge x={SPACING / 2} needleRef={rpmNeedle} />
      <Gauge x={-GAUGES.SECONDARY_SPACING / 2} y={GAUGES.SECONDARY_OFFSET_Y} scale={GAUGES.SECONDARY_RADIUS / RADIUS} needleRef={tempNeedle} />
      <Gauge x={GAUGES.SECONDARY_SPACING / 2} y={GAUGES.SECONDARY_OFFSET_Y} scale={GAUGES.SECONDARY_RADIUS / RADIUS} needleRef={fuelNeedle} />
      <Lamp x={-GAUGES.LAMP_SPACING / 2} lampRef={overheatLamp} />
      <Lamp x={GAUGES.LAMP_SPACING / 2} lampRef={engineLamp} />
    </group>
  );
}
