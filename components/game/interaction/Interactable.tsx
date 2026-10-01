// components/game/interaction/Interactable.tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Group, type Object3D } from "three";
import type { InteractableSpec } from "@/lib/game/interaction/interactionSystem";
import { useInteractionSystem } from "./InteractionDriver";

interface InteractableProps {
  spec: InteractableSpec;
  children: ReactNode;
}

/**
 * Registers a group of physical meshes for centre-camera interaction raycasts.
 * @param props - Interaction behavior and child scene objects.
 * @returns A group whose descendants are included in the world raycast.
 */
export function Interactable({ spec, children }: InteractableProps) {
  const system = useInteractionSystem();
  const groupRef = useRef<Group>(null);
  const objectsRef = useRef<Object3D[]>([]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const objects = objectsRef.current;
    objects[0] = group;
    const registeredSpec: InteractableSpec = {
      ...spec,
      getObjects: () => objects,
    };
    system.register(registeredSpec);
    return () => {
      system.unregister(spec.id);
      objects.length = 0;
    };
  }, [spec, system]);

  return <group ref={groupRef}>{children}</group>;
}
