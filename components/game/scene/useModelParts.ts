// components/game/scene/useModelParts.ts
"use client";

import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { extractModelParts, type ModelFit, type ModelPart } from "@/lib/game/three/models";

/**
 * Loads a GLB (suspending until ready) and returns size-normalised parts.
 * Pass a module-level fit object so the memo stays stable.
 * @param path - Public URL of the GLB.
 * @param fit - Normalisation mode.
 * @returns Baked model parts.
 */
export function useModelParts(path: string, fit: ModelFit): ModelPart[] {
  const { scene } = useGLTF(path);
  return useMemo(() => extractModelParts(scene, fit), [scene, fit]);
}

/**
 * Loads several GLBs with the same fit, e.g. all tree variants.
 * @param paths - GLB URLs (stable, module-level arrays).
 * @param fit - Normalisation mode (module-level constant).
 * @returns Parts per path, index-aligned.
 */
export function useModelVariants(paths: ReadonlyArray<string>, fit: ModelFit): ModelPart[][] {
  const gltfs = useGLTF([...paths]);
  return useMemo(() => gltfs.map((gltf) => extractModelParts(gltf.scene, fit)), [gltfs, fit]);
}
