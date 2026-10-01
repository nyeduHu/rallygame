// components/game/scene/NetDriver.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { rallyClient } from "@/lib/net/client";
import { NET } from "@/lib/net/netConstants";
import { serverNowMs, useNetStore } from "@/lib/net/netStore";
import type { GameSession } from "@/lib/game/session";
import { FRAME_PRIORITY } from "./framePriority";

interface NetDriverProps {
  session: GameSession;
}

const MS_PER_SECOND = 1000;
const POSE_INTERVAL_S = 1 / NET.POSE_HZ;
const ZERO_SUSPENSION: [number, number, number, number] = [0, 0, 0, 0];

/**
 * Online driver glue: starts the local countdown at the server's go time and streams the car
 * pose at a fixed rate from the frame loop (not a timer, so it never outpaces rendering).
 * @param props - Game session.
 * @returns Nothing visible.
 */
export function NetDriver({ session }: NetDriverProps) {
  const goAtServerMs = useNetStore((state) => state.goAtServerMs);
  const sincePose = useRef(0);
  const seq = useRef(0);

  useEffect(() => {
    if (goAtServerMs === null) return;
    session.race.beginCountdownAt((goAtServerMs - serverNowMs()) / MS_PER_SECOND);
  }, [goAtServerMs, session]);

  useFrame((_, delta) => {
    sincePose.current += delta;
    if (sincePose.current < POSE_INTERVAL_S || !session.race.controlsEnabled) return;
    sincePose.current = 0;
    const p = session.renderPosition;
    const q = session.renderQuaternion;
    const v = session.vehicle.currentVelocity;
    seq.current += 1;
    rallyClient.getSocket().emit("car:pose", {
      seq: seq.current,
      clientTimeMs: performance.now(),
      p: [p.x, p.y, p.z],
      q: [q.x, q.y, q.z, q.w],
      v: [v.x, v.y, v.z],
      steer: session.vehicle.steer,
      wheelSpin: 0,
      susp: ZERO_SUSPENSION,
    });
  }, FRAME_PRIORITY.SIMULATION + 1);

  return null;
}
