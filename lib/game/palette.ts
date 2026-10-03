// lib/game/palette.ts
/**
 * Colour tokens for the 3D scene. Three.js materials cannot read Tailwind
 * classes, so this is the single source of truth for in-world colours,
 * mirroring the bright, saturated low-poly direction from spec section 2.
 */
export const PALETTE = {
  sky: "#9fd3ef",
  sunLight: "#fff3dc",
  hemiSky: "#cfe9ff",
  hemiGround: "#5b6b3a",
  grass: "#6fae3e",
  grassDark: "#4f8a2e",
  dirt: "#9a7a4e",
  gravel: "#b89c74",
  gravelDark: "#9c8160",
  shoulder: "#a58a63",
  mazeWall: "#8d8f93",
  mazeWallTop: "#6a7d4a",
  carBody: "#e2462f",
  carBodyDark: "#b23522",
  interior: "#2e3138",
  interiorLight: "#454a54",
  dashboard: "#24262c",
  gaugeFace: "#f4f1e8",
  gaugeNeedle: "#e2462f",
  gaugeRim: "#7d828c",
  steeringWheel: "#1c1d21",
  steeringHub: "#d9b23c",
  glove: "#2f5fb3",
  sleeve: "#f2b33d",
  skin: "#e8b48a",
  glass: "#bfe3f2",
  seat: "#3a3f4a",
  seatStripe: "#2f5fb3",
  lever: "#c9ccd2",
  leverKnob: "#141518",
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Distinct body colours for other teams' cars in online races. */
export const TEAM_COLORS = ["#e2462f", "#2f5fb3", "#3ca55c", "#d9b23c", "#8a4fc7", "#e07b2f", "#2fb5b0", "#c7478f"] as const;
