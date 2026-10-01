// components/game/pit/PitArea.tsx
"use client";

import { PALETTE } from "@/lib/game/palette";
import type { PitInfo } from "@/lib/game/stage/types";

const PAD_THICKNESS = 0.06;
const LINE_WIDTH = 0.18;
const LINE_HEIGHT = 0.02;
const GARAGE = { size: [6, 3.2, 10] as const, offsetAcross: 5.2 };
const PAD_COLOR = "#4a4d55";
const LINE_COLOR = "#f6f3ea";

interface PitAreaProps {
  pit: PitInfo;
}

/**
 * Pit pad with painted edges and a simple garage behind the pump side. Built from boxes: the
 * Kenney pit models are not part of the bundled asset set.
 * @param props - Pit placement.
 * @returns Pit scenery in world space.
 */
export function PitArea({ pit }: PitAreaProps) {
  const length = pit.halfLength * 2;
  const width = pit.halfWidth * 2;
  return (
    <group position={[pit.x, pit.y, pit.z]} rotation={[0, pit.heading, 0]} name="pit-area">
      <mesh position={[0, PAD_THICKNESS / 2 + 0.01, 0]} receiveShadow>
        <boxGeometry args={[width, PAD_THICKNESS, length]} />
        <meshStandardMaterial color={PAD_COLOR} flatShading />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (pit.halfWidth - LINE_WIDTH), PAD_THICKNESS + LINE_HEIGHT, 0]}>
          <boxGeometry args={[LINE_WIDTH, LINE_HEIGHT, length]} />
          <meshStandardMaterial color={LINE_COLOR} flatShading />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`end${side}`} position={[0, PAD_THICKNESS + LINE_HEIGHT, side * (pit.halfLength - LINE_WIDTH)]}>
          <boxGeometry args={[width, LINE_HEIGHT, LINE_WIDTH]} />
          <meshStandardMaterial color={LINE_COLOR} flatShading />
        </mesh>
      ))}
      <mesh position={[-(pit.halfWidth + GARAGE.offsetAcross), GARAGE.size[1] / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[...GARAGE.size]} />
        <meshStandardMaterial color={PALETTE.interiorLight} flatShading />
      </mesh>
    </group>
  );
}
