// components/game/car/PassengerSide.tsx
"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { INTERACTION } from "@/lib/game/constants";
import { PALETTE } from "@/lib/game/palette";
import type { SessionView } from "@/lib/game/sessionView";
import type { Role } from "@/lib/game/roles";
import { useGameStore } from "@/lib/game/store";
import { beamTransform } from "./Beam";
import { Tablet } from "./Tablet";
import { WiperSwitch } from "./WiperSwitch";

type Vec3 = readonly [number, number, number];

interface PassengerSideProps {
  session: SessionView;
  activeRole: Role;
}

const CYLINDER_SEGMENTS = 8;
const { PASSENGER_DASH_PAD, PASSENGER_GLOVEBOX, PASSENGER_TABLET_LAP } = COCKPIT;

interface BoxPartProps {
  position: Vec3;
  size: Vec3;
  color: string;
}

/**
 * Renders a low-poly cockpit box using the shared interior material finish.
 * @param props - Position, dimensions, and palette color.
 * @returns A flat-shaded box mesh.
 */
function BoxPart({ position, size, color }: BoxPartProps) {
  return (
    <mesh position={[...position]} receiveShadow>
      <boxGeometry args={[...size]} />
      <meshStandardMaterial color={color} flatShading roughness={COCKPIT.MATERIAL.PANEL_ROUGHNESS} />
    </mesh>
  );
}

interface RestingHandProps {
  elbow: Vec3;
  rest: Vec3;
  active?: boolean;
}

/**
 * Draws one static forearm and glove in the co-driver's lap-resting pose.
 * @param props - Endpoints for the sleeve and glove position.
 * @returns Forearm and glove meshes.
 */
function RestingHand({ elbow, rest, active = false }: RestingHandProps) {
  const transform = useMemo(() => beamTransform(elbow, rest), [elbow, rest]);
  const handRef = useRef<Group>(null);
  const target = useMemo(() => new Vector3(), []);
  const restPosition = useMemo(() => new Vector3(...rest), [rest]);

  useFrame((_, delta) => {
    if (!active || !handRef.current) return;
    const hitPoint = useGameStore.getState().interactionHitPoint;
    if (hitPoint) {
      target.copy(hitPoint);
      handRef.current.parent?.updateWorldMatrix(true, false);
      handRef.current.parent?.worldToLocal(target);
    } else {
      target.copy(restPosition);
    }
    handRef.current.position.lerp(target, 1 - Math.exp(-INTERACTION.HAND_DAMPING * delta));
  });

  return (
    <group>
      <mesh position={transform.position} quaternion={transform.quaternion} castShadow>
        <cylinderGeometry
          args={[COCKPIT.HANDS.FOREARM_RADIUS, COCKPIT.HANDS.ELBOW_RADIUS, transform.length, CYLINDER_SEGMENTS]}
        />
        <meshStandardMaterial color={PALETTE.sleeve} flatShading />
      </mesh>
      <group ref={handRef} position={[...rest]}>
        <mesh castShadow>
          <boxGeometry args={[...COCKPIT.HANDS.GLOVE_SIZE]} />
          <meshStandardMaterial color={PALETTE.glove} flatShading />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Passenger-side dash details, tablet mount, and static hands resting on the lap.
 * Hand movement is intentionally left for the later interaction-system step.
 * @returns The co-driver's cockpit side in car-local space.
 */
export function PassengerSide({ session, activeRole }: PassengerSideProps) {
  return (
    <group name="passenger-side">
      <BoxPart position={PASSENGER_DASH_PAD.POSITION} size={PASSENGER_DASH_PAD.SIZE} color={PALETTE.interiorLight} />
      <BoxPart position={PASSENGER_GLOVEBOX.POSITION} size={PASSENGER_GLOVEBOX.SIZE} color={PALETTE.interior} />
      <BoxPart
        position={PASSENGER_GLOVEBOX.LATCH_POSITION}
        size={PASSENGER_GLOVEBOX.LATCH_SIZE}
        color={PALETTE.lever}
      />

      <WiperSwitch />

      <group
        name="passenger-tablet-lap"
        visible={activeRole === "codriver"}
        position={[...PASSENGER_TABLET_LAP.POSITION]}
        rotation={[PASSENGER_TABLET_LAP.TILT, 0, 0]}
        scale={PASSENGER_TABLET_LAP.SCALE}
      >
        <Tablet session={session} activeRole={activeRole} />
      </group>

      <RestingHand elbow={COCKPIT.PASSENGER_HANDS.ELBOW.LEFT} rest={COCKPIT.PASSENGER_HANDS.REST.LEFT} />
      <RestingHand elbow={COCKPIT.PASSENGER_HANDS.ELBOW.RIGHT} rest={COCKPIT.PASSENGER_HANDS.REST.RIGHT} active />
    </group>
  );
}
