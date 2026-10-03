// lib/game/stage/validateStage.ts
import { CHECKPOINT, DIFFICULTY, ROAD, ROAD_NETWORK } from "../constants";
import { placePit, type Interval } from "./pitStop";
import type { RoadBranch, StageData } from "./types";

/** The parts of a stage the validators need (available before terrain and props exist). */
export type StageCandidate = Pick<StageData, "samples" | "corners" | "startS" | "finishS" | "checkpointS" | "length"> & {
  /** Side roads, when the stage is a road network. */
  branches?: ReadonlyArray<RoadBranch>;
  /** Stretches of the route the pit must avoid. */
  zones?: ReadonlyArray<Interval>;
};

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

/** Enough dead ends and loops to make choosing a road matter, and a sensible route length. */
export function networkFair(stage: StageCandidate): Check {
  const roads = stage.branches ?? [];
  const deadEnds = roads.filter((road) => road.pendant.some((p) => p > 0)).length;
  const loops = roads.filter((road) => road.loops && road.pendant.every((p) => p === 0)).length;
  if (deadEnds < ROAD_NETWORK.MIN_DEAD_ENDS) return fail(`only ${deadEnds} dead ends`);
  if (loops < ROAD_NETWORK.MIN_ROUTE_LOOPS) return fail(`only ${loops} route loops`);
  if (stage.length < ROAD_NETWORK.MIN_SOLUTION_M || stage.length > ROAD_NETWORK.MAX_SOLUTION_M) return fail(`route length ${stage.length.toFixed(0)} m`);
  return PASS;
}

/** A pit box must fit on the road. */
export function pitFits(stage: StageCandidate): Check {
  return placePit(stage.samples, stage.corners, stage.startS, stage.finishS, stage.zones) ? PASS : fail("no room for a pit box");
}

/** All checks, in the order they are evaluated. */
export const STAGE_CHECKS: ReadonlyArray<{ name: string; run: (stage: StageCandidate, stageIndex: number) => Check }> = [
  { name: "startFinishConnected", run: (stage) => startFinishConnected(stage) },
  { name: "noImpossibleTurns", run: (stage) => noImpossibleTurns(stage) },
  { name: "noOverlap", run: (stage) => noOverlap(stage) },
  { name: "checkpointsReachable", run: (stage) => checkpointsReachable(stage) },
  { name: "pitFits", run: (stage) => pitFits(stage) },
  { name: "networkFair", run: (stage) => networkFair(stage) },
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
