// components/game/onfoot/HeldItems.tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { WRENCH } from "@/lib/game/constants";
import { PALETTE } from "@/lib/game/palette";
import type { Role } from "@/lib/game/roles";
import { useGameStore } from "@/lib/game/store";
import { Wrench } from "../repair/Wrench";
import { FRAME_PRIORITY } from "../scene/framePriority";

/** @returns True while the repair has the wrench out of the toolbox. */
export function useHoldingWrench(): boolean {
  return useGameStore((state) => state.repair.kind === "tool_in_hand" || state.repair.kind === "part_removed");
}

interface HeldItemsProps {
  role: Role;
  solo: boolean;
}

/**
 * The local player's gloved right hand in first person while they are out of the car, holding the
 * wrench from the moment they take it until the new part is fitted.
 * @param props - Local role and solo flag.
 * @returns Hand group that follows the camera, or nothing while seated.
 */
export function HeldItems({ role, solo }: HeldItemsProps) {
  const camera = useThree((state) => state.camera);
  const ref = useRef<Group>(null);
  const footRole = useGameStore((state) => state.footRole);
  const soloRole = useGameStore((state) => state.soloActiveRole);
  const holding = useHoldingWrench();
  const mine = footRole !== null && footRole === (solo ? soloRole : role);

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);
  }, FRAME_PRIORITY.CAMERA + 1);

  return (
    <group ref={ref} name="held-items" visible={mine}>
      <group position={[...WRENCH.HAND_OFFSET]} rotation={[...WRENCH.HAND_TILT]}>
        <mesh position={[...WRENCH.FOREARM_OFFSET]}>
          <boxGeometry args={[...WRENCH.FOREARM_SIZE]} />
          <meshStandardMaterial color={PALETTE.sleeve} flatShading />
        </mesh>
        <mesh>
          <sphereGeometry args={[WRENCH.GLOVE_RADIUS, 8, 6]} />
          <meshStandardMaterial color={PALETTE.glove} flatShading />
        </mesh>
        <group position={[...WRENCH.IN_HAND_OFFSET]} visible={holding}>
          <Wrench />
        </group>
      </group>
    </group>
  );
}
