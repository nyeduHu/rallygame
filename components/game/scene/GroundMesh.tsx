// components/game/scene/GroundMesh.tsx
"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import type { MeshData } from "@/lib/game/stage/meshData";

interface GroundMeshProps {
  mesh: MeshData;
  /** Accessible name for scene debugging tools. */
  name: string;
}

/**
 * Renders engine-agnostic mesh data (terrain or road) with flat-shaded vertex
 * colours for the low-poly look. The same arrays back the physics collider.
 * @param props - Mesh data and name.
 * @returns A shadow-receiving mesh.
 */
export function GroundMesh({ mesh, name }: GroundMeshProps) {
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    result.setAttribute("color", new BufferAttribute(mesh.colors, 3));
    result.setIndex(new BufferAttribute(mesh.indices, 1));
    result.computeVertexNormals();
    result.computeBoundingSphere();
    return result;
  }, [mesh]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh name={name} geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={1} metalness={0} />
    </mesh>
  );
}
