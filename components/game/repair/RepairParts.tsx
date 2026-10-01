// components/game/repair/RepairParts.tsx
"use client";

import { useMemo } from "react";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { REPAIR } from "@/lib/game/constants";
import type { InteractableSpec } from "@/lib/game/interaction/interactionSystem";
import { PALETTE } from "@/lib/game/palette";
import { useGameStore } from "@/lib/game/store";
import type { BrokenPart } from "@/lib/game/vehicle/mechanics";
import { Interactable } from "../interaction/Interactable";
import { submitRepairStep } from "./submitRepairStep";

const BAY = COCKPIT.ENGINE_BAY;
const TINT_BROKEN = "#e2462f";
const PART_COLOR = "#7d828c";
/** Drags shorter than this count as a click (inspect). */
const CLICK_MAX_DRAG_PX = 8;
const PART_LABELS: Record<BrokenPart, string> = {
  radiator_hose: "Radiator hose",
  spark_plug: "Spark plugs",
  drive_belt: "Drive belt",
};

/** @returns True while the driver can work on the engine (hood open, standing outside). */
function canWork(): boolean {
  const store = useGameStore.getState();
  return store.footRole === "driver" && store.hoodOpen;
}

/**
 * Whether a part is currently shown in its slot.
 * @param part - Part to check.
 * @returns False while that part has been removed.
 */
function installed(part: BrokenPart): boolean {
  const { repair } = useGameStore.getState();
  return !(repair.kind === "part_removed" && repair.part === part);
}

/**
 * Builds the interaction for an installed part: a click inspects it, a long drag removes it.
 * @param part - Part id.
 * @returns Interactable spec.
 */
function installedSpec(part: BrokenPart): InteractableSpec {
  let totalDx = 0;
  let totalDy = 0;
  return {
    id: `part-${part}`,
    kind: "drag",
    roles: ["driver"],
    isEnabled: () => canWork() && installed(part),
    label: PART_LABELS[part],
    getObjects: () => [],
    onPress: () => {
      totalDx = 0;
      totalDy = 0;
    },
    onDrag: (_dx, _dy, tx, ty) => {
      totalDx = tx;
      totalDy = ty;
    },
    onRelease: () => {
      const dragged = Math.hypot(totalDx, totalDy);
      if (dragged <= CLICK_MAX_DRAG_PX) submitRepairStep({ step: "INSPECT", partId: part });
      else if (dragged >= REPAIR.REMOVE_DRAG_PX) submitRepairStep({ step: "REMOVE_PART", partId: part });
    },
  };
}

/**
 * Radiator cap: drag to unscrew (hood open) or screw back (after water), 1.5 turns each way.
 * @returns Interactable spec.
 */
function capSpec(): InteractableSpec {
  let total = 0;
  return {
    id: "radiator-cap",
    kind: "drag",
    roles: ["driver"],
    isEnabled: () => {
      const { repair } = useGameStore.getState();
      return canWork() && (repair.kind === "hood_open" || repair.kind === "cap_watered");
    },
    label: "Radiator cap",
    getObjects: () => [],
    onPress: () => {
      total = 0;
    },
    onDrag: (_dx, _dy, tx, ty) => {
      total = Math.hypot(tx, ty);
    },
    onRelease: () => {
      if (total < REPAIR.CAP_TURNS * REPAIR.CAP_PX_PER_TURN) return;
      const { repair } = useGameStore.getState();
      submitRepairStep({ step: repair.kind === "cap_watered" ? "SCREW_CAP" : "UNSCREW_CAP" });
    },
  };
}

/**
 * Water bottle: hold it over the open cap for a few seconds.
 * @returns Interactable spec.
 */
function waterSpec(): InteractableSpec {
  let fired = false;
  return {
    id: "water-bottle",
    kind: "hold",
    roles: ["driver"],
    isEnabled: () => useGameStore.getState().footRole === "driver" && useGameStore.getState().repair.kind === "cap_off",
    label: "Pour water (hold)",
    getObjects: () => [],
    onPress: () => {
      fired = false;
    },
    onHold: (seconds) => {
      if (fired || seconds < REPAIR.WATER_HOLD_S) return;
      fired = true;
      submitRepairStep({ step: "POUR_WATER" });
    },
  };
}

/**
 * Builds the interaction for a spare in the toolbox area: drag it toward the engine to install.
 * @param part - Part id of the spare.
 * @returns Interactable spec.
 */
function spareSpec(part: BrokenPart): InteractableSpec {
  let total = 0;
  return {
    id: `spare-${part}`,
    kind: "drag",
    roles: ["driver"],
    isEnabled: () => useGameStore.getState().footRole === "driver",
    label: `Spare ${PART_LABELS[part].toLowerCase()}`,
    getObjects: () => [],
    onPress: () => {
      total = 0;
    },
    onDrag: (_dx, _dy, tx, ty) => {
      total = Math.hypot(tx, ty);
    },
    onRelease: () => {
      if (total >= REPAIR.INSTALL_DRAG_PX) submitRepairStep({ step: "INSTALL_NEW", partId: part });
    },
  };
}

interface TintedProps {
  part: BrokenPart;
  children: (color: string) => React.ReactNode;
}

/**
 * Renders a part group that is hidden while removed and tinted red when it is the broken one.
 * @param props - Part id and a render function receiving the tint colour.
 * @returns Part group.
 */
function Visible({ part, children }: TintedProps) {
  const broken = useGameStore((state) => state.mech.brokenPart === part && state.hoodOpen);
  const removed = useGameStore((state) => state.repair.kind === "part_removed" && state.repair.part === part);
  return <group visible={!removed}>{children(broken ? TINT_BROKEN : PART_COLOR)}</group>;
}

/**
 * Radiator hose, spark plugs and drive belt in the engine bay, the toolbox with its tool, three
 * labelled spares, and the dash ignition button. Everything is a physical interactable.
 * @returns Repair objects in car-local space.
 */
export function RepairParts() {
  const specs = useMemo(
    () => ({
      radiator_hose: installedSpec("radiator_hose"),
      spark_plug: installedSpec("spark_plug"),
      drive_belt: installedSpec("drive_belt"),
    }),
    [],
  );
  const spares = useMemo(
    () => ({
      radiator_hose: spareSpec("radiator_hose"),
      spark_plug: spareSpec("spark_plug"),
      drive_belt: spareSpec("drive_belt"),
    }),
    [],
  );
  const cap = useMemo(() => capSpec(), []);
  const water = useMemo(() => waterSpec(), []);
  const tool = useMemo<InteractableSpec>(
    () => ({
      id: "toolbox-tool",
      kind: "press",
      roles: ["driver"],
      isEnabled: () => useGameStore.getState().footRole === "driver",
      label: "Grab wrench",
      getObjects: () => [],
      onPress: () => submitRepairStep({ step: "GRAB_TOOL" }),
    }),
    [],
  );
  const ignition = useMemo<InteractableSpec>(
    () => ({
      id: "ignition",
      kind: "press",
      roles: ["driver"],
      isEnabled: () => useGameStore.getState().footRole === null,
      label: "Ignition",
      getObjects: () => [],
      onPress: () => submitRepairStep({ step: "IGNITION" }),
    }),
    [],
  );

  const spareSlot = (index: number): [number, number, number] => [
    BAY.SPARES_X,
    0.12,
    BAY.SPARES_Z + index * BAY.SPARES_SPACING,
  ];

  return (
    <group name="repair-parts">
      <Interactable spec={specs.radiator_hose}>
        <Visible part="radiator_hose">
          {(color) => (
            <mesh position={[...BAY.RADIATOR_HOSE.POSITION]}>
              <boxGeometry args={[...BAY.RADIATOR_HOSE.SIZE]} />
              <meshStandardMaterial color={color} flatShading />
            </mesh>
          )}
        </Visible>
      </Interactable>

      <Interactable spec={specs.spark_plug}>
        <Visible part="spark_plug">
          {(color) =>
            [0, 1, 2, 3].map((i) => (
              <mesh key={i} position={[BAY.SPARK_PLUGS.POSITION[0] + i * BAY.SPARK_PLUGS.SPACING, BAY.SPARK_PLUGS.POSITION[1], BAY.SPARK_PLUGS.POSITION[2]]}>
                <cylinderGeometry args={[BAY.SPARK_PLUGS.SIZE[0] / 2, BAY.SPARK_PLUGS.SIZE[0] / 2, BAY.SPARK_PLUGS.SIZE[1], 8]} />
                <meshStandardMaterial color={color} flatShading />
              </mesh>
            ))
          }
        </Visible>
      </Interactable>

      <Interactable spec={specs.drive_belt}>
        <Visible part="drive_belt">
          {(color) => (
            <mesh position={[...BAY.DRIVE_BELT.POSITION]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[BAY.DRIVE_BELT.RADIUS, BAY.DRIVE_BELT.TUBE, 6, 16]} />
              <meshStandardMaterial color={color} flatShading />
            </mesh>
          )}
        </Visible>
      </Interactable>

      <mesh position={[...BAY.TOOLBOX.POSITION]} castShadow>
        <boxGeometry args={[...BAY.TOOLBOX.SIZE]} />
        <meshStandardMaterial color={PALETTE.steeringHub} flatShading />
      </mesh>
      <Interactable spec={tool}>
        <mesh position={[...BAY.TOOL_POSITION]}>
          <boxGeometry args={[...BAY.TOOL_SIZE]} />
          <meshStandardMaterial color={PALETTE.lever} flatShading />
        </mesh>
      </Interactable>

      <Interactable spec={spares.radiator_hose}>
        <mesh position={spareSlot(0)} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
          <meshStandardMaterial color="#3ca55c" flatShading />
        </mesh>
      </Interactable>
      <Interactable spec={spares.spark_plug}>
        <mesh position={spareSlot(1)}>
          <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
          <meshStandardMaterial color="#d9b23c" flatShading />
        </mesh>
      </Interactable>
      <Interactable spec={spares.drive_belt}>
        <mesh position={spareSlot(2)} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.12, 0.025, 6, 14]} />
          <meshStandardMaterial color="#2f5fb3" flatShading />
        </mesh>
      </Interactable>

      <Interactable spec={cap}>
        <mesh position={[...BAY.CAP.POSITION]}>
          <cylinderGeometry args={[BAY.CAP.RADIUS, BAY.CAP.RADIUS, BAY.CAP.HEIGHT, 10]} />
          <meshStandardMaterial color={PALETTE.carBodyDark} flatShading />
        </mesh>
      </Interactable>
      <Interactable spec={water}>
        <mesh position={[...BAY.WATER_BOTTLE.POSITION]}>
          <cylinderGeometry args={[BAY.WATER_BOTTLE.RADIUS, BAY.WATER_BOTTLE.RADIUS, BAY.WATER_BOTTLE.HEIGHT, 10]} />
          <meshStandardMaterial color="#6fb4e8" flatShading />
        </mesh>
      </Interactable>

      <Interactable spec={ignition}>
        <mesh position={[...BAY.IGNITION_POSITION]}>
          <boxGeometry args={[...BAY.IGNITION_SIZE]} />
          <meshStandardMaterial color={PALETTE.carBody} flatShading />
        </mesh>
      </Interactable>
    </group>
  );
}
