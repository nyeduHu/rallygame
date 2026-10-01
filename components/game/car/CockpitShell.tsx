// components/game/car/CockpitShell.tsx
"use client";

import { useMemo } from "react";
import { DoubleSide } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { RENDER } from "@/lib/game/constants";
import { PALETTE } from "@/lib/game/palette";
import { Beam, beamTransform } from "./Beam";

type Vec3 = readonly [number, number, number];

interface BoxPartProps {
  position: Vec3;
  size: Vec3;
  color: string;
  rotation?: Vec3;
  castShadow?: boolean;
}

/**
 * Flat-shaded box used for most interior panels.
 * @param props - Transform, size and colour.
 * @returns Mesh.
 */
function BoxPart({ position, size, color, rotation = [0, 0, 0], castShadow = false }: BoxPartProps) {
  return (
    <mesh position={[...position]} rotation={[...rotation]} castShadow={castShadow} receiveShadow>
      <boxGeometry args={[...size]} />
      <meshStandardMaterial color={color} flatShading roughness={COCKPIT.MATERIAL.PANEL_ROUGHNESS} />
    </mesh>
  );
}

/**
 * Tinted windshield glass stretched between dashboard and roof.
 * @returns Transparent plane.
 */
function Windshield() {
  const { BASE, TOP, WIDTH } = COCKPIT.WINDSHIELD;
  const { position, quaternion, length } = useMemo(() => beamTransform(BASE, TOP), [BASE, TOP]);
  return (
    <mesh position={position} quaternion={quaternion} renderOrder={1}>
      <planeGeometry args={[WIDTH, length]} />
      <meshStandardMaterial
        color={PALETTE.glass}
        transparent
        opacity={RENDER.GLASS_OPACITY}
        side={DoubleSide}
        depthWrite={false}
        roughness={COCKPIT.MATERIAL.GLASS_ROUGHNESS}
      />
    </mesh>
  );
}

interface SeatProps {
  x: number;
}

/**
 * Low-poly bucket seat with a racing stripe.
 * @param props - Lateral position.
 * @returns Seat group.
 */
function Seat({ x }: SeatProps) {
  const { BASE_SIZE, BACK_SIZE, BASE_Y, BASE_Z, BACK_Z, BACK_TILT, STRIPE_WIDTH, STRIPE_DEPTH } = COCKPIT.SEAT;
  const backY = BASE_Y + BACK_SIZE[1] / 2;
  const stripeDepthOffset = BACK_SIZE[2] / 2;
  return (
    <group position={[x, 0, 0]}>
      <BoxPart position={[0, BASE_Y, BASE_Z]} size={BASE_SIZE} color={PALETTE.seat} />
      <group position={[0, backY, BACK_Z]} rotation={[BACK_TILT, 0, 0]}>
        <BoxPart position={[0, 0, 0]} size={BACK_SIZE} color={PALETTE.seat} />
        <BoxPart
          position={[0, 0, stripeDepthOffset]}
          size={[STRIPE_WIDTH, BACK_SIZE[1], STRIPE_DEPTH]}
          color={PALETTE.seatStripe}
        />
      </group>
    </group>
  );
}

/**
 * Static interior and body shell visible from the driver's seat: pillars, roof,
 * doors, dashboard, hood, seats and mirror.
 * @returns Cockpit shell group.
 */
export function CockpitShell() {
  const { A_PILLAR_X, PILLAR_THICKNESS, BODY_HALF_WIDTH, BELTLINE_Y, ROOF_Y, WINDSHIELD, B_PILLAR, DOOR } = COCKPIT;
  const pillarBase = WINDSHIELD.BASE[2];
  const pillarTop = WINDSHIELD.TOP[2];

  return (
    <group name="cockpit-shell">
      <Windshield />
      {[1, -1].map((side) => (
        <group key={side}>
          <Beam
            from={[A_PILLAR_X * side, BELTLINE_Y, pillarBase]}
            to={[A_PILLAR_X * side, ROOF_Y, pillarTop]}
            thickness={PILLAR_THICKNESS}
            color={PALETTE.carBodyDark}
          />
          <Beam
            from={[B_PILLAR.BOTTOM[0] * side, B_PILLAR.BOTTOM[1], B_PILLAR.BOTTOM[2]]}
            to={[B_PILLAR.TOP[0] * side, B_PILLAR.TOP[1], B_PILLAR.TOP[2]]}
            thickness={PILLAR_THICKNESS}
            color={PALETTE.interiorLight}
          />
          <BoxPart
            position={[BODY_HALF_WIDTH * side, DOOR.CENTER_Y, DOOR.CENTER_Z]}
            size={[DOOR.THICKNESS, DOOR.HEIGHT, DOOR.LENGTH]}
            color={PALETTE.interiorLight}
          />
        </group>
      ))}
      <Beam
        from={[A_PILLAR_X, ROOF_Y, pillarTop]}
        to={[-A_PILLAR_X, ROOF_Y, pillarTop]}
        thickness={PILLAR_THICKNESS}
        color={PALETTE.carBodyDark}
      />
      <BoxPart position={COCKPIT.ROOF.POSITION} size={COCKPIT.ROOF.SIZE} color={PALETTE.interior} castShadow />
      <BoxPart position={COCKPIT.FLOOR.POSITION} size={COCKPIT.FLOOR.SIZE} color={PALETTE.interior} />
      <BoxPart position={COCKPIT.DASHBOARD.POSITION} size={COCKPIT.DASHBOARD.SIZE} color={PALETTE.dashboard} />
      <BoxPart position={COCKPIT.BINNACLE.POSITION} size={COCKPIT.BINNACLE.SIZE} color={PALETTE.dashboard} />
      <BoxPart position={COCKPIT.CONSOLE.POSITION} size={COCKPIT.CONSOLE.SIZE} color={PALETTE.dashboard} />
      <BoxPart
        position={COCKPIT.HOOD.POSITION}
        size={COCKPIT.HOOD.SIZE}
        rotation={[COCKPIT.HOOD.SLOPE, 0, 0]}
        color={PALETTE.carBody}
      />
      <BoxPart position={COCKPIT.MIRROR.POSITION} size={COCKPIT.MIRROR.SIZE} color={PALETTE.interior} />
      <Seat x={COCKPIT.DRIVER_X} />
      <Seat x={COCKPIT.PASSENGER_X} />
    </group>
  );
}
