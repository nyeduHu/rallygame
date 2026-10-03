// components/game/repair/Wrench.tsx
"use client";

import { WRENCH } from "@/lib/game/constants";

/**
 * Low-poly open-end wrench lying along local z: a flat handle with a hexagonal ring at the
 * far end.
 * @returns Wrench meshes.
 */
export function Wrench() {
  const [width, height, length] = WRENCH.HANDLE_SIZE;
  return (
    <group name="wrench">
      <mesh castShadow>
        <boxGeometry args={[width, height, length]} />
        <meshStandardMaterial color={WRENCH.COLOR} flatShading metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, -length / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[WRENCH.HEAD_RADIUS, WRENCH.HEAD_TUBE, 5, WRENCH.HEAD_SEGMENTS]} />
        <meshStandardMaterial color={WRENCH.COLOR} flatShading metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}
