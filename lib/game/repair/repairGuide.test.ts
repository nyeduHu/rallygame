// lib/game/repair/repairGuide.test.ts
import { describe, expect, it } from "vitest";
import { initialRefuel } from "../refuel/refuelMachine";
import { refuelGuide, repairGuide, type GuideInput } from "./repairGuide";

const BASE: GuideInput = { engineStatus: "failed", brokenPart: "spark_plug", repair: { kind: "idle" }, hoodOpen: false, onFoot: false };

describe("repair guide", () => {
  it("shows nothing for a healthy car", () => {
    expect(repairGuide({ ...BASE, engineStatus: "ok", brokenPart: null })).toBeNull();
  });

  it("walks the part repair step by step and tracks the wrench", () => {
    expect(repairGuide(BASE)?.current).toBe(0);
    expect(repairGuide({ ...BASE, onFoot: true })?.current).toBe(1);
    expect(repairGuide({ ...BASE, onFoot: true, hoodOpen: true, repair: { kind: "hood_open" } })?.current).toBe(2);
    expect(repairGuide({ ...BASE, onFoot: true, hoodOpen: true, repair: { kind: "diagnosed", part: "spark_plug" } })?.current).toBe(3);
    const holding = repairGuide({ ...BASE, onFoot: true, hoodOpen: true, repair: { kind: "tool_in_hand", part: "spark_plug" } });
    expect(holding?.current).toBe(4);
    expect(holding?.chips.find((chip) => chip.label.startsWith("Wrench"))).toEqual({ label: "Wrench in hand", on: true });
    const fitted = repairGuide({ ...BASE, onFoot: true, hoodOpen: true, repair: { kind: "part_installed", part: "spark_plug" } });
    expect(fitted?.current).toBe(6);
    expect(fitted?.chips.find((chip) => chip.label.startsWith("Wrench"))?.on).toBe(false);
    expect(repairGuide({ ...BASE, repair: { kind: "hood_closed_repaired", part: "spark_plug" } })?.current).toBe(7);
  });

  it("guides the cooling flow for an overheated engine", () => {
    const base = { ...BASE, engineStatus: "overheating" as const, brokenPart: null };
    expect(repairGuide(base)?.title).toMatch(/overheating/);
    expect(repairGuide({ ...base, onFoot: true, hoodOpen: true, repair: { kind: "cap_off" } })?.current).toBe(3);
    expect(repairGuide({ ...base, onFoot: true, hoodOpen: true, repair: { kind: "cap_watered" } })?.current).toBe(4);
    expect(repairGuide({ ...base, engineStatus: "ok", hoodOpen: true, repair: { kind: "hood_open" } })?.current).toBe(5);
    expect(repairGuide({ ...base, engineStatus: "ok", repair: { kind: "hood_closed" } })).toBeNull();
  });

  it("guides refuelling from the flap to the drive-off", () => {
    const input = { pitActive: true, refuel: initialRefuel(), fuel01: 0.3, onFoot: true };
    expect(refuelGuide({ ...input, pitActive: false })).toBeNull();
    expect(refuelGuide(input)?.current).toBe(1);
    expect(refuelGuide({ ...input, refuel: { kind: "idle", flapOpen: true } })?.current).toBe(2);
    expect(refuelGuide({ ...input, refuel: { kind: "hose_held", flapOpen: true } })?.current).toBe(3);
    expect(refuelGuide({ ...input, refuel: { kind: "connected", flapOpen: true } })?.current).toBe(4);
    expect(refuelGuide({ ...input, refuel: { kind: "fueling", flapOpen: true } })?.current).toBe(5);
    expect(refuelGuide({ ...input, refuel: { kind: "connected", flapOpen: true }, fuel01: 0.95 })?.current).toBe(6);
  });
});
