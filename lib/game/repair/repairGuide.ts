// lib/game/repair/repairGuide.ts
import { PIT, REFUEL } from "../constants";
import type { RefuelState } from "../refuel/refuelMachine";
import type { EngineStatus, BrokenPart } from "../vehicle/mechanics";
import type { RepairState } from "./repairMachine";

/** Plain-language names of the parts. */
export const PART_NAMES: Readonly<Record<BrokenPart, string>> = {
  radiator_hose: "radiator hose",
  spark_plug: "spark plugs",
  drive_belt: "drive belt",
};

/** A checklist shown on screen while something needs fixing. */
export interface Guide {
  title: string;
  /** Every step in order. */
  steps: string[];
  /** Index of the step to do now. */
  current: number;
  /** Small status chips (hood, wrench, part). */
  chips: Array<{ label: string; on: boolean }>;
}

/** What the guide needs to know. */
export interface GuideInput {
  engineStatus: EngineStatus;
  brokenPart: BrokenPart | null;
  repair: RepairState;
  hoodOpen: boolean;
  /** Someone is standing outside the car. */
  onFoot: boolean;
}

const PART_STEPS = [
  "Stop the car, then press F to get out",
  "Open the hood: hold E on the latch at the front of the car",
  "Find the broken part: look at an engine part and press E to inspect it (a wrong guess costs time)",
  "Grab the wrench from the toolbox (E)",
  "Take the broken part out with the wrench (E on the part)",
  "Fit the matching new part from the tray beside the toolbox (E)",
  "Close the hood: hold E on the latch",
  "Press F to get back in, then press the ignition button on the dash (E)",
] as const;

const COOL_STEPS = [
  "Stop the car, then press F to get out",
  "Open the hood: hold E on the latch at the front of the car",
  "Unscrew the radiator cap (E on the cap)",
  "Pour water in: hold E on the water bottle until it is empty",
  "Screw the radiator cap back on (E)",
  "Close the hood (hold E on the latch) and press F to get back in",
] as const;

const REFUEL_STEPS = [
  "Stop in the pit box, then press F to get out (co-driver)",
  "Open the fuel flap on the car (E on the flap)",
  "Grab the fuel hose at the pump (E)",
  "Connect the hose to the open flap (E on the flap)",
  "Press the pump lever to start fuelling (E)",
  "Press the lever again to stop at a full tank, never overflow (E)",
  "Disconnect the hose (E on the flap), return it to the pump (E)",
  "Close the flap (E), press F to get back in and go",
] as const;

/** @returns True once the repair has reached or passed `kind` in the part-failure sequence. */
function atLeast(repair: RepairState, kinds: ReadonlyArray<RepairState["kind"]>): boolean {
  return kinds.includes(repair.kind);
}

/**
 * Builds the repair checklist for the current fault, or null when nothing needs fixing.
 * @param input - Engine, repair and position state.
 * @returns The guide, or null.
 */
export function repairGuide(input: GuideInput): Guide | null {
  const { engineStatus, brokenPart, repair, hoodOpen, onFoot } = input;
  const faulty = engineStatus !== "ok";
  const coolingFlow = repair.kind === "cap_off" || repair.kind === "cap_watered";
  if (!faulty && !coolingFlow && repair.kind !== "hood_closed_repaired" && !(hoodOpen && repair.kind !== "idle")) return null;

  if (brokenPart !== null || atLeast(repair, ["diagnosed", "tool_in_hand", "part_removed", "part_installed", "hood_closed_repaired"])) {
    let current = 0;
    if (onFoot) current = 1;
    if (hoodOpen) current = 2;
    if (atLeast(repair, ["diagnosed"])) current = 3;
    if (atLeast(repair, ["tool_in_hand"])) current = 4;
    if (atLeast(repair, ["part_removed"])) current = 5;
    if (atLeast(repair, ["part_installed"])) current = 6;
    if (atLeast(repair, ["hood_closed_repaired"])) current = 7;
    const holding = atLeast(repair, ["tool_in_hand", "part_removed"]);
    return {
      title: brokenPart ? `Fix the ${PART_NAMES[brokenPart]}` : "Finish the repair",
      steps: [...PART_STEPS],
      current,
      chips: [
        { label: hoodOpen ? "Hood open" : "Hood closed", on: hoodOpen },
        { label: holding ? "Wrench in hand" : "Wrench in toolbox", on: holding },
        { label: atLeast(repair, ["part_installed", "hood_closed_repaired"]) ? "New part fitted" : atLeast(repair, ["part_removed"]) ? "Part removed" : "Part broken", on: atLeast(repair, ["part_installed", "hood_closed_repaired"]) },
      ],
    };
  }

  let current = 0;
  if (onFoot) current = 1;
  if (hoodOpen) current = 2;
  if (repair.kind === "cap_off") current = 3;
  if (repair.kind === "cap_watered") current = 4;
  if (!faulty && hoodOpen && repair.kind === "hood_open") current = 5;
  return {
    title: engineStatus === "failed" ? "Engine failed: cool it down" : "Engine overheating: cool it down",
    steps: [...COOL_STEPS],
    current,
    chips: [{ label: hoodOpen ? "Hood open" : "Hood closed", on: hoodOpen }],
  };
}

/** What the pit guide needs to know. */
export interface PitGuideInput {
  pitActive: boolean;
  refuel: RefuelState;
  fuel01: number;
  onFoot: boolean;
}

/**
 * Builds the refuelling checklist while the team is in the pit.
 * @param input - Pit, refuel and fuel state.
 * @returns The guide, or null outside the pit.
 */
export function refuelGuide(input: PitGuideInput): Guide | null {
  if (!input.pitActive) return null;
  const { refuel, fuel01, onFoot } = input;
  const full = fuel01 >= PIT.MIN_FUEL_TO_RELEASE;
  let current = 0;
  if (onFoot) current = refuel.flapOpen ? 2 : 1;
  if (refuel.kind === "hose_held") current = refuel.flapOpen ? 3 : 1;
  if (refuel.kind === "connected") current = full ? 6 : 4;
  if (refuel.kind === "fueling") current = 5;
  if (refuel.kind === "hose_held" && full) current = 6;
  if (refuel.kind === "idle" && full && onFoot) current = 7;
  return {
    title: full ? "Tank full: wrap up and go" : `Refuel: fill the tank to ${Math.round(PIT.MIN_FUEL_TO_RELEASE * REFUEL.TANK_LITRES)}%`,
    steps: [...REFUEL_STEPS],
    current,
    chips: [
      { label: refuel.flapOpen ? "Flap open" : "Flap closed", on: refuel.flapOpen },
      { label: refuel.kind === "idle" ? "Hose at pump" : refuel.kind === "hose_held" ? "Hose in hand" : "Hose connected", on: refuel.kind !== "idle" },
      { label: `Fuel ${Math.round(fuel01 * REFUEL.TANK_LITRES)}%`, on: full },
    ],
  };
}

