// components/game/onfoot/PlayerBodies.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { ON_FOOT } from "@/lib/game/constants";
import { TEAM_COLORS } from "@/lib/game/palette";
import { damp } from "@/lib/game/math";
import { useNetStore } from "@/lib/net/netStore";
import type { Role } from "@/lib/game/roles";

const FOLLOW_RATE = 14;
const KEY_SEPARATOR = "|";
const SKIN = "#e8b48a";

interface BodyProps {
  teamId: string;
  role: Role;
  color: string;
}

/**
 * One low-poly person (capsule body and head) following the latest server pose.
 * @param props - Identity and colour.
 * @returns Character group.
 */
function Body({ teamId, role, color }: BodyProps) {
  const ref = useRef<Group>(null);
  const placed = useRef(false);
  useFrame((_, delta) => {
    const group = ref.current;
    const entry = useNetStore.getState().snapshot?.onFoot?.find((view) => view.teamId === teamId && view.role === role);
    if (!group || !entry) return;
    if (!placed.current) {
      group.position.set(entry.p[0], entry.p[1], entry.p[2]);
      placed.current = true;
    }
    group.position.x = damp(group.position.x, entry.p[0], FOLLOW_RATE, delta);
    group.position.y = damp(group.position.y, entry.p[1], FOLLOW_RATE, delta);
    group.position.z = damp(group.position.z, entry.p[2], FOLLOW_RATE, delta);
    group.rotation.y = entry.yaw;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, ON_FOOT.BODY_HEIGHT / 2, 0]} castShadow>
        <capsuleGeometry args={[ON_FOOT.BODY_RADIUS, ON_FOOT.BODY_HEIGHT - ON_FOOT.BODY_RADIUS * 2, 4, 8]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh position={[0, ON_FOOT.BODY_HEIGHT + ON_FOOT.HEAD_RADIUS, 0]} castShadow>
        <sphereGeometry args={[ON_FOOT.HEAD_RADIUS, 8, 6]} />
        <meshStandardMaterial color={SKIN} flatShading />
      </mesh>
    </group>
  );
}

interface PlayerBodiesProps {
  ownTeamId: string;
  ownRole: Role;
  teamIds: string[];
}

/**
 * Renders everyone currently out of a car, except the local player (first person).
 * @param props - Local identity and the ordered team ids used for body colours.
 * @returns Bodies for teammates and other teams.
 */
export function PlayerBodies({ ownTeamId, ownRole, teamIds }: PlayerBodiesProps) {
  const keys = useNetStore((state) =>
    (state.snapshot?.onFoot ?? []).map((view) => `${view.teamId}${KEY_SEPARATOR}${view.role}`).join(","),
  );
  return (
    <>
      {keys
        .split(",")
        .filter(Boolean)
        .map((key) => {
          const [teamId, role] = key.split(KEY_SEPARATOR);
          if (role !== "driver" && role !== "codriver") return null;
          if (teamId === ownTeamId && role === ownRole) return null;
          const color = TEAM_COLORS[Math.max(0, teamIds.indexOf(teamId)) % TEAM_COLORS.length];
          return <Body key={key} teamId={teamId} role={role} color={color} />;
        })}
    </>
  );
}
