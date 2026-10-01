// components/game/onfoot/OnFootRig.tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Euler, Vector3 } from "three";
import { NET } from "@/lib/net/netConstants";
import { rallyClient } from "@/lib/net/client";
import { ON_FOOT } from "@/lib/game/constants";
import type { KeyboardControls } from "@/lib/game/input/keyboardControls";
import type { MouseLook } from "@/lib/game/input/mouseLook";
import { canExit, canReenter, desiredVelocity, doorPosition } from "@/lib/game/onfoot/onFootController";
import { OnFootBody } from "@/lib/game/onfoot/onFootBody";
import { OnFootWorld } from "@/lib/game/onfoot/onFootWorld";
import { restingRideHeight } from "@/lib/game/physics/vehicle";
import { loadRapier } from "@/lib/game/physics/rapier";
import type { Role } from "@/lib/game/roles";
import { GameSession } from "@/lib/game/session";
import type { SessionView } from "@/lib/game/sessionView";
import type { MeshData } from "@/lib/game/stage/meshData";
import { useGameStore } from "@/lib/game/store";
import { FRAME_PRIORITY } from "../scene/framePriority";

/** The camera looks down -z; yaw 0 faces world +z. */
const FACE_FORWARD_YAW = Math.PI;
const POSE_INTERVAL_S = 1 / NET.POSE_HZ;

interface OnFootRigProps {
  session: SessionView;
  road: MeshData;
  terrain: MeshData;
  keyboard: KeyboardControls;
  mouseLook: MouseLook;
  role: Role;
  solo: boolean;
  online: boolean;
}

/**
 * Handles leaving and re-entering the car (F), walking with a Rapier character controller and
 * the first-person on-foot camera. The driver client reuses its session world; an online
 * co-driver lazily builds a small world with the car as a kinematic body.
 * @param props - Session, meshes, input and mode flags.
 * @returns Nothing visible.
 */
export function OnFootRig({ session, road, terrain, keyboard, mouseLook, role, solo, online }: OnFootRigProps) {
  const camera = useThree((state) => state.camera);
  const bodyRef = useRef<OnFootBody | null>(null);
  const worldRef = useRef<OnFootWorld | null>(null);
  const busy = useRef(false);
  const sincePose = useRef(0);
  const seq = useRef(0);
  const scratch = useRef({ eye: new Vector3(), feet: new Vector3(), euler: new Euler(0, 0, 0, "YXZ") });

  useEffect(() => {
    /** Reads the car's heading from its render quaternion. */
    const carYaw = (): number => {
      const q = session.renderQuaternion;
      return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    };

    /** Asks the server (online only) and resolves true when the seat change is allowed. */
    const askServer = async (to: "foot" | "seat"): Promise<boolean> => {
      if (!online) return true;
      try {
        const response = await rallyClient.request<{ ok: boolean }>("seat:set", { to });
        return response.ok === true;
      } catch {
        return false;
      }
    };

    const exitCar = async (activeRole: Role): Promise<void> => {
      if (!canExit(session.vehicle.forwardSpeed) || !(await askServer("foot"))) return;
      const R = await loadRapier();
      let world;
      if (session instanceof GameSession) {
        world = session.physics.world;
      } else {
        worldRef.current ??= new OnFootWorld(R, session.stage, road, terrain);
        world = worldRef.current.physics.world;
      }
      const yaw = carYaw();
      const car = { x: session.renderPosition.x, z: session.renderPosition.z, yaw };
      const door = doorPosition(car, activeRole);
      const side = activeRole === "driver" ? 1 : -1;
      const push = ON_FOOT.EXIT_OFFSET_X - ON_FOOT.DOOR_OFFSET_X;
      const feet = {
        x: door.x + side * push * Math.cos(yaw),
        y: session.renderPosition.y - restingRideHeight() + ON_FOOT.EXIT_LIFT,
        z: door.z - side * push * Math.sin(yaw),
      };
      bodyRef.current = new OnFootBody(R, world, feet);
      mouseLook.setFreeLook(true, yaw);
      useGameStore.getState().setFootRole(activeRole);
    };

    const enterCar = async (footRole: Role): Promise<void> => {
      const body = bodyRef.current;
      if (!body) return;
      const feet = body.feetPosition(scratch.current.feet);
      const door = doorPosition({ x: session.renderPosition.x, z: session.renderPosition.z, yaw: carYaw() }, footRole);
      if (!canReenter({ x: feet.x, z: feet.z }, door) || !(await askServer("seat"))) return;
      body.dispose();
      bodyRef.current = null;
      mouseLook.setFreeLook(false);
      useGameStore.getState().setFootRole(null);
    };

    return keyboard.onAction((action) => {
      if (action !== "toggleSeat" || busy.current) return;
      busy.current = true;
      const store = useGameStore.getState();
      const task = store.footRole === null ? exitCar(solo ? store.soloActiveRole : role) : enterCar(store.footRole);
      void task.finally(() => {
        busy.current = false;
      });
    });
  }, [keyboard, mouseLook, online, road, role, session, solo, terrain]);

  useEffect(
    () => () => {
      bodyRef.current?.dispose();
      worldRef.current?.dispose();
    },
    [],
  );

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body || useGameStore.getState().footRole === null) return;
    worldRef.current?.update(session.renderPosition, session.renderQuaternion);
    const velocity = desiredVelocity(keyboard.readOnFoot(), mouseLook.yaw);
    body.step(delta, velocity);

    const s = scratch.current;
    camera.position.copy(body.eyePosition(s.eye));
    s.euler.set(mouseLook.pitch, FACE_FORWARD_YAW + mouseLook.yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(s.euler);

    sincePose.current += delta;
    if (online && sincePose.current >= POSE_INTERVAL_S) {
      sincePose.current = 0;
      seq.current += 1;
      const feet = body.feetPosition(s.feet);
      rallyClient.getSocket().emit("foot:pose", { seq: seq.current, p: [feet.x, feet.y, feet.z], yaw: mouseLook.yaw });
    }
  }, FRAME_PRIORITY.CAMERA);

  return null;
}
