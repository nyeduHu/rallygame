// components/game/car/WiperSwitch.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { WIPERS } from "@/lib/game/constants";
import type { InteractableSpec } from "@/lib/game/interaction/interactionSystem";
import { damp } from "@/lib/game/math";
import { PALETTE } from "@/lib/game/palette";
import { useGameStore } from "@/lib/game/store";
import { rallyClient } from "@/lib/net/client";
import { Interactable } from "../interaction/Interactable";

const { BASE_POSITION, BASE_SIZE, LEVER_POSITION, LEVER_SIZE } = COCKPIT.PASSENGER_WIPER_SWITCH;
const LEVER_OFFSET = [
  LEVER_POSITION[0] - BASE_POSITION[0],
  LEVER_POSITION[1] - BASE_POSITION[1],
  LEVER_POSITION[2] - BASE_POSITION[2],
] as const;

/**
 * Physical wiper rocker on the passenger dash. Only the co-driver can use it; the label shows
 * only while looked at. Online, a press asks the server (which owns the state) and the visual
 * follows the echoed snapshot value.
 * @returns Switch group with a damped lever.
 */
export function WiperSwitch() {
  const leverRef = useRef<Group>(null);

  const spec = useMemo<InteractableSpec>(() => ({
    id: "wiper-switch",
    kind: "toggle",
    roles: ["codriver"],
    isEnabled: () => true,
    label: "Wipers",
    getObjects: () => [],
    onPress: () => {
      const store = useGameStore.getState();
      const next = !store.wipersOn;
      store.setWipersOn(next);
      if (store.online) rallyClient.getSocket().emit("codriver:wipers", { on: next });
    },
  }), []);

  useFrame((_, delta) => {
    const lever = leverRef.current;
    if (!lever) return;
    const target = useGameStore.getState().wipersOn ? WIPERS.SWITCH_ON_TILT : -WIPERS.SWITCH_ON_TILT;
    lever.rotation.z = damp(lever.rotation.z, target, WIPERS.SWITCH_DAMPING, delta);
  });

  return (
    <Interactable spec={spec}>
      <group name="passenger-wiper-switch">
        <mesh position={[...BASE_POSITION]} receiveShadow>
          <boxGeometry args={[...BASE_SIZE]} />
          <meshStandardMaterial color={PALETTE.interior} flatShading />
        </mesh>
        <group ref={leverRef} position={[...BASE_POSITION]}>
          <mesh position={[...LEVER_OFFSET]} castShadow>
            <boxGeometry args={[...LEVER_SIZE]} />
            <meshStandardMaterial color={PALETTE.lever} flatShading />
          </mesh>
        </group>
      </group>
    </Interactable>
  );
}
