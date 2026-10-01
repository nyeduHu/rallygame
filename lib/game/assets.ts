// lib/game/assets.ts
/**
 * Asset catalogue. Kept free of three.js imports so the pure stage generator can
 * read variant counts without pulling rendering code into its bundle.
 */
const CAR_DIR = "/assets/car";
const RACING_DIR = "/assets/racing";
const NATURE_DIR = "/assets/nature";

export const MODEL_PATHS = {
  car: `${CAR_DIR}/hatchback-sports.glb`,
  cone: `${CAR_DIR}/cone.glb`,
  overhead: `${RACING_DIR}/overhead.glb`,
  overheadLights: `${RACING_DIR}/overheadLights.glb`,
  bannerTower: `${RACING_DIR}/bannerTowerGreen.glb`,
  flagCheckers: `${RACING_DIR}/flagCheckers.glb`,
  barrierRed: `${RACING_DIR}/barrierRed.glb`,
  barrierWhite: `${RACING_DIR}/barrierWhite.glb`,
  grass: `${NATURE_DIR}/grass_large.glb`,
} as const;

/** Tree variants; index is the PropPlacement.variant value. */
export const TREE_MODEL_PATHS = [
  `${NATURE_DIR}/tree_pineDefaultA.glb`,
  `${NATURE_DIR}/tree_pineRoundA.glb`,
  `${NATURE_DIR}/tree_pineTallA.glb`,
  `${NATURE_DIR}/tree_simple_dark.glb`,
] as const;

/** Rock variants; index is the PropPlacement.variant value. */
export const ROCK_MODEL_PATHS = [
  `${NATURE_DIR}/rock_largeA.glb`,
  `${NATURE_DIR}/rock_tallA.glb`,
  `${NATURE_DIR}/stone_largeA.glb`,
] as const;

/** Barrier variants alternate red/white along a corner. */
export const BARRIER_MODEL_PATHS = [MODEL_PATHS.barrierRed, MODEL_PATHS.barrierWhite] as const;

/** Names of the wheel nodes inside the Kenney hatchback model. */
export const CAR_WHEEL_NODE_NAMES = [
  "wheel-front-left",
  "wheel-front-right",
  "wheel-back-left",
  "wheel-back-right",
] as const;

/** Kenney car kit models are ~2.9 m long; scale to the physics chassis length. */
export const CAR_MODEL_SCALE = 1.42;
/** Kenney car wheel radius in model units, used to match the physics wheel size. */
export const CAR_MODEL_WHEEL_RADIUS = 0.3;
