// components/game/scene/framePriority.ts
/**
 * useFrame ordering. Negative priorities run before default (0) callbacks without
 * taking over rendering, so physics -> car pose -> camera always happen in sequence
 * and the camera never lags the car by a frame.
 */
export const FRAME_PRIORITY = {
  SIMULATION: -3,
  CAR: -2,
  CAMERA: -1,
} as const;
