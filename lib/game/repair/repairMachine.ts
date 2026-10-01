// lib/game/repair/repairMachine.ts
import { REPAIR } from "../constants";
import type { BrokenPart, EngineStatus } from "../vehicle/mechanics";

/** Repair progress; identical on server and client. */
export type RepairState =
  | { kind: "idle" }
  | { kind: "hood_closed" }
  | { kind: "hood_open" }
  | { kind: "diagnosed"; part: BrokenPart }
  | { kind: "tool_in_hand"; part: BrokenPart }
  | { kind: "part_removed"; part: BrokenPart }
  | { kind: "part_installed"; part: BrokenPart }
  | { kind: "hood_closed_repaired"; part: BrokenPart }
  | { kind: "cap_off" }
  | { kind: "cap_watered" }
  | { kind: "restarted" };

export type RepairStepName =
  | "OPEN_HOOD"
  | "INSPECT"
  | "GRAB_TOOL"
  | "REMOVE_PART"
  | "INSTALL_NEW"
  | "CLOSE_HOOD"
  | "IGNITION"
  | "UNSCREW_CAP"
  | "POUR_WATER"
  | "SCREW_CAP";

/** One repair intent from a client. */
export interface RepairStep {
  step: RepairStepName;
  partId?: BrokenPart;
}

/** What the machine needs to know about the car. */
export interface RepairContext {
  engineStatus: EngineStatus;
  brokenPart: BrokenPart | null;
}

/** Side effects the owner of the machine must apply. */
export type RepairEffect = "hood_open" | "hood_closed" | "engine_restarted" | "cooled" | "none";

export type RepairResult =
  | { ok: true; state: RepairState; effect: RepairEffect; penaltySeconds: number }
  | { ok: false; error: "illegal_step" | "no_fault" | "wrong_part" };

/** @returns A rejection for an out-of-order or invalid step. */
function illegal(): RepairResult {
  return { ok: false, error: "illegal_step" };
}

/**
 * Applies a repair step. Only the legal next step from the current state is accepted; a wrong
 * guess or wrong replacement part keeps the state and costs time.
 * @param state - Current repair state.
 * @param request - Requested step.
 * @param ctx - Current engine status and broken part.
 * @returns New state with effects, or a rejection.
 */
export function applyStep(state: RepairState, request: RepairStep, ctx: RepairContext): RepairResult {
  const ok = (next: RepairState, effect: RepairEffect = "none", penaltySeconds = 0): RepairResult => ({
    ok: true,
    state: next,
    effect,
    penaltySeconds,
  });
  const faulty = ctx.engineStatus !== "ok";

  switch (state.kind) {
    case "idle":
    case "hood_closed":
      if (request.step !== "OPEN_HOOD") return illegal();
      if (!faulty) return { ok: false, error: "no_fault" };
      return ok({ kind: "hood_open" }, "hood_open");
    case "hood_open":
      if (request.step === "INSPECT") {
        if (!ctx.brokenPart || !request.partId) return illegal();
        return request.partId === ctx.brokenPart
          ? ok({ kind: "diagnosed", part: ctx.brokenPart })
          : ok(state, "none", REPAIR.WRONG_GUESS_SECONDS);
      }
      if (request.step === "UNSCREW_CAP") return ok({ kind: "cap_off" });
      if (request.step === "CLOSE_HOOD") return ok({ kind: "hood_closed" }, "hood_closed");
      return illegal();
    case "diagnosed":
      return request.step === "GRAB_TOOL" ? ok({ kind: "tool_in_hand", part: state.part }) : illegal();
    case "tool_in_hand":
      if (request.step !== "REMOVE_PART") return illegal();
      return request.partId === state.part ? ok({ kind: "part_removed", part: state.part }) : { ok: false, error: "wrong_part" };
    case "part_removed":
      if (request.step !== "INSTALL_NEW" || !request.partId) return illegal();
      return request.partId === state.part
        ? ok({ kind: "part_installed", part: state.part })
        : ok(state, "none", REPAIR.WRONG_PART_SECONDS);
    case "part_installed":
      return request.step === "CLOSE_HOOD" ? ok({ kind: "hood_closed_repaired", part: state.part }, "hood_closed") : illegal();
    case "hood_closed_repaired":
      return request.step === "IGNITION" ? ok({ kind: "restarted" }, "engine_restarted") : illegal();
    case "cap_off":
      return request.step === "POUR_WATER" ? ok({ kind: "cap_watered" }) : illegal();
    case "cap_watered":
      return request.step === "SCREW_CAP" ? ok({ kind: "hood_open" }, "cooled") : illegal();
    case "restarted":
      return illegal();
  }
}

/**
 * Collapses a finished repair back to idle so the next fault starts fresh.
 * @param state - Current state.
 * @returns Idle after a restart, otherwise unchanged.
 */
export function settle(state: RepairState): RepairState {
  return state.kind === "restarted" ? { kind: "idle" } : state;
}

/** Every state kind, for exhaustive tests. */
export const REPAIR_STATE_KINDS: ReadonlyArray<RepairState["kind"]> = [
  "idle", "hood_closed", "hood_open", "diagnosed", "tool_in_hand", "part_removed", "part_installed",
  "hood_closed_repaired", "cap_off", "cap_watered", "restarted",
];

/**
 * Rebuilds a repair state from the compact network view.
 * @param view - Snapshot repair view (kind plus optional part).
 * @returns The state, or null when the kind is unknown or a required part is missing.
 */
export function repairStateFromView(view: { kind: string; part?: BrokenPart } | undefined): RepairState | null {
  if (!view) return null;
  switch (view.kind) {
    case "idle":
    case "hood_closed":
    case "hood_open":
    case "cap_off":
    case "cap_watered":
    case "restarted":
      return { kind: view.kind };
    case "diagnosed":
    case "tool_in_hand":
    case "part_removed":
    case "part_installed":
    case "hood_closed_repaired":
      return view.part ? { kind: view.kind, part: view.part } : null;
    default:
      return null;
  }
}
