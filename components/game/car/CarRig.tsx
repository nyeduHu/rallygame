// components/game/car/CarRig.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { GameSession } from "@/lib/game/session";
import { useGameStore } from "@/lib/game/store";
import { FRAME_PRIORITY } from "../scene/framePriority";
import type { Role } from "@/lib/game/roles";
import { CarExterior } from "./CarExterior";
import { Cockpit } from "./Cockpit";

interface CarRigProps {
  session: GameSession;
  role: Role;
  solo: boolean;
}

/**
 * Car-local space that follows the interpolated physics pose. Shows the cockpit
 * in first-person and the full car model in chase view.
 * @param props - Game session.
 * @returns Car group.
 */
export function CarRig({ session, role, solo }: CarRigProps) {
  const groupRef = useRef<Group>(null);
  const viewMode = useGameStore((state) => state.viewMode);
  const soloActiveRole = useGameStore((state) => state.soloActiveRole);
  const activeRole = solo ? soloActiveRole : role;

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.position.copy(session.renderPosition);
    group.quaternion.copy(session.renderQuaternion);
  }, FRAME_PRIORITY.CAR);

  return (
    <group ref={groupRef} name="car">
      {viewMode === "cockpit" ? (
        <Cockpit session={session} activeRole={activeRole} />
      ) : (
        <CarExterior session={session} />
      )}
    </group>
  );
}
