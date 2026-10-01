// lib/game/race/checkpointLogic.ts
import { GATES } from "../constants";

/** Larger jumps than this are resets or leg-hopping, never real driving within one step. */
export const MAX_PROGRESS_JUMP = 25;

/** Progress state advanced by {@link stepCheckpoints}. */
export interface CheckpointState {
  progressS: number;
  nextCheckpoint: number;
  finished: boolean;
}

/** Event produced when a step crosses a gate. */
export interface CheckpointEvent {
  kind: "checkpoint" | "finish";
  /** Checkpoint index crossed (finish uses the checkpoint count). */
  index: number;
}

/**
 * Advances ordered-checkpoint progress from one road projection. Shared by the client
 * RaceTracker and the authoritative server so both agree on gate crossings.
 * @param state - Current progress state.
 * @param s - Projected arc length of the car.
 * @param lateral - Signed lateral offset from the centreline.
 * @param checkpointS - Ordered checkpoint arc lengths.
 * @param finishS - Finish line arc length.
 * @returns The next state and the gate event, if one was crossed.
 */
export function stepCheckpoints(
  state: CheckpointState,
  s: number,
  lateral: number,
  checkpointS: ReadonlyArray<number>,
  finishS: number,
): { state: CheckpointState; event: CheckpointEvent | null } {
  if (state.finished || Math.abs(s - state.progressS) > MAX_PROGRESS_JUMP) {
    return { state, event: null };
  }
  const previous = state.progressS;
  const advanced: CheckpointState = { ...state, progressS: s };
  if (Math.abs(lateral) > GATES.DETECTION_HALF_WIDTH) return { state: advanced, event: null };

  if (state.nextCheckpoint < checkpointS.length) {
    const gate = checkpointS[state.nextCheckpoint];
    if (previous < gate && s >= gate) {
      return {
        state: { ...advanced, nextCheckpoint: state.nextCheckpoint + 1 },
        event: { kind: "checkpoint", index: state.nextCheckpoint },
      };
    }
    return { state: advanced, event: null };
  }
  if (previous < finishS && s >= finishS) {
    return { state: { ...advanced, finished: true }, event: { kind: "finish", index: checkpointS.length } };
  }
  return { state: advanced, event: null };
}
