// components/game/repair/RepairParts.tsx
"use client";

import { useMemo } from "react";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { REPAIR } from "@/lib/game/constants";
import type { InteractableSpec } from "@/lib/game/interaction/interactionSystem";
import { PALETTE } from "@/lib/game/palette";
import { PART_NAMES } from "@/lib/game/repair/repairGuide";
import { useGameStore } from "@/lib/game/store";
import type { BrokenPart } from "@/lib/game/vehicle/mechanics";
import { Interactable } from "../interaction/Interactable";
import { Wrench } from "./Wrench";
import { submitRepairStep } from "./submitRepairStep";

const BAY = COCKPIT.ENGINE_BAY;
const BOTH_ROLES = ["driver", "codriver"] as const;
const TINT_BROKEN = "#e2462f";
const PART_COLOR = "#7d828c";
/** Colour of a freshly fitted part (matches its spare in the tray). */
const NEW_PART_COLORS: Record<BrokenPart, string> = {
  radiator_hose: "#3ca55c",
  spark_plug: "#d9b23c",
  drive_belt: "#2f5fb3",
};

/**
 * Whether the replacement for a part is already in place.
 * @param part - Part to check.
 * @returns True once the new part is fitted (until the engine restarts).
 */
function fitted(part: BrokenPart): boolean {
  const { repair } = useGameStore.getState();
  return (repair.kind === "part_installed" || repair.kind === "hood_closed_repaired") && repair.part === part;
}

/** @returns True while someone can work on the engine (hood open, standing outside). */
function canWork(): boolean {
  const store = useGameStore.getState();
  return store.footRole !== null && store.hoodOpen;
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
 * Builds the interaction for an installed part: press to inspect it, or, once the wrench is in
 * hand, press to take it out.
 * @param part - Part id.
 * @returns Interactable spec.
 */
function installedSpec(part: BrokenPart): InteractableSpec {
  return {
    id: `part-${part}`,
    kind: "press",
    roles: BOTH_ROLES,
    isEnabled: () => canWork() && installed(part),
    label: () => {
      const { repair } = useGameStore.getState();
      if (repair.kind === "tool_in_hand") return `Take out the ${PART_NAMES[part]} with the wrench`;
      if (repair.kind === "diagnosed") return repair.part === part ? `Broken ${PART_NAMES[part]}: grab the wrench first` : `Engine ${PART_NAMES[part]}`;
      if (repair.kind === "hood_open") return `Inspect the ${PART_NAMES[part]}`;
      return `Engine ${PART_NAMES[part]}`;
    },
    getObjects: () => [],
    onPress: () => {
      const { repair } = useGameStore.getState();
      submitRepairStep({ step: repair.kind === "tool_in_hand" ? "REMOVE_PART" : "INSPECT", partId: part });
    },
  };
}

/**
 * Radiator cap: press to unscrew it (hood open) or screw it back on (after water).
 * @returns Interactable spec.
 */
function capSpec(): InteractableSpec {
  return {
    id: "radiator-cap",
    kind: "press",
    roles: BOTH_ROLES,
    isEnabled: () => {
      const { repair } = useGameStore.getState();
      return canWork() && (repair.kind === "hood_open" || repair.kind === "cap_watered");
    },
    label: () => (useGameStore.getState().repair.kind === "cap_watered" ? "Screw the radiator cap back on" : "Unscrew the radiator cap"),
    getObjects: () => [],
    onPress: () => {
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
    roles: BOTH_ROLES,
    isEnabled: () => useGameStore.getState().footRole !== null && useGameStore.getState().repair.kind === "cap_off",
    label: "Pour water into the radiator",
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
 * Builds the interaction for a spare in the toolbox area: press to fit it (only the matching
 * part works).
 * @param part - Part id of the spare.
 * @returns Interactable spec.
 */
function spareSpec(part: BrokenPart): InteractableSpec {
  return {
    id: `spare-${part}`,
    kind: "press",
    roles: BOTH_ROLES,
    isEnabled: () => useGameStore.getState().footRole !== null && !fitted(part),
    label: () => (useGameStore.getState().repair.kind === "part_removed" ? `Fit the new ${PART_NAMES[part]}` : `New ${PART_NAMES[part]} (take the broken one out first)`),
    getObjects: () => [],
    onPress: () => submitRepairStep({ step: "INSTALL_NEW", partId: part }),
  };
}

interface TintedProps {
  part: BrokenPart;
  children: (color: string) => React.ReactNode;
}

/**
 * Renders a part group that is hidden while removed, red while it is the broken one and in the
 * colour of the new part once it has been replaced.
 * @param props - Part id and a render function receiving the tint colour.
 * @returns Part group.
 */
function Visible({ part, children }: TintedProps) {
  const broken = useGameStore((state) => state.mech.brokenPart === part && state.hoodOpen);
  const replaced = useGameStore((state) => (state.repair.kind === "part_installed" || state.repair.kind === "hood_closed_repaired") && state.repair.part === part);
  const removed = useGameStore((state) => state.repair.kind === "part_removed" && state.repair.part === part);
  const hoodOpen = useGameStore((state) => state.hoodOpen);
  return <group visible={!removed && hoodOpen}>{children(replaced ? NEW_PART_COLORS[part] : broken ? TINT_BROKEN : PART_COLOR)}</group>;
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
      roles: BOTH_ROLES,
      isEnabled: () => {
        const { footRole, repair } = useGameStore.getState();
        return footRole !== null && repair.kind !== "tool_in_hand" && repair.kind !== "part_removed";
      },
      label: () => (useGameStore.getState().repair.kind === "diagnosed" ? "Take the wrench" : "Wrench (inspect the broken part first)"),
      getObjects: () => [],
      onPress: () => submitRepairStep({ step: "GRAB_TOOL" }),
    }),
    [],
  );
  const ignition = useMemo<InteractableSpec>(
    () => ({
      id: "ignition",
      kind: "press",
      roles: BOTH_ROLES,
      isEnabled: () => useGameStore.getState().footRole === null,
      label: "Start the engine",
      getObjects: () => [],
      onPress: () => submitRepairStep({ step: "IGNITION" }),
    }),
    [],
  );

  const driverOut = useGameStore((state) => state.footRole !== null);
  const hoodOpen = useGameStore((state) => state.hoodOpen);
  const holding = useGameStore((state) => state.repair.kind === "tool_in_hand" || state.repair.kind === "part_removed");
  const spareFitted = useGameStore((state) => ((state.repair.kind === "part_installed" || state.repair.kind === "hood_closed_repaired") ? state.repair.part : null));

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

      <group visible={driverOut}>
      <mesh position={[...BAY.TOOLBOX.POSITION]} castShadow>
        <boxGeometry args={[...BAY.TOOLBOX.SIZE]} />
        <meshStandardMaterial color={PALETTE.steeringHub} flatShading />
      </mesh>
      <group visible={!holding}>
        <Interactable spec={tool}>
          <group position={[...BAY.TOOL_POSITION]}>
            <Wrench />
          </group>
        </Interactable>
      </group>

      <group visible={spareFitted !== "radiator_hose"}>
      <Interactable spec={spares.radiator_hose}>
        <mesh position={spareSlot(0)} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
          <meshStandardMaterial color="#3ca55c" flatShading />
        </mesh>
      </Interactable>
      </group>
      <group visible={spareFitted !== "spark_plug"}>
      <Interactable spec={spares.spark_plug}>
        <mesh position={spareSlot(1)}>
          <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
          <meshStandardMaterial color="#d9b23c" flatShading />
        </mesh>
      </Interactable>
      </group>
      <group visible={spareFitted !== "drive_belt"}>
      <Interactable spec={spares.drive_belt}>
        <mesh position={spareSlot(2)} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.12, 0.025, 6, 14]} />
          <meshStandardMaterial color="#2f5fb3" flatShading />
        </mesh>
      </Interactable>
      </group>

      <Interactable spec={water}>
        <mesh position={[...BAY.WATER_BOTTLE.POSITION]}>
          <cylinderGeometry args={[BAY.WATER_BOTTLE.RADIUS, BAY.WATER_BOTTLE.RADIUS, BAY.WATER_BOTTLE.HEIGHT, 10]} />
          <meshStandardMaterial color="#6fb4e8" flatShading />
        </mesh>
      </Interactable>

      </group>
      <group visible={hoodOpen}>
      <Interactable spec={cap}>
        <mesh position={[...BAY.CAP.POSITION]}>
          <cylinderGeometry args={[BAY.CAP.RADIUS, BAY.CAP.RADIUS, BAY.CAP.HEIGHT, 10]} />
          <meshStandardMaterial color={PALETTE.carBodyDark} flatShading />
        </mesh>
      </Interactable>
      </group>

      <Interactable spec={ignition}>
        <mesh position={[...BAY.IGNITION_POSITION]}>
          <boxGeometry args={[...BAY.IGNITION_SIZE]} />
          <meshStandardMaterial color={PALETTE.carBody} flatShading />
        </mesh>
      </Interactable>
    </group>
  );
}
