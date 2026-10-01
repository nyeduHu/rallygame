// lib/game/stage/paceNotes.ts
import { PACE_NOTES } from "../constants";
import { leftVector, poseAt } from "./roadIndex";
import type { CornerInfo, PaceModifier, PaceNote, RoadBranch, RoadSample, StageData } from "./types";

interface PositionedCorner {
  corner: CornerInfo;
  cornerIndex: number;
  atS: number;
  severity: 0 | 1 | 2 | 3 | 4;
  comparisonSeverity: number;
}

interface NoteDraft {
  atS: number;
  kind: PaceNote["kind"];
  direction: PaceNote["direction"];
  severity: PaceNote["severity"];
  modifiers: PaceModifier[];
  cornerIndex: number;
  distanceToNext: number;
  text: string;
}

/**
 * Classifies corner radius into the pace-note scale.
 * @param radius - Corner radius in metres.
 * @returns Severity from 1 (fast) to 4 (tight).
 */
export function severityForRadius(radius: number): 1 | 2 | 3 | 4 {
  for (const band of PACE_NOTES.SEVERITY_BANDS) {
    if (radius >= band.minimumRadius) return band.severity;
  }
  return PACE_NOTES.SEVERITY_BANDS[PACE_NOTES.SEVERITY_BANDS.length - 1].severity;
}

/** A junction call: a side road leaves (or joins) on one side of the road. */
export interface JunctionCall {
  atS: number;
  /** Side the other road is on: 1 = left, -1 = right. */
  direction: 1 | -1;
  /** "Junction" where a road leaves, "Joins" where one merges in. */
  label: "Junction" | "Joins";
}

/** Extra calls and a custom last call for notes along a side road. */
export interface PaceNoteOptions {
  junctions?: ReadonlyArray<JunctionCall>;
  /** Spoken text of the last call (default "finish"). */
  endText?: string;
}

/**
 * Converts generated corner data into deterministic, positioned co-driver calls.
 * @param stage - Generated stage data.
 * @returns Ordered pace calls, including the opening straight and finish.
 */
export function generatePaceNotes(
  stage: Pick<StageData, "corners" | "startS" | "finishS">,
  options: PaceNoteOptions = {},
): PaceNote[] {
  const corners = stage.corners
    .map((corner, cornerIndex): PositionedCorner => {
      const isHairpin = corner.classId === "hairpin";
      const severity = isHairpin ? 0 : severityForRadius(corner.radius);

      return {
        corner,
        cornerIndex,
        atS: corner.startS - PACE_NOTES.CALL_LEAD_METRES,
        severity,
        // Hairpins are the tightest call when comparing adjacent-corner changes.
        comparisonSeverity: isHairpin ? 5 : severity,
      };
    })
    .sort((first, second) => first.atS - second.atS);

  const drafts: NoteDraft[] = [];
  const openingDistance = corners[0]?.atS ?? stage.finishS;
  drafts.push({
    atS: stage.startS,
    kind: "straight",
    direction: 0,
    severity: 0,
    modifiers: [],
    cornerIndex: -1,
    distanceToNext: spokenDistance(openingDistance - stage.startS),
    text: `Straight, ${spokenDistanceText(openingDistance - stage.startS)}`,
  });

  corners.forEach((positioned, index) => {
    const { corner } = positioned;
    const next = corners[index + 1];
    const previous = corners[index - 1];
    const isHairpin = corner.classId === "hairpin";
    const precedingStraightStart = previous?.corner.endS ?? stage.startS;
    const precedingStraight = corner.startS - precedingStraightStart;
    const nextLinkDistance = next ? next.corner.startS - corner.endS : Number.POSITIVE_INFINITY;
    const linkedSameDirection = Boolean(next)
      && nextLinkDistance <= PACE_NOTES.LINK_DISTANCE
      && next?.corner.direction === corner.direction;
    const modifiers: PaceModifier[] = [];

    if (corner.radius * corner.angle >= PACE_NOTES.LONG_ARC_METRES) modifiers.push("long");
    if (linkedSameDirection && next && next.comparisonSeverity > positioned.comparisonSeverity) {
      modifiers.push("tightens");
    } else if (linkedSameDirection && next && next.comparisonSeverity < positioned.comparisonSeverity) {
      modifiers.push("opens");
    }
    if ((corner.classId === "tight" || isHairpin)
      && precedingStraight > PACE_NOTES.CAUTION_STRAIGHT_METRES) {
      modifiers.push("caution");
    }

    drafts.push({
      atS: positioned.atS,
      kind: isHairpin ? "hairpin" : "corner",
      direction: corner.direction,
      severity: positioned.severity,
      modifiers,
      cornerIndex: positioned.cornerIndex,
      distanceToNext: 0,
      text: "",
    });
  });

  for (const junction of options.junctions ?? []) {
    drafts.push({
      atS: junction.atS,
      kind: "junction",
      direction: junction.direction,
      severity: 0,
      modifiers: [],
      cornerIndex: -1,
      distanceToNext: 0,
      text: junction.label,
    });
  }

  drafts.push({
    atS: stage.finishS,
    kind: "finish",
    direction: 0,
    severity: 0,
    modifiers: [],
    cornerIndex: -1,
    distanceToNext: 0,
    text: options.endText ?? "finish",
  });

  drafts.sort((first, second) => first.atS - second.atS);

  return drafts.map((draft, index): PaceNote => {
    const next = drafts[index + 1];
    if (!next) return draft;

    const rawDistance = next.atS - draft.atS;
    const distance = spokenDistance(rawDistance);
    const textDistance = spokenDistanceText(rawDistance);
    draft.distanceToNext = distance;

    if (draft.kind === "straight") {
      draft.text = `Straight, ${textDistance}`;
    } else if (draft.kind === "junction") {
      draft.text = `${draft.text} ${draft.direction === 1 ? "left" : "right"}, ${textDistance}`;
    } else {
      draft.text = formatCornerText(draft, textDistance);
    }
    return draft;
  });
}

/**
 * Rounds a note gap to the configured distance step and enforces the minimum.
 * @param distance - Unrounded distance in metres.
 * @returns Rounded nonzero distance in metres.
 */
function spokenDistance(distance: number): number {
  const rounded = Math.round(distance / PACE_NOTES.DISTANCE_STEP) * PACE_NOTES.DISTANCE_STEP;
  return Math.max(PACE_NOTES.DISTANCE_STEP, rounded);
}

/**
 * Produces the spoken form of an interval, including into and the callout cap.
 * @param distance - Unrounded distance in metres.
 * @returns Spoken distance or the into call.
 */
function spokenDistanceText(distance: number): string {
  const rounded = spokenDistance(distance);
  if (rounded < PACE_NOTES.MIN_SPOKEN_DISTANCE) return "into";
  return String(Math.min(rounded, PACE_NOTES.MAX_SPOKEN_DISTANCE));
}

/**
 * Formats a directional corner call in the project's fixed spoken style.
 * @param note - Corner note draft.
 * @param distanceText - Spoken gap to the next note.
 * @returns Formatted call text.
 */
function formatCornerText(note: NoteDraft, distanceText: string): string {
  const direction = note.direction === 1 ? "Left" : "Right";
  const call = note.kind === "hairpin" ? `Hairpin ${direction.toLowerCase()}` : `${direction} ${note.severity}`;
  const modifiers = note.modifiers.length > 0 ? `, ${note.modifiers.join(", ")}` : "";
  return `${call}${modifiers}, ${distanceText}`;
}

/**
 * Notes for the reference route including a junction call wherever a side road leaves or joins.
 * @param stage - Generated stage.
 * @returns Notes for the main route.
 */
export function generateRouteNotes(stage: Pick<StageData, "corners" | "startS" | "finishS" | "samples" | "branches">): PaceNote[] {
  const junctions: JunctionCall[] = [];
  for (const branch of stage.branches) {
    const leaving = sideOf(stage.samples, branch, "fork");
    junctions.push({ atS: branch.forkS, direction: leaving, label: "Junction" });
    if (branch.joinS !== null) junctions.push({ atS: branch.joinS, direction: sideOf(stage.samples, branch, "join"), label: "Joins" });
  }
  return generatePaceNotes(stage, { junctions });
}

/**
 * Notes for driving along a side road: its own corners, ending with "joins main road" or
 * "road ends".
 * @param branch - The side road.
 * @returns Notes along the branch (local arc length).
 */
export function generateBranchNotes(branch: RoadBranch): PaceNote[] {
  return generatePaceNotes(
    { corners: branch.corners, startS: 0, finishS: branch.length },
    { endText: branch.kind === "alternative" ? "joins main road" : "road ends" },
  );
}

/**
 * Which side of the main road a branch is on at its fork or join.
 * @param samples - Reference samples.
 * @param branch - The branch.
 * @param end - Fork or join end.
 * @returns 1 = left, -1 = right.
 */
function sideOf(samples: ReadonlyArray<RoadSample>, branch: RoadBranch, end: "fork" | "join"): 1 | -1 {
  const s = end === "fork" ? branch.forkS : (branch.joinS ?? branch.forkS);
  const pose = poseAt(samples, s);
  const point = end === "fork" ? branch.samples[Math.min(15, branch.samples.length - 1)] : branch.samples[Math.max(0, branch.samples.length - 16)];
  const [lx, lz] = leftVector(pose.heading);
  return (point.x - pose.x) * lx + (point.z - pose.z) * lz >= 0 ? 1 : -1;
}
