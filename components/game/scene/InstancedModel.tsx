// components/game/scene/InstancedModel.tsx
"use client";

import { useLayoutEffect, useRef } from "react";
import { Matrix4, type InstancedMesh } from "three";
import { placementMatrix, type ModelPart } from "@/lib/game/three/models";
import type { PropPlacement } from "@/lib/game/stage/types";

interface InstancedModelProps {
  parts: ModelPart[];
  placements: ReadonlyArray<PropPlacement>;
  yawOffset?: number;
  castShadow?: boolean;
}

interface InstancedPartProps {
  part: ModelPart;
  placements: ReadonlyArray<PropPlacement>;
  yawOffset: number;
  castShadow: boolean;
}

/**
 * One instanced draw call for one model part.
 * @param props - Part, placements and shadow flag.
 * @returns Instanced mesh.
 */
function InstancedPart({ part, placements, yawOffset, castShadow }: InstancedPartProps) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    placements.forEach((placement, i) => {
      mesh.setMatrixAt(i, placementMatrix(placement, yawOffset, matrix));
    });
    mesh.instanceMatrix.needsUpdate = true;
    // Instanced bounds must cover every instance or the whole batch gets culled.
    mesh.computeBoundingSphere();
  }, [placements, yawOffset]);

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, placements.length]}
      castShadow={castShadow}
      receiveShadow
    />
  );
}

/**
 * Draws many copies of a normalised model with one draw call per part, which is
 * what keeps thousands of trees at 60 fps.
 * @param props - Model parts and placements.
 * @returns Group of instanced meshes, or nothing when there are no placements.
 */
export function InstancedModel({ parts, placements, yawOffset = 0, castShadow = true }: InstancedModelProps) {
  if (placements.length === 0) return null;
  return (
    <group>
      {parts.map((part, i) => (
        <InstancedPart key={i} part={part} placements={placements} yawOffset={yawOffset} castShadow={castShadow} />
      ))}
    </group>
  );
}
