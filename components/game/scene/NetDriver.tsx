// components/game/scene/NetDriver.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MECHANICS } from "@/lib/game/constants";
import { gameEvents } from "@/lib/game/events";
import { addShake } from "@/lib/game/shake";
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
    const socket = rallyClient.getSocket();
    const { vehicle } = session;
    socket.emit("car:inputs", {
      throttle01: vehicle.drivetrain.throttle,
      brake01: vehicle.drivetrain.brake,
      steer: vehicle.steer,
      handbrake: vehicle.handbrake,
      rpm: vehicle.drivetrain.rpm,
    });
    const impacts = session.consumeImpacts();
    if (impacts.solidImpulse >= MECHANICS.CRASH_IMPULSE) {
      gameEvents.emit("crash", { impulse: impacts.solidImpulse });
      addShake(impacts.solidImpulse);
    }
    if (impacts.solidImpulse > 0) socket.emit("car:impact", { kind: "solid", impulse: impacts.solidImpulse });
    impacts.coneHits.forEach((objectId) => socket.emit("car:impact", { kind: "cone", impulse: 0, objectId }));
    socket.emit("car:pose", {
      seq: seq.current,
      epoch: session.resetCount,
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
