// lib/game/repair/repairMachine.test.ts
import { describe, expect, it } from "vitest";
import { REPAIR } from "../constants";
import { applyStep, REPAIR_STATE_KINDS, settle, type RepairContext, type RepairState, type RepairStep, type RepairStepName } from "./repairMachine";

const PART = "drive_belt" as const;
const CTX: RepairContext = { engineStatus: "failed", brokenPart: PART };

/** One representative state for each kind. */
const STATES: Record<RepairState["kind"], RepairState> = {
  idle: { kind: "idle" },
  hood_closed: { kind: "hood_closed" },
  hood_open: { kind: "hood_open" },
  diagnosed: { kind: "diagnosed", part: PART },
  tool_in_hand: { kind: "tool_in_hand", part: PART },
  part_removed: { kind: "part_removed", part: PART },
  part_installed: { kind: "part_installed", part: PART },
  hood_closed_repaired: { kind: "hood_closed_repaired", part: PART },
  cap_off: { kind: "cap_off" },
  cap_watered: { kind: "cap_watered" },
  restarted: { kind: "restarted" },
};

/** The legal steps for each state (the happy path edges). */
const LEGAL: Record<RepairState["kind"], RepairStep[]> = {
  idle: [{ step: "OPEN_HOOD" }],
  hood_closed: [{ step: "OPEN_HOOD" }],
  hood_open: [{ step: "INSPECT", partId: PART }, { step: "UNSCREW_CAP" }, { step: "CLOSE_HOOD" }],
  diagnosed: [{ step: "GRAB_TOOL" }],
  tool_in_hand: [{ step: "REMOVE_PART", partId: PART }],
  part_removed: [{ step: "INSTALL_NEW", partId: PART }],
  part_installed: [{ step: "CLOSE_HOOD" }],
  hood_closed_repaired: [{ step: "IGNITION" }],
  cap_off: [{ step: "POUR_WATER" }],
  cap_watered: [{ step: "SCREW_CAP" }],
  restarted: [],
};

const ALL_STEPS: RepairStepName[] = [
  "OPEN_HOOD", "INSPECT", "GRAB_TOOL", "REMOVE_PART", "INSTALL_NEW", "CLOSE_HOOD", "IGNITION", "UNSCREW_CAP", "POUR_WATER", "SCREW_CAP",
];

describe("repair machine", () => {
  it("accepts every legal transition", () => {
    for (const kind of REPAIR_STATE_KINDS) {
      for (const step of LEGAL[kind]) {
        expect(applyStep(STATES[kind], step, CTX).ok, `${kind} + ${step.step}`).toBe(true);
      }
    }
  });

  it("rejects at least three illegal steps from every state without advancing", () => {
    for (const kind of REPAIR_STATE_KINDS) {
      const legalNames = new Set(LEGAL[kind].map((s) => s.step));
      const illegal = ALL_STEPS.filter((name) => !legalNames.has(name)).slice(0, 3);
      expect(illegal.length).toBe(3);
      for (const name of illegal) {
        const result = applyStep(STATES[kind], { step: name, partId: PART }, CTX);
        expect(result.ok, `${kind} + ${name}`).toBe(false);
      }
    }
  });

  it("walks the full repair and ends restarted, then settles to idle", () => {
    let state: RepairState = { kind: "hood_closed" };
    const steps: RepairStep[] = [
      { step: "OPEN_HOOD" }, { step: "INSPECT", partId: PART }, { step: "GRAB_TOOL" }, { step: "REMOVE_PART", partId: PART },
      { step: "INSTALL_NEW", partId: PART }, { step: "CLOSE_HOOD" }, { step: "IGNITION" },
    ];
    for (const step of steps) {
      const result = applyStep(state, step, CTX);
      if (!result.ok) throw new Error(`${step.step} rejected`);
      state = result.state;
    }
    expect(state.kind).toBe("restarted");
    expect(settle(state).kind).toBe("idle");
  });

  it("charges wrong guesses and wrong replacement parts without advancing", () => {
    const guess = applyStep(STATES.hood_open, { step: "INSPECT", partId: "spark_plug" }, CTX);
    expect(guess.ok && guess.state.kind).toBe("hood_open");
    expect(guess.ok && guess.penaltySeconds).toBe(REPAIR.WRONG_GUESS_SECONDS);
    const wrong = applyStep(STATES.part_removed, { step: "INSTALL_NEW", partId: "spark_plug" }, CTX);
    expect(wrong.ok && wrong.state.kind).toBe("part_removed");
    expect(wrong.ok && wrong.penaltySeconds).toBe(REPAIR.WRONG_PART_SECONDS);
    expect(applyStep(STATES.tool_in_hand, { step: "REMOVE_PART", partId: "spark_plug" }, CTX).ok).toBe(false);
  });

  it("will not open the hood for a healthy engine", () => {
    const result = applyStep(STATES.idle, { step: "OPEN_HOOD" }, { engineStatus: "ok", brokenPart: null });
    expect(result).toEqual({ ok: false, error: "no_fault" });
  });

  it("cooling path ends with a cooled effect", () => {
    let state: RepairState = STATES.hood_open;
    for (const step of ["UNSCREW_CAP", "POUR_WATER", "SCREW_CAP"] as const) {
      const result = applyStep(state, { step }, { engineStatus: "overheating", brokenPart: null });
      if (!result.ok) throw new Error(step);
      state = result.state;
      if (step === "SCREW_CAP") expect(result.effect).toBe("cooled");
    }
    expect(state.kind).toBe("hood_open");
  });
});
