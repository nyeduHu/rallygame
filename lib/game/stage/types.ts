// lib/game/stage/types.ts
import type { CORNER_CLASSES } from "../constants";

/** Ground surface kinds; drives tyre grip and rolling resistance. */
export type SurfaceKind = "gravel" | "grass";

export type CornerClassId = (typeof CORNER_CLASSES)[number]["id"];

export type PaceCallKind = "corner" | "hairpin" | "straight" | "jump" | "caution" | "finish" | "junction";
export type PaceModifier = "tightens" | "opens" | "long" | "caution";

/** A deterministic spoken instruction positioned along a generated stage. */
export interface PaceNote {
  /** Arc length (m) where the driver should hear this call. */
  atS: number;
  kind: PaceCallKind;
  /** 1 = left, -1 = right; 0 for non-directional calls. */
  direction: 1 | -1 | 0;
  /** 1 (fast) … 4 (tight); 0 when not applicable. */
  severity: 0 | 1 | 2 | 3 | 4;
  modifiers: PaceModifier[];
  /** Metres from this call to the next note, rounded to PACE_NOTES.DISTANCE_STEP. */
  distanceToNext: number;
  /** Final spoken text, e.g. "Right 3, tightens, 100". */
  text: string;
  /** Index into StageData.corners, or -1. */
  cornerIndex: number;
}

/** One centreline sample. Heading is unwrapped (cumulative) so it can be interpolated linearly. */
export interface RoadSample {
  x: number;
  y: number;
  z: number;
  /** Arc length from the first sample. */
  s: number;
  /** Tangent is (sin heading, 0, cos heading); increasing heading turns left. */
  heading: number;
}

/** A road of the network other than the route to the finish. */
export interface RoadBranch {
  id: number;
  /** Centreline from where the road leaves its parent road (local arc length starting at 0). */
  samples: RoadSample[];
  corners: CornerInfo[];
  /** Total length of the centreline. */
  length: number;
  /** Race progress (metres of route) of every sample: the route length minus the distance to the finish. */
  progress: number[];
  /** Metres into a dead end of every sample (0 on any road that leads somewhere). */
  pendant: number[];
  /** True when the road ends by joining another road (so it forms a loop). */
  loops: boolean;
}

/** Metadata for one generated corner; kept for barriers now and pace notes later. */
export interface CornerInfo {
  startS: number;
  endS: number;
  apexS: number;
  radius: number;
  angle: number;
  /** 1 = left, -1 = right. */
  direction: 1 | -1;
  classId: CornerClassId;
}

/** A static prop instance placed in the world. */
export interface PropPlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Uniform scale applied to the unit-normalised model. */
  scale: number;
  variant: number;
  hasCollider: boolean;
}

/** Regular-grid heightfield. Vertex (col, row) sits at (originX + col * cellSize, originZ + row * cellSize). */
export interface TerrainData {
  originX: number;
  originZ: number;
  cellSize: number;
  cols: number;
  rows: number;
  heights: Float32Array;
}

/** World-space pose on the road. */
export interface RoadPose {
  x: number;
  y: number;
  z: number;
  heading: number;
}

/** Everything needed to render and simulate a stage; pure data, no engine types. */
/** Pit box beside the road with a fuel pump on its outer side. */
export interface PitInfo {
  /** Arc length of the box centre. */
  s: number;
  x: number;
  y: number;
  z: number;
  /** Road heading at the box (box is aligned with the road). */
  heading: number;
  halfLength: number;
  halfWidth: number;
  pump: { x: number; z: number };
}

export interface StageData {
  seed: number;
  /** Generation attempt that passed validation; useful when debugging a seed. */
  attempt: number;
  samples: RoadSample[];
  length: number;
  corners: CornerInfo[];
  terrain: TerrainData;
  startS: number;
  finishS: number;
  checkpointS: number[];
  trees: PropPlacement[];
  rocks: PropPlacement[];
  grass: PropPlacement[];
  barriers: PropPlacement[];
  cones: PropPlacement[];
  spawn: RoadPose;
  /** Pit box, or null when the road has no suitable straight. */
  pit: PitInfo | null;
  /** Every other road: loops and shortcuts that rejoin the network, and dead ends. */
  branches: RoadBranch[];
}
