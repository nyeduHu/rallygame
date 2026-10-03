// components/game/interaction/InteractionDriver.tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import type { MouseLook } from "@/lib/game/input/mouseLook";
import type { Role } from "@/lib/game/roles";
import { useGameStore } from "@/lib/game/store";
import { INTERACTION } from "@/lib/game/constants";
import { InteractionSystem, promptFor } from "@/lib/game/interaction/interactionSystem";

const InteractionContext = createContext<InteractionSystem | null>(null);

interface InteractionDriverProps {
  system: InteractionSystem;
  mouseLook: MouseLook;
  role: Role;
  solo: boolean;
  children: ReactNode;
}

/**
 * Hosts the shared interaction registry, pointer-lock inputs and post-camera raycast.
 * @param props - Shared scene system, active seat and rendered scene subtree.
 * @returns Context provider containing the physical scene and interaction updates.
 */
export function InteractionDriver({ system, mouseLook, role, solo, children }: InteractionDriverProps) {
  const camera = useThree((state) => state.camera);
  const publishElapsed = useRef(0);
  const publishedLabel = useRef<string | null>(null);
  const publishedHit = useRef(false);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0 || !useGameStore.getState().pointerLocked) return;
      system.press("mouse", mouseLook);
    };
    const onMouseUp = (event: MouseEvent): void => {
      if (event.button === 0) system.release("mouse", mouseLook);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== "KeyE" || event.repeat || !useGameStore.getState().pointerLocked) return;
      system.press("keyboard", mouseLook);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === "KeyE") system.release("keyboard", mouseLook);
    };
    const onBlur = (): void => system.releaseAll(mouseLook);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      system.releaseAll(mouseLook);
    };
  }, [mouseLook, system]);

  useFrame((_, delta) => {
    const activeRole = solo ? useGameStore.getState().soloActiveRole : role;
    system.update(camera, activeRole, delta, mouseLook);
    publishElapsed.current += delta;
    if (publishElapsed.current < 1 / INTERACTION.HOVER_PUBLISH_HZ) return;
    publishElapsed.current %= 1 / INTERACTION.HOVER_PUBLISH_HZ;

    const hoveredLabel = system.hovered ? promptFor(system.hovered) : null;
    if (hoveredLabel !== publishedLabel.current) {
      publishedLabel.current = hoveredLabel;
      useGameStore.getState().setHoveredLabel(hoveredLabel);
    }
    if (system.hasHitPoint) {
      useGameStore.getState().setInteractionHitPoint(system.hitPoint);
      publishedHit.current = true;
    } else if (publishedHit.current) {
      publishedHit.current = false;
      useGameStore.getState().setInteractionHitPoint(null);
    }
  }, 0);

  return <InteractionContext.Provider value={system}>{children}</InteractionContext.Provider>;
}

/**
 * Reads the scene interaction registry from an Interactable wrapper.
 * @returns Current shared registry.
 * @throws Error when rendered outside InteractionDriver.
 */
export function useInteractionSystem(): InteractionSystem {
  const system = useContext(InteractionContext);
  if (!system) throw new Error("Interactable must be rendered within InteractionDriver");
  return system;
}
