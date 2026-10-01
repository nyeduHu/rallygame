// components/game/repair/EngineBay.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { REPAIR } from "@/lib/game/constants";
import type { InteractableSpec } from "@/lib/game/interaction/interactionSystem";
import { damp } from "@/lib/game/math";
import { PALETTE } from "@/lib/game/palette";
import { useGameStore } from "@/lib/game/store";
import { Interactable } from "../interaction/Interactable";
import { submitRepairStep } from "./submitRepairStep";
import { EngineSmoke } from "./EngineSmoke";
import { RepairParts } from "./RepairParts";

const { HOOD_HINGE, HOOD_SIZE, LATCH_POSITION, LATCH_SIZE, BLOCK_POSITION, BLOCK_SIZE } = COCKPIT.ENGINE_BAY;
const HOOD_PANEL_OFFSET_Z = HOOD_SIZE[2] / 2;

/**
 * Builds the hood-latch interaction: holding it long enough toggles the hood once per press.
 * @returns Interactable spec.
 */
function createLatchSpec(): InteractableSpec {
  let fired = false;
  return {
    id: "hood-latch",
    kind: "hold",
    roles: ["driver"],
    isEnabled: () => useGameStore.getState().footRole === "driver",
    label: "Hood latch (hold)",
    getObjects: () => [],
    onPress: () => {
      fired = false;
    },
    onHold: (seconds) => {
      if (fired || seconds < REPAIR.HOOD_HOLD_S) return;
      fired = true;
      const store = useGameStore.getState();
      submitRepairStep({ step: store.hoodOpen ? "CLOSE_HOOD" : "OPEN_HOOD" });
    },
  };
}

/**
 * Hood on a hinge with a front latch (hold the interact key), plus the engine and its parts
 * underneath. The hood angle follows the shared `hoodOpen` flag (server-owned online).
 * @returns Hood, latch and engine group in car-local space.
 */
export function EngineBay() {
  const hoodRef = useRef<Group>(null);
  const hoodOpen = useGameStore((state) => state.hoodOpen);

  const latch = useMemo(() => createLatchSpec(), []);

  useFrame((_, delta) => {
    const hood = hoodRef.current;
    if (!hood) return;
    const target = useGameStore.getState().hoodOpen ? -REPAIR.HOOD_OPEN_ANGLE : 0;
    hood.rotation.x = damp(hood.rotation.x, target, REPAIR.HOOD_DAMPING, delta);
  });

  return (
    <group name="engine-bay">
      {/* The car model supplies the closed hood; our slab and the engine only appear while open. */}
      <group ref={hoodRef} position={[...HOOD_HINGE]} visible={hoodOpen}>
        <mesh position={[0, 0, HOOD_PANEL_OFFSET_Z]} castShadow>
          <boxGeometry args={[...HOOD_SIZE]} />
          <meshStandardMaterial color={COCKPIT.ENGINE_BAY.HOOD_COLOR} flatShading />
        </mesh>
      </group>
      <Interactable spec={latch}>
        <mesh position={[...LATCH_POSITION]}>
          <boxGeometry args={[...LATCH_SIZE]} />
          <meshStandardMaterial color={PALETTE.lever} flatShading />
        </mesh>
      </Interactable>
      <group visible={hoodOpen}>
        <mesh position={[...BLOCK_POSITION]} receiveShadow>
          <boxGeometry args={[...BLOCK_SIZE]} />
          <meshStandardMaterial color={PALETTE.interiorLight} flatShading />
        </mesh>
      </group>
      <RepairParts />
      <EngineSmoke />
    </group>
  );
}
