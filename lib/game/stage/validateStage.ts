// lib/game/stage/validateStage.ts
import { CHECKPOINT, DIFFICULTY, NETWORK, PACE_NOTES, ROAD } from "../constants";
import { generatePaceNotes } from "./paceNotes";
import { placePit } from "./pitStop";
import type { RoadBranch, StageData } from "./types";

/** The parts of a stage the validators need (available before terrain and props exist). */
export type StageCandidate = Pick<StageData, "samples" | "corners" | "startS" | "finishS" | "checkpointS" | "length">;

export interface Check {
  ok: boolean;
  reason?: string;
}

const PASS: Check = { ok: true };

/** @returns A failing check with a reason. */
function fail(reason: string): Check {
  return { ok: false, reason };
}

/** Road samples must be continuous so start and finish are connected. */
export function startFinishConnected(stage: StageCandidate): Check {
  const limit = ROAD.SAMPLE_SPACING * 1.5;
  for (let i = 1; i < stage.samples.length; i++) {
    const a = stage.samples[i - 1];
    const b = stage.samples[i];
    if (Math.hypot(b.x - a.x, b.z - a.z) > limit) return fail(`gap in road at sample ${i}`);
  }
  return stage.finishS > stage.startS ? PASS : fail("finish before start");
}

/** No corner tighter than the minimum radius, no overlaps, and drivable straights between corners. */
export function noImpossibleTurns(stage: StageCandidate): Check {
  const corners = [...stage.corners].sort((a, b) => a.startS - b.startS);
  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i];
    if (corner.radius < ROAD.MIN_RADIUS) return fail(`corner ${i} radius ${corner.radius.toFixed(1)} below minimum`);
    const next = corners[i + 1];
    if (!next) continue;
    const gap = next.startS - corner.endS;
    if (gap < 0) return fail(`corners ${i} and ${i + 1} overlap`);
    // Short links are deliberate corner sequences ("tightens"/"opens"); full straights keep the larger minimum.
    if (gap < ROAD.MIN_LINK_STRAIGHT) return fail(`link between corners ${i} and ${i + 1} too short`);
  }
  return PASS;
}

/** Distant road sections stay apart so the stage never crosses itself. */
export function noOverlap(stage: StageCandidate): Check {
  const minSq = ROAD.MIN_SEPARATION * ROAD.MIN_SEPARATION;
  const { samples } = stage;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      if (samples[j].s - samples[i].s < ROAD.SEPARATION_ARC_EXEMPT) continue;
      const dx = samples[i].x - samples[j].x;
      const dz = samples[i].z - samples[j].z;
      if (dx * dx + dz * dz < minSq) return fail(`road sections ${i} and ${j} too close`);
    }
  }
  return PASS;
}

/** Checkpoints increase, are spaced sensibly and keep clear of hairpin apexes. */
export function checkpointsReachable(stage: StageCandidate): Check {
  let previous = stage.startS;
  for (const [i, s] of stage.checkpointS.entries()) {
    const spacing = s - previous;
    if (spacing < CHECKPOINT.MIN_SPACING || spacing > CHECKPOINT.MAX_SPACING) return fail(`checkpoint ${i} spacing ${spacing.toFixed(0)}`);
    for (const corner of stage.corners) {
      if (corner.classId === "hairpin" && Math.abs(s - corner.apexS) < CHECKPOINT.MIN_DISTANCE_FROM_HAIRPIN_APEX) {
        return fail(`checkpoint ${i} on a hairpin apex`);
      }
    }
    previous = s;
  }
  return stage.finishS - previous >= CHECKPOINT.MIN_SPACING ? PASS : fail("last checkpoint too close to finish");
}

/** Every corner has one short, speakable note and the notes are not too dense. */
export function readableFromNotes(stage: StageCandidate): Check {
  const notes = generatePaceNotes(stage);
  const cornerNotes = notes.filter((note) => note.kind !== "straight" && note.kind !== "finish" && note.kind !== "junction");
  if (cornerNotes.length !== stage.corners.length) return fail("note count differs from corner count");
  for (const note of notes) {
    if (note.text.length > PACE_NOTES.MAX_TEXT_LENGTH) return fail(`note "${note.text}" too long`);
  }
  for (const note of notes) {
    const windowNotes = notes.filter((other) => other.atS >= note.atS && other.atS < note.atS + 100).length;
    if (windowNotes > PACE_NOTES.MAX_NOTES_PER_100M) return fail(`too many notes near ${note.atS.toFixed(0)} m`);
  }
  return PASS;
}

/**
 * Sum of corner severity weights, the difficulty score.
 * @param stage - Candidate stage.
 * @returns Score.
 */
export function difficultyScore(stage: StageCandidate): number {
  return stage.corners.reduce((sum, corner) => sum + DIFFICULTY.SEVERITY_WEIGHT[corner.classId], 0);
}

/** Difficulty must sit inside the stage's window; stage 0 also forbids close hairpins. */
export function fairDifficulty(stage: StageCandidate, stageIndex = 0): Check {
  const window = DIFFICULTY.STAGE[Math.min(stageIndex, DIFFICULTY.STAGE.length - 1)];
  const score = difficultyScore(stage);
  if (score < window.min || score > window.max) return fail(`difficulty ${score} outside ${window.min}..${window.max}`);
  if (stageIndex === 0) {
    const hairpins = stage.corners.filter((corner) => corner.classId === "hairpin").sort((a, b) => a.apexS - b.apexS);
    for (let i = 1; i < hairpins.length; i++) {
      if (hairpins[i].apexS - hairpins[i - 1].apexS < DIFFICULTY.STAGE0_HAIRPIN_SPACING) return fail("two hairpins too close for stage 0");
    }
  }
  return PASS;
}

/** Every stage has at least one alternative route and one dead end, and no gate sits in a fork. */
export function networkFair(stage: StageCandidate & { branches: ReadonlyArray<RoadBranch> }): Check {
  if (!stage.branches.some((branch) => branch.kind === "alternative")) return fail("no alternative route");
  if (!stage.branches.some((branch) => branch.kind === "dead_end")) return fail("no dead end");
  const gates = [stage.startS, ...stage.checkpointS, stage.finishS];
  for (const branch of stage.branches) {
    const from = branch.forkS - NETWORK.FORK_GATE_CLEARANCE_M;
    const to = (branch.joinS ?? branch.forkS) + NETWORK.FORK_GATE_CLEARANCE_M;
    if (gates.some((gate) => gate > from && gate < to)) return fail(`gate inside fork ${branch.id}`);
  }
  return PASS;
}

/** A pit box must fit on the road. */
export function pitFits(stage: StageCandidate): Check {
  return placePit(stage.samples, stage.corners, stage.startS, stage.finishS) ? PASS : fail("no room for a pit box");
}

/** All checks, in the order they are evaluated. */
export const STAGE_CHECKS: ReadonlyArray<{ name: string; run: (stage: StageCandidate, stageIndex: number) => Check }> = [
  { name: "startFinishConnected", run: (stage) => startFinishConnected(stage) },
  { name: "noImpossibleTurns", run: (stage) => noImpossibleTurns(stage) },
  { name: "noOverlap", run: (stage) => noOverlap(stage) },
  { name: "checkpointsReachable", run: (stage) => checkpointsReachable(stage) },
  { name: "readableFromNotes", run: (stage) => readableFromNotes(stage) },
  { name: "fairDifficulty", run: (stage, stageIndex) => fairDifficulty(stage, stageIndex) },
  { name: "pitFits", run: (stage) => pitFits(stage) },
];

/**
 * Runs every check and returns the first failure.
 * @param stage - Candidate stage.
 * @param stageIndex - Stage number (0 = tutorial).
 * @returns Failing check name and reason, or ok.
 */
export function validateCandidate(stage: StageCandidate, stageIndex = 0): { ok: boolean; failed?: string; reason?: string } {
  for (const check of STAGE_CHECKS) {
    const result = check.run(stage, stageIndex);
    if (!result.ok) return { ok: false, failed: check.name, reason: result.reason };
  }
  return { ok: true };
}
