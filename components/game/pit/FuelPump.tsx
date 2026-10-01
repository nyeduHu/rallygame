// components/game/pit/FuelPump.tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Line, LineBasicMaterial, Quaternion, Vector3, type Group } from "three";
import { REFUEL } from "@/lib/game/constants";
import type { InteractableSpec } from "@/lib/game/interaction/interactionSystem";
import { damp } from "@/lib/game/math";
import { PALETTE } from "@/lib/game/palette";
import { applyRefuelStep } from "@/lib/game/refuel/refuelMachine";
import type { SessionView } from "@/lib/game/sessionView";
import type { PitInfo } from "@/lib/game/stage/types";
import { useGameStore } from "@/lib/game/store";
import { Interactable } from "../interaction/Interactable";
import { submitRefuelStep } from "./submitRefuelStep";

const PUMP_SIZE = [0.6, 1.4, 0.4] as const;
const NOZZLE_HEIGHT = 1.1;
const ROPE_POINTS = 18;
const ROPE_SAG = 0.5;
const ROPE_COLOR = "#1c1d21";
const HAND_FORWARD = 0.7;
const HAND_DOWN = 0.35;
const LEVER_ON_TILT = 0.7;
const GAUGE_WIDTH = 0.4;
const GAUGE_HEIGHT = 0.06;

/** @returns True while the co-driver stands outside at the pit. */
function working(): boolean {
  const store = useGameStore.getState();
  return store.footRole === "codriver" && store.pitActive;
}

/**
 * Builds the pump-side hose interaction: grab the hose, or put it back.
 * @returns Interactable spec.
 */
function hoseSpec(): InteractableSpec {
  return {
    id: "pump-hose",
    kind: "press",
    roles: ["codriver"],
    isEnabled: () => working() && useGameStore.getState().refuel.kind !== "connected" && useGameStore.getState().refuel.kind !== "fueling",
    label: "Fuel hose",
    getObjects: () => [],
    onPress: () => submitRefuelStep(useGameStore.getState().refuel.kind === "idle" ? "GRAB_HOSE" : "RETURN_HOSE"),
  };
}

/**
 * Builds the pump lever: starts and stops the flow when the hose is connected.
 * @returns Interactable spec.
 */
function leverSpec(): InteractableSpec {
  return {
    id: "pump-lever",
    kind: "toggle",
    roles: ["codriver"],
    isEnabled: () => working() && (useGameStore.getState().refuel.kind === "connected" || useGameStore.getState().refuel.kind === "fueling"),
    label: "Pump lever",
    getObjects: () => [],
    onPress: () => submitRefuelStep(useGameStore.getState().refuel.kind === "fueling" ? "STOP" : "START"),
  };
}

/**
 * Builds the fuel-flap interaction on the car: open, connect, disconnect, close by context.
 * @returns Interactable spec.
 */
function flapSpec(): InteractableSpec {
  return {
    id: "fuel-flap",
    kind: "press",
    roles: ["codriver"],
    isEnabled: () => working(),
    label: "Fuel flap",
    getObjects: () => [],
    onPress: () => {
      const { refuel } = useGameStore.getState();
      if (!refuel.flapOpen) submitRefuelStep("OPEN_FLAP");
      else if (refuel.kind === "hose_held") submitRefuelStep("CONNECT");
      else if (refuel.kind === "connected") submitRefuelStep("DISCONNECT");
      else if (applyRefuelStep(refuel, "CLOSE_FLAP").ok) submitRefuelStep("CLOSE_FLAP");
    },
  };
}

interface FuelPumpProps {
  pit: PitInfo;
  session: SessionView;
}

/**
 * Pump with a gauge showing the car's fuel, a lever, and a hose drawn as a sagging rope between
 * the nozzle and the player's hand (while held) or the car's fuel flap (while connected). Also
 * renders the fuel flap on the car itself.
 * @param props - Pit placement and the car session (for the flap position).
 * @returns Pump group in world space.
 */
export function FuelPump({ pit, session }: FuelPumpProps) {
  const leverRef = useRef<Group>(null);
  const gaugeRef = useRef<Group>(null);
  const camera = useThree((state) => state.camera);
  const hose = useMemo(() => hoseSpec(), []);
  const lever = useMemo(() => leverSpec(), []);
  const flap = useMemo(() => flapSpec(), []);
  const ropeHolder = useRef<Group>(null);
  const ropeRef = useRef<Line | null>(null);
  const scratch = useRef({
    nozzle: new Vector3(),
    end: new Vector3(),
    mid: new Vector3(),
    forward: new Vector3(),
    flapWorld: new Vector3(),
    quaternion: new Quaternion(),
    local: new Vector3(...REFUEL.FLAP_LOCAL),
  });

  useFrame((_, delta) => {
    const { refuel, mech, pitActive } = useGameStore.getState();
    if (leverRef.current) leverRef.current.rotation.z = damp(leverRef.current.rotation.z, refuel.kind === "fueling" ? LEVER_ON_TILT : -LEVER_ON_TILT, 12, delta);
    if (gaugeRef.current) gaugeRef.current.scale.x = Math.max(0.001, mech.fuel01);

    const holder = ropeHolder.current;
    if (holder && !ropeRef.current) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(ROPE_POINTS * 3), 3));
      ropeRef.current = new Line(geometry, new LineBasicMaterial({ color: ROPE_COLOR }));
      ropeRef.current.frustumCulled = false;
      holder.add(ropeRef.current);
    }
    const rope = ropeRef.current;
    const s = scratch.current;
    s.nozzle.set(pit.pump.x, pit.y + NOZZLE_HEIGHT, pit.pump.z);
    s.quaternion.copy(session.renderQuaternion);
    s.flapWorld.copy(s.local).applyQuaternion(s.quaternion).add(session.renderPosition);
    if (!rope) return;
    rope.visible = pitActive && refuel.kind !== "idle";
    if (!rope.visible) return;
    if (refuel.kind === "hose_held") {
      s.forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      s.end.copy(camera.position).addScaledVector(s.forward, HAND_FORWARD);
      s.end.y -= HAND_DOWN;
    } else {
      s.end.copy(s.flapWorld);
    }
    s.mid.copy(s.nozzle).add(s.end).multiplyScalar(0.5);
    s.mid.y -= ROPE_SAG;
    const curve = new CatmullRomCurve3([s.nozzle, s.mid, s.end]);
    const attribute = rope.geometry.getAttribute("position");
    const points = curve.getPoints(ROPE_POINTS - 1);
    points.forEach((point, i) => attribute.setXYZ(i, point.x, point.y, point.z));
    attribute.needsUpdate = true;
  });

  return (
    <>
      <group position={[pit.pump.x, pit.y, pit.pump.z]} rotation={[0, pit.heading, 0]} name="fuel-pump">
        <mesh position={[0, PUMP_SIZE[1] / 2, 0]} castShadow>
          <boxGeometry args={[...PUMP_SIZE]} />
          <meshStandardMaterial color={PALETTE.carBody} flatShading />
        </mesh>
        <group position={[0, PUMP_SIZE[1] * 0.8, PUMP_SIZE[2] / 2 + 0.01]}>
          <mesh>
            <planeGeometry args={[GAUGE_WIDTH, GAUGE_HEIGHT]} />
            <meshBasicMaterial color="#1c1d21" />
          </mesh>
          <group ref={gaugeRef} position={[-GAUGE_WIDTH / 2, 0, 0.002]}>
            <mesh position={[GAUGE_WIDTH / 2, 0, 0]}>
              <planeGeometry args={[GAUGE_WIDTH, GAUGE_HEIGHT * 0.7]} />
              <meshBasicMaterial color={PALETTE.gaugeNeedle} />
            </mesh>
          </group>
        </group>
        <Interactable spec={hose}>
          <mesh position={[0.35, NOZZLE_HEIGHT, 0]}>
            <boxGeometry args={[0.12, 0.3, 0.12]} />
            <meshStandardMaterial color={PALETTE.lever} flatShading />
          </mesh>
        </Interactable>
        <Interactable spec={lever}>
          <group position={[-0.35, PUMP_SIZE[1] * 0.55, PUMP_SIZE[2] / 2 + 0.02]}>
            <group ref={leverRef}>
              <mesh position={[0, 0.1, 0]}>
                <boxGeometry args={[0.05, 0.22, 0.05]} />
                <meshStandardMaterial color={PALETTE.leverKnob} flatShading />
              </mesh>
            </group>
          </group>
        </Interactable>
      </group>
      <group ref={ropeHolder} />
      <CarFlap session={session} flapSpec={flap} />
    </>
  );
}

interface CarFlapProps {
  session: SessionView;
  flapSpec: InteractableSpec;
}

/**
 * The fuel flap as a world-space interactable that follows the car pose.
 * @param props - Session and interaction spec.
 * @returns Flap mesh.
 */
function CarFlap({ session, flapSpec: spec }: CarFlapProps) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    group.position.copy(session.renderPosition);
    group.quaternion.copy(session.renderQuaternion);
  });
  return (
    <group ref={ref}>
      <Interactable spec={spec}>
        <mesh position={[...REFUEL.FLAP_LOCAL]}>
          <boxGeometry args={[0.03, 0.18, 0.2]} />
          <meshStandardMaterial color={PALETTE.carBodyDark} flatShading />
        </mesh>
      </Interactable>
    </group>
  );
}
