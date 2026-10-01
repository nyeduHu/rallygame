// components/game/scene/Cones.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import { MODEL_PATHS } from "@/lib/game/assets";
import { PROPS } from "@/lib/game/constants";
import type { GameSession } from "@/lib/game/session";
import type { ModelFit, ModelPart } from "@/lib/game/three/models";
import { useModelParts } from "./useModelParts";

const CONE_FIT: ModelFit = { kind: "height", height: PROPS.CONE_HEIGHT };
const UNIT_SCALE = new Vector3(1, 1, 1);

interface ConesProps {
  session: GameSession;
}

interface ConePartProps {
  part: ModelPart;
  session: GameSession;
}

/**
 * One instanced part whose matrices follow the dynamic cone bodies each frame.
 * @param props - Model part and session.
 * @returns Instanced mesh.
 */
function ConePart({ part, session }: ConePartProps) {
  const ref = useRef<InstancedMesh>(null);
  const scratch = useRef({ matrix: new Matrix4(), position: new Vector3(), quaternion: new Quaternion() });

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const { matrix, position, quaternion } = scratch.current;
    session.physics.coneBodies.forEach((body, i) => {
      const t = body.translation();
      const r = body.rotation();
      position.set(t.x, t.y, t.z);
      quaternion.set(r.x, r.y, r.z, r.w);
      mesh.setMatrixAt(i, matrix.compose(position, quaternion, UNIT_SCALE));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, session.physics.coneBodies.length]}
      castShadow
      receiveShadow
    />
  );
}

/**
 * Knock-over cones at hairpin apexes, driven by Rapier dynamic bodies.
 * @param props - Game session.
 * @returns Cones, or nothing when the stage has no hairpins.
 */
export function Cones({ session }: ConesProps) {
  const parts = useModelParts(MODEL_PATHS.cone, CONE_FIT);
  if (session.physics.coneBodies.length === 0) return null;
  return (
    <group name="cones">
      {parts.map((part, i) => (
        <ConePart key={i} part={part} session={session} />
      ))}
    </group>
  );
}
