// lib/game/tuning.ts
import { DRIVETRAIN, STEERING, TIRE, VEHICLE } from "./constants";

const DEFAULT_TUNING = { VEHICLE, TIRE, DRIVETRAIN, STEERING };
const TUNING_GROUPS = ["VEHICLE", "TIRE", "DRIVETRAIN", "STEERING"] as const;

/** Mutable copy of the driving constants; edits never modify DEFAULT_TUNING. */
export type TuningConfig = typeof DEFAULT_TUNING;

/** One editable numeric setting shown by the development tuning panel. */
export interface TuningField {
  id: string;
  group: TuningGroup;
  label: string;
  value: number;
}

/** Constant groups supported by the tuning panel. */
export type TuningGroup = (typeof TUNING_GROUPS)[number];

/** Copy of the vehicle tuning constants that the development panel may edit. */
export const tuning: TuningConfig = structuredClone(DEFAULT_TUNING);

const TUNING_GROUP_VALUES: Record<TuningGroup, object> = {
  VEHICLE: tuning.VEHICLE,
  TIRE: tuning.TIRE,
  DRIVETRAIN: tuning.DRIVETRAIN,
  STEERING: tuning.STEERING,
};

let tuningEnabled = false;

/**
 * Selects whether the physics uses editable values or the original constants.
 * @param enabled - True only while the development panel is active.
 */
export function setTuningEnabled(enabled: boolean): void {
  tuningEnabled = process.env.NODE_ENV !== "production" && enabled;
}

/**
 * Returns the selected vehicle configuration without allocating in hot paths.
 * @returns Active mutable tuning or the original constants.
 */
export function getActiveTuning(): TuningConfig {
  return tuningEnabled ? tuning : DEFAULT_TUNING;
}

/**
 * Flattens numeric tuning leaves into stable paths for form rendering.
 * @returns A snapshot of all editable numeric values.
 */
export function listTuningFields(): TuningField[] {
  const fields: TuningField[] = [];
  for (const group of TUNING_GROUPS) appendTuningFields(group, TUNING_GROUP_VALUES[group], [], fields);
  return fields;
}

/**
 * Updates one existing numeric tuning field after validating its path.
 * @param id - Dotted group and property path from listTuningFields.
 * @param value - Finite replacement value.
 * @returns Whether an existing field was updated.
 */
export function setTuningValue(id: string, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const [groupName, ...path] = id.split(".");
  if (!isTuningGroup(groupName) || path.length === 0) return false;

  let parent: object = TUNING_GROUP_VALUES[groupName];
  for (const segment of path.slice(0, -1)) {
    if (!Object.prototype.hasOwnProperty.call(parent, segment)) return false;
    const child: unknown = Reflect.get(parent, segment);
    if (typeof child !== "object" || child === null) return false;
    parent = child;
  }

  const key = path[path.length - 1];
  if (!Object.prototype.hasOwnProperty.call(parent, key)) return false;
  const current: unknown = Reflect.get(parent, key);
  if (typeof current !== "number") return false;
  return Reflect.set(parent, key, value);
}

/**
 * Returns a detached copy for copying or inspecting the current tuning values.
 * @returns Deep clone of all editable tuning groups.
 */
export function getTuningSnapshot(): TuningConfig {
  return structuredClone(tuning);
}

/**
 * Adds numeric leaves from a nested settings object to the editable field list.
 * @param group - Display group.
 * @param target - Object or array to inspect.
 * @param prefix - Property path accumulated so far.
 * @param fields - Output list mutated by this traversal.
 */
function appendTuningFields(group: TuningGroup, target: object, prefix: string[], fields: TuningField[]): void {
  for (const key of Object.keys(target)) {
    const value: unknown = Reflect.get(target, key);
    const path = [...prefix, key];
    if (typeof value === "number") {
      const id = `${group}.${path.join(".")}`;
      fields.push({ id, group, label: id, value });
    } else if (typeof value === "object" && value !== null) {
      appendTuningFields(group, value, path, fields);
    }
  }
}

/**
 * Narrows an untrusted group segment to one of the supported configuration groups.
 * @param value - Candidate group name.
 * @returns True when value names a tuning group.
 */
function isTuningGroup(value: string): value is TuningGroup {
  return TUNING_GROUPS.some((group) => group === value);
}
