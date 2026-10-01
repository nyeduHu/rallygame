// lib/game/three/models.ts
import { Box3, BufferGeometry, Material, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from "three";
import type { PropPlacement } from "../stage/types";

/** One drawable piece of a model with transforms baked into the geometry. */
export interface ModelPart {
  geometry: BufferGeometry;
  material: Material;
}

/** How to normalise a model's size; all modes also centre XZ and put the base at y = 0. */
export type ModelFit =
  | { kind: "height"; height: number }
  | { kind: "maxExtent"; extent: number }
  | { kind: "box"; size: readonly [number, number, number] };

/** Kenney materials ship partly metallic, which reads dark without an env map. */
const MATTE_ROUGHNESS = 0.9;

/**
 * Makes a material matte so props match the flat low-poly look.
 * @param material - Source material.
 * @returns Adjusted clone (or the original if not a standard material).
 */
function matte(material: Material): Material {
  if (!(material instanceof MeshStandardMaterial)) return material;
  const clone = material.clone();
  clone.metalness = 0;
  clone.roughness = MATTE_ROUGHNESS;
  return clone;
}

/**
 * Bakes a loaded GLTF scene into geometry parts normalised to a known size.
 * Kenney packs use different unit scales and odd root offsets, so normalising
 * here lets gameplay constants define real-world sizes directly.
 * @param root - Loaded scene.
 * @param fit - Normalisation mode.
 * @returns Baked parts.
 */
export function extractModelParts(root: Object3D, fit: ModelFit): ModelPart[] {
  root.updateMatrixWorld(true);
  const parts: ModelPart[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const geometry = (object.geometry as BufferGeometry).clone();
    geometry.applyMatrix4(object.matrixWorld);
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    parts.push({ geometry, material: matte(materials[0]) });
  });

  const bounds = new Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    if (part.geometry.boundingBox) bounds.union(part.geometry.boundingBox);
  }
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const scale = new Vector3(1, 1, 1);
  if (fit.kind === "height") scale.setScalar(fit.height / size.y);
  if (fit.kind === "maxExtent") scale.setScalar(fit.extent / Math.max(size.x, size.y, size.z));
  if (fit.kind === "box") scale.set(fit.size[0] / size.x, fit.size[1] / size.y, fit.size[2] / size.z);

  const normalise = new Matrix4()
    .makeScale(scale.x, scale.y, scale.z)
    .multiply(new Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
  for (const part of parts) {
    part.geometry.applyMatrix4(normalise);
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  }
  return parts;
}

const Y_AXIS = new Vector3(0, 1, 0);

/**
 * Builds an instance matrix for a placement.
 * @param placement - Prop placement.
 * @param yawOffset - Extra yaw for models whose long axis differs from the road axis.
 * @param target - Output matrix.
 * @returns The target matrix.
 */
export function placementMatrix(placement: PropPlacement, yawOffset: number, target: Matrix4): Matrix4 {
  const quaternion = new Quaternion().setFromAxisAngle(Y_AXIS, placement.yaw + yawOffset);
  return target.compose(
    new Vector3(placement.x, placement.y, placement.z),
    quaternion,
    new Vector3(placement.scale, placement.scale, placement.scale),
  );
}
