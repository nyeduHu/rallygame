// components/game/car/SteeringWheel.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Euler, Quaternion, Vector3, type Group, type Mesh } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { STEERING } from "@/lib/game/constants";
import { PALETTE } from "@/lib/game/palette";
import type { GameSession } from "@/lib/game/session";
import { FRAME_PRIORITY } from "../scene/framePriority";

const { CENTER, TILT, RADIUS, TUBE, SPOKE_WIDTH, HUB_RADIUS, HUB_DEPTH, COLUMN_LENGTH, COLUMN_RADIUS, GRIP_ANGLE } =
  COCKPIT.STEERING;
const RADIAL_SEGMENTS = 6;
const TUBULAR_SEGMENTS = 18;
const CYLINDER_SEGMENTS = 8;
const HALF_PI = Math.PI / 2;
/** Spokes at 9, 3 and 6 o'clock as seen by the driver. */
const SPOKE_ANGLES = [0, Math.PI, -HALF_PI] as const;
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

/** Grip points on the rim in wheel-local space, left hand on +x (driver's left). */
const GRIPS = [
  new Vector3(RADIUS * Math.cos(GRIP_ANGLE), RADIUS * Math.sin(GRIP_ANGLE), 0),
  new Vector3(-RADIUS * Math.cos(GRIP_ANGLE), RADIUS * Math.sin(GRIP_ANGLE), 0),
] as const;
const ELBOWS = [new Vector3(...COCKPIT.HANDS.ELBOW_LEFT), new Vector3(...COCKPIT.HANDS.ELBOW_RIGHT)] as const;

interface SteeringWheelProps {
  session: GameSession;
}

/**
 * Steering wheel that turns with the smoothed steering input, with gloved hands
 * locked to the rim and forearms re-aimed each frame toward the elbows.
 * @param props - Game session.
 * @returns Wheel, hands and forearms.
 */
export function SteeringWheel({ session }: SteeringWheelProps) {
  const spinRef = useRef<Group>(null);
  const forearmRefs = useRef<Array<Mesh | null>>([null, null]);
  const scratch = useRef({
    tilt: new Quaternion().setFromEuler(new Euler(TILT, 0, 0)),
    spin: new Quaternion(),
    hand: new Vector3(),
    direction: new Vector3(),
    center: new Vector3(...CENTER),
  });

  useFrame(() => {
    const rotation = session.vehicle.steer * STEERING.WHEEL_VISUAL_ROTATION;
    if (spinRef.current) spinRef.current.rotation.z = rotation;

    // Hand positions are derived analytically so forearms don't depend on matrix update order.
    const { tilt, spin, hand, direction, center } = scratch.current;
    spin.setFromAxisAngle(Z_AXIS, rotation);
    GRIPS.forEach((grip, i) => {
      const forearm = forearmRefs.current[i];
      if (!forearm) return;
      hand.copy(grip).applyQuaternion(spin).applyQuaternion(tilt).add(center);
      direction.copy(hand).sub(ELBOWS[i]);
      const length = direction.length();
      forearm.position.copy(ELBOWS[i]).addScaledVector(direction, 0.5);
      forearm.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
      forearm.scale.set(1, length, 1);
    });
  }, FRAME_PRIORITY.CAMERA);

  return (
    <group name="steering">
      <group position={[...CENTER]} rotation={[TILT, 0, 0]}>
        <mesh position={[0, 0, COLUMN_LENGTH / 2]} rotation={[HALF_PI, 0, 0]}>
          <cylinderGeometry args={[COLUMN_RADIUS, COLUMN_RADIUS, COLUMN_LENGTH, CYLINDER_SEGMENTS]} />
          <meshStandardMaterial color={PALETTE.steeringWheel} flatShading />
        </mesh>
        <group ref={spinRef}>
          <mesh castShadow>
            <torusGeometry args={[RADIUS, TUBE, RADIAL_SEGMENTS, TUBULAR_SEGMENTS]} />
            <meshStandardMaterial color={PALETTE.steeringWheel} flatShading />
          </mesh>
          {SPOKE_ANGLES.map((angle) => (
            <group key={angle} rotation={[0, 0, angle]}>
              <mesh position={[RADIUS / 2, 0, 0]}>
                <boxGeometry args={[RADIUS, SPOKE_WIDTH, SPOKE_WIDTH / 2]} />
                <meshStandardMaterial color={PALETTE.steeringWheel} flatShading />
              </mesh>
            </group>
          ))}
          <mesh rotation={[HALF_PI, 0, 0]}>
            <cylinderGeometry args={[HUB_RADIUS, HUB_RADIUS, HUB_DEPTH, CYLINDER_SEGMENTS]} />
            <meshStandardMaterial color={PALETTE.steeringHub} flatShading />
          </mesh>
          {GRIPS.map((grip, i) => (
            <mesh key={i} position={grip} castShadow>
              <boxGeometry args={[...COCKPIT.HANDS.GLOVE_SIZE]} />
              <meshStandardMaterial color={PALETTE.glove} flatShading />
            </mesh>
          ))}
        </group>
      </group>
      {ELBOWS.map((_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            forearmRefs.current[i] = mesh;
          }}
          castShadow
        >
          <cylinderGeometry
            args={[COCKPIT.HANDS.FOREARM_RADIUS, COCKPIT.HANDS.ELBOW_RADIUS, 1, CYLINDER_SEGMENTS]}
          />
          <meshStandardMaterial color={PALETTE.sleeve} flatShading />
        </mesh>
      ))}
    </group>
  );
}
