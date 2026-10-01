// components/game/scene/StageProps.tsx
"use client";

import { useMemo } from "react";
import { BARRIER_MODEL_PATHS, MODEL_PATHS, ROCK_MODEL_PATHS, TREE_MODEL_PATHS } from "@/lib/game/assets";
import { PROPS } from "@/lib/game/constants";
import { BARRIER_YAW_OFFSET } from "@/lib/game/stage/props";
import type { PropPlacement, StageData } from "@/lib/game/stage/types";
import type { ModelFit } from "@/lib/game/three/models";
import { InstancedModel } from "./InstancedModel";
import { useModelParts, useModelVariants } from "./useModelParts";

/** Unit-height trees and unit-extent rocks; placements carry the real size as scale. */
const UNIT_HEIGHT_FIT: ModelFit = { kind: "height", height: 1 };
const UNIT_EXTENT_FIT: ModelFit = { kind: "maxExtent", extent: 1 };
const BARRIER_FIT: ModelFit = {
  kind: "box",
  size: [PROPS.BARRIER_LENGTH, PROPS.BARRIER_HEIGHT, PROPS.BARRIER_DEPTH],
};

interface StagePropsProps {
  stage: StageData;
}

/**
 * Splits placements by variant so each model variant gets its own instanced batch.
 * @param placements - All placements.
 * @param variantCount - Number of variants.
 * @returns Placements grouped by variant index.
 */
function groupByVariant(placements: ReadonlyArray<PropPlacement>, variantCount: number): PropPlacement[][] {
  const groups = Array.from({ length: variantCount }, (): PropPlacement[] => []);
  for (const placement of placements) groups[placement.variant]?.push(placement);
  return groups;
}

/**
 * All static scenery: trees, rocks, grass tufts and corner barriers.
 * @param props - Stage data.
 * @returns Instanced scenery.
 */
export function StageProps({ stage }: StagePropsProps) {
  const treeModels = useModelVariants(TREE_MODEL_PATHS, UNIT_HEIGHT_FIT);
  const rockModels = useModelVariants(ROCK_MODEL_PATHS, UNIT_EXTENT_FIT);
  const barrierModels = useModelVariants(BARRIER_MODEL_PATHS, BARRIER_FIT);
  const grassModel = useModelParts(MODEL_PATHS.grass, UNIT_EXTENT_FIT);

  const trees = useMemo(() => groupByVariant(stage.trees, TREE_MODEL_PATHS.length), [stage.trees]);
  const rocks = useMemo(() => groupByVariant(stage.rocks, ROCK_MODEL_PATHS.length), [stage.rocks]);
  const barriers = useMemo(() => groupByVariant(stage.barriers, BARRIER_MODEL_PATHS.length), [stage.barriers]);

  return (
    <group name="stage-props">
      {treeModels.map((parts, i) => (
        <InstancedModel key={`tree-${i}`} parts={parts} placements={trees[i]} />
      ))}
      {rockModels.map((parts, i) => (
        <InstancedModel key={`rock-${i}`} parts={parts} placements={rocks[i]} />
      ))}
      {barrierModels.map((parts, i) => (
        <InstancedModel key={`barrier-${i}`} parts={parts} placements={barriers[i]} yawOffset={BARRIER_YAW_OFFSET} />
      ))}
      <InstancedModel parts={grassModel} placements={stage.grass} castShadow={false} />
    </group>
  );
}
