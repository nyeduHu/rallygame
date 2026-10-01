// components/game/car/CameraRig.tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Euler, Quaternion, Vector3 } from "three";
import { CAMERA } from "@/lib/game/constants";
import type { MouseLook } from "@/lib/game/input/mouseLook";
import type { GameSession } from "@/lib/game/session";
import type { Role } from "@/lib/game/roles";
import { useGameStore } from "@/lib/game/store";
import { FRAME_PRIORITY } from "../scene/framePriority";

interface CameraRigProps {
  session: GameSession;
  mouseLook: MouseLook;
  role: Role;
  solo: boolean;
}

const EYE = new Vector3(CAMERA.DRIVER_EYE.x, CAMERA.DRIVER_EYE.y, CAMERA.DRIVER_EYE.z);
const PASSENGER_EYE = new Vector3(CAMERA.PASSENGER_EYE.x, CAMERA.PASSENGER_EYE.y, CAMERA.PASSENGER_EYE.z);
const UP = new Vector3(0, 1, 0);
/** The camera looks down -z; the car faces +z. */
const FACE_FORWARD_YAW = Math.PI;

/**
 * Drives the default camera. Cockpit: driver's eye with mouse look and a head that
 * sways against acceleration (felt g-forces). Chase: smoothed follow camera.
 * @param props - Session and mouse-look state.
 * @returns Nothing visible.
 */
export function CameraRig({ session, mouseLook, role, solo }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const viewMode = useGameStore((state) => state.viewMode);
  const soloActiveRole = useGameStore((state) => state.soloActiveRole);
  const activeRole = solo ? soloActiveRole : role;
  const state = useRef({
    lastVelocity: new Vector3(),
    sway: new Vector3(),
    acceleration: new Vector3(),
    inverse: new Quaternion(),
    look: new Quaternion(),
    euler: new Euler(0, 0, 0, "YXZ"),
    eye: new Vector3(),
    chasePosition: new Vector3(),
    chaseTarget: new Vector3(),
    forward: new Vector3(),
    initialised: false,
  });

  useEffect(() => {
    state.current.initialised = false;
  }, [viewMode]);

  useFrame((_, delta) => {
    const s = state.current;
    const carPosition = session.renderPosition;
    const carQuaternion = session.renderQuaternion;
    mouseLook.update(delta);

    if (viewMode === "chase") {
      s.forward.set(0, 0, 1).applyQuaternion(carQuaternion);
      s.forward.y = 0;
      s.forward.normalize();
      s.chaseTarget
        .copy(carPosition)
        .addScaledVector(s.forward, -CAMERA.CHASE_DISTANCE)
        .addScaledVector(UP, CAMERA.CHASE_HEIGHT);
      const blend = s.initialised ? 1 - Math.exp(-CAMERA.CHASE_SMOOTHING * delta) : 1;
      s.chasePosition.lerp(s.chaseTarget, blend);
      s.initialised = true;
      camera.position.copy(s.chasePosition);
      camera.lookAt(s.chaseTarget.copy(carPosition).addScaledVector(s.forward, CAMERA.CHASE_LOOK_AHEAD));
      return;
    }

    mouseLook.setPitchDownLimit(activeRole === "codriver" ? CAMERA.PASSENGER_MAX_PITCH_DOWN : CAMERA.MAX_PITCH_DOWN);

    // Head sway: local-space acceleration pushes the head the opposite way.
    const velocity = session.vehicle.body.linvel();
    if (delta > 0) {
      s.acceleration.set(velocity.x, velocity.y, velocity.z).sub(s.lastVelocity).divideScalar(delta);
    }
    s.lastVelocity.set(velocity.x, velocity.y, velocity.z);
    s.inverse.copy(carQuaternion).invert();
    s.acceleration.applyQuaternion(s.inverse).multiplyScalar(-CAMERA.HEAD_SWAY_GAIN).clampLength(0, CAMERA.HEAD_SWAY_MAX);
    s.sway.lerp(s.acceleration, 1 - Math.exp(-CAMERA.HEAD_SWAY_SMOOTHING * delta));

    s.eye.copy(activeRole === "codriver" ? PASSENGER_EYE : EYE).add(s.sway).applyQuaternion(carQuaternion).add(carPosition);
    camera.position.copy(s.eye);
    s.euler.set(mouseLook.pitch, FACE_FORWARD_YAW + mouseLook.yaw, 0, "YXZ");
    s.look.setFromEuler(s.euler);
    camera.quaternion.copy(carQuaternion).multiply(s.look);
  }, FRAME_PRIORITY.CAMERA);

  return null;
}
