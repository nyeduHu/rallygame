// lib/game/tuning.test.ts
import { describe, expect, test } from "vitest";
import { TIRE } from "./constants";
import { getActiveTuning, getTuningSnapshot, listTuningFields, setTuningEnabled, setTuningValue } from "./tuning";

describe("vehicle tuning", () => {
  /**
   * Confirms nested numeric settings are exposed as unique, editable field paths.
   */
  function listsNestedNumericFields(): void {
    const fields = listTuningFields();
    const ids = fields.map((field) => field.id);

    expect(ids).toHaveLength(86);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("VEHICLE.CHASSIS_HALF_EXTENTS.x");
    expect(ids).toContain("DRIVETRAIN.TORQUE_CURVE.0.0");
    expect(ids).toContain("DRIVETRAIN.GEAR_RATIOS.0");
  }

  /**
   * Ensures edits stay in the cloned object and reject unknown or invalid values.
   */
  function updatesOnlyKnownFields(): void {
    const originalGrip = TIRE.FRONT_GRIP;
    const field = listTuningFields().find((candidate) => candidate.id === "TIRE.FRONT_GRIP");
    if (!field) throw new Error("Expected front grip to be available for tuning");

    expect(setTuningValue(field.id, originalGrip + 0.2)).toBe(true);
    expect(listTuningFields().find((candidate) => candidate.id === field.id)?.value).toBe(originalGrip + 0.2);
    expect(TIRE.FRONT_GRIP).toBe(originalGrip);
    expect(setTuningValue("TIRE.UNKNOWN", 0.5)).toBe(false);
    expect(setTuningValue(field.id, Number.NaN)).toBe(false);
    expect(setTuningValue(field.id, originalGrip)).toBe(true);
  }

  /**
   * Confirms non-development environments keep using the original constants.
   */
  function keepsDefaultsOutsideDevelopment(): void {
    setTuningEnabled(true);
    expect(getActiveTuning().TIRE.FRONT_GRIP).toBe(TIRE.FRONT_GRIP);
    setTuningEnabled(false);
  }

  /**
   * Confirms exported snapshots are detached from mutable tuning state.
   */
  function clonesSnapshot(): void {
    const snapshot = getTuningSnapshot();
    const candidate = Reflect.get(snapshot.TIRE, "FRONT_GRIP");

    expect(candidate).toBe(listTuningFields().find((field) => field.id === "TIRE.FRONT_GRIP")?.value);
    expect(snapshot).not.toBe(getTuningSnapshot());
  }

  test("lists nested numeric fields", listsNestedNumericFields);
  test("updates only known finite values", updatesOnlyKnownFields);
  test("keeps default constants outside development", keepsDefaultsOutsideDevelopment);
  test("returns detached snapshots", clonesSnapshot);
});
