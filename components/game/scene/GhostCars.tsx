// components/game/scene/GhostCars.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { VEHICLE } from "@/lib/game/constants";
import { TEAM_COLORS } from "@/lib/game/palette";
import { snapshotBuffer, serverNowMs } from "@/lib/net/netStore";
import { SnapshotBuffer } from "@/lib/net/snapshotBuffer";
import { FRAME_PRIORITY } from "./framePriority";

const BODY_SCALE = 2;
const BODY_HEIGHT_FACTOR = 2;

interface GhostCarProps {
  teamId: string;
  color: string;
}

/**
 * One remote team's car, driven by the interpolated snapshot buffer.
 * @param props - Team id and body colour.
 * @returns Car box placeholder group.
 */
function GhostCar({ teamId, color }: GhostCarProps) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const group = ref.current;
    const pose = snapshotBuffer.sample(teamId, SnapshotBuffer.renderTime(serverNowMs()));
    if (!group || !pose) return;
    group.visible = pose.status !== "dnf";
    group.position.set(pose.p[0], pose.p[1], pose.p[2]);
    group.quaternion.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3]);
  }, FRAME_PRIORITY.CAR);

  const half = VEHICLE.CHASSIS_HALF_EXTENTS;
  return (
    <group ref={ref} name={`ghost-${teamId}`}>
      <mesh castShadow>
        <boxGeometry args={[half.x * BODY_SCALE, half.y * BODY_HEIGHT_FACTOR, half.z * BODY_SCALE]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

interface GhostCarsProps {
  /** Teams to draw (everyone except the local team). */
  teamIds: string[];
}

/**
 * Renders other teams' cars at interpolated poses. Uses a coloured chassis box rather than the
 * full hatchback because CarExterior is bound to the local physics session.
 * @param props - Remote team ids.
 * @returns Ghost car group.
 */
export function GhostCars({ teamIds }: GhostCarsProps) {
  return (
    <>
      {teamIds.map((teamId, index) => (
        <GhostCar key={teamId} teamId={teamId} color={TEAM_COLORS[index % TEAM_COLORS.length]} />
      ))}
    </>
  );
}
