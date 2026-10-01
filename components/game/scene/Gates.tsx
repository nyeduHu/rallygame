// components/game/scene/Gates.tsx
"use client";

import { useMemo } from "react";
import { MeshStandardMaterial } from "three";
import { MODEL_PATHS } from "@/lib/game/assets";
import { GATES, ROAD } from "@/lib/game/constants";
import { gateHalfWidth } from "@/lib/game/stage/props";
import { leftVector, poseAt } from "@/lib/game/stage/roadIndex";
import type { RoadPose, StageData } from "@/lib/game/stage/types";
import type { ModelFit, ModelPart } from "@/lib/game/three/models";
import { useModelParts } from "./useModelParts";

const GANTRY_FIT: ModelFit = { kind: "box", size: [gateHalfWidth() * 2, GATES.HEIGHT, GATES.DEPTH] };
const FLAG_FIT: ModelFit = { kind: "height", height: GATES.FLAG_HEIGHT };
const TOWER_FIT: ModelFit = { kind: "height", height: GATES.TOWER_HEIGHT };

type GateKind = "start" | "checkpoint" | "finish";

interface StaticModelProps {
  parts: ModelPart[];
  position: readonly [number, number, number];
  yaw: number;
}

/**
 * Renders a single, non-instanced normalised model.
 * @param props - Parts and transform.
 * @returns Group of meshes.
 */
function StaticModel({ parts, position, yaw }: StaticModelProps) {
  // Gates ignore fog so they stay visible from GATES.VISIBLE_DISTANCE_M away.
  const materials = useMemo(
    () =>
      parts.map((part) => {
        const material = part.material.clone();
        if (material instanceof MeshStandardMaterial) material.fog = false;
        return material;
      }),
    [parts],
  );
  return (
    <group position={[position[0], position[1], position[2]]} rotation={[0, yaw, 0]}>
      {parts.map((part, i) => (
        <mesh key={i} geometry={part.geometry} material={materials[i]} castShadow receiveShadow />
      ))}
    </group>
  );
}

interface GateProps {
  kind: GateKind;
  pose: RoadPose;
}

/**
 * A gantry across the road plus side dressing: start gets light gantry and banner
 * towers, finish gets checkered flags, checkpoints are a plain gantry.
 * @param props - Gate kind and road pose.
 * @returns Gate group.
 */
function Gate({ kind, pose }: GateProps) {
  const gantry = useModelParts(MODEL_PATHS.overhead, GANTRY_FIT);
  const lightGantry = useModelParts(MODEL_PATHS.overheadLights, GANTRY_FIT);
  const flag = useModelParts(MODEL_PATHS.flagCheckers, FLAG_FIT);
  const tower = useModelParts(MODEL_PATHS.bannerTower, TOWER_FIT);
  const [lx, lz] = leftVector(pose.heading);
  // Gantry legs stand in the roadside ditch, below road level.
  const groundY = pose.y - ROAD.SHOULDER_DROP;

  /**
   * @param offset - Signed lateral offset from the centreline.
   * @returns World position beside the road.
   */
  const beside = (offset: number): readonly [number, number, number] => [
    pose.x + lx * offset,
    groundY,
    pose.z + lz * offset,
  ];

  const sideParts = kind === "finish" ? flag : kind === "start" ? tower : null;
  const sideOffset =
    kind === "finish" ? gateHalfWidth() + GATES.FLAG_SIDE_OFFSET : ROAD.WIDTH / 2 + GATES.TOWER_OFFSET;

  return (
    <group name={`gate-${kind}`}>
      <StaticModel parts={kind === "start" ? lightGantry : gantry} position={[pose.x, groundY, pose.z]} yaw={pose.heading} />
      {sideParts && (
        <>
          <StaticModel parts={sideParts} position={beside(sideOffset)} yaw={pose.heading} />
          <StaticModel parts={sideParts} position={beside(-sideOffset)} yaw={pose.heading + Math.PI} />
        </>
      )}
    </group>
  );
}

interface GatesProps {
  stage: StageData;
}

/**
 * Start, checkpoint and finish gantries along the stage.
 * @param props - Stage data.
 * @returns All gates.
 */
export function Gates({ stage }: GatesProps) {
  const gates = useMemo(
    () => [
      { kind: "start" as const, pose: poseAt(stage.samples, stage.startS) },
      ...stage.checkpointS.map((s) => ({ kind: "checkpoint" as const, pose: poseAt(stage.samples, s) })),
      { kind: "finish" as const, pose: poseAt(stage.samples, stage.finishS) },
    ],
    [stage],
  );
  return (
    <group name="gates">
      {gates.map((gate, i) => (
        <Gate key={i} kind={gate.kind} pose={gate.pose} />
      ))}
    </group>
  );
}
