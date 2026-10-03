// lib/game/cockpitLayout.ts
/**
 * Cockpit geometry in car-local space (x = left, y = up, z = forward, origin at
 * the chassis centre). Left-hand drive: the driver sits on +x. Kept apart from
 * gameplay tunables because these only shape the look of the interior.
 */
type Vec3 = readonly [number, number, number];

const DRIVER_X = 0.37;
const PASSENGER_X = -0.37;
const BODY_HALF_WIDTH = 0.8;
const BELTLINE_Y = 0.33;
const ROOF_Y = 0.87;
const WINDSHIELD_BASE_Z = 0.86;
const WINDSHIELD_TOP_Z = 0.25;

export const COCKPIT = {
  MATERIAL: { PANEL_ROUGHNESS: 0.85, FRAME_ROUGHNESS: 0.8, GLASS_ROUGHNESS: 0.1 },
  DRIVER_X,
  PASSENGER_X,
  BODY_HALF_WIDTH,
  BELTLINE_Y,
  ROOF_Y,
  WINDSHIELD: {
    BASE: [0, BELTLINE_Y, WINDSHIELD_BASE_Z] as Vec3,
    TOP: [0, ROOF_Y, WINDSHIELD_TOP_Z] as Vec3,
    WIDTH: 1.5,
  },
  PILLAR_THICKNESS: 0.07,
  A_PILLAR_X: 0.76,
  B_PILLAR: { BOTTOM: [0.79, BELTLINE_Y, -0.75] as Vec3, TOP: [0.75, ROOF_Y, -0.85] as Vec3 },
  ROOF: { POSITION: [0, ROOF_Y + 0.02, -0.45] as Vec3, SIZE: [1.6, 0.04, 1.45] as Vec3 },
  DOOR: { CENTER_Y: 0.08, HEIGHT: 0.5, LENGTH: 1.7, THICKNESS: 0.07, CENTER_Z: -0.1 },
  FLOOR: { POSITION: [0, -0.2, -0.1] as Vec3, SIZE: [1.6, 0.04, 2] as Vec3 },
  DASHBOARD: { POSITION: [0, 0.22, 0.7] as Vec3, SIZE: [1.56, 0.2, 0.42] as Vec3 },
  PASSENGER_DASH_PAD: { POSITION: [-0.42, 0.34, 0.69] as Vec3, SIZE: [0.54, 0.035, 0.3] as Vec3 },
  PASSENGER_GLOVEBOX: {
    POSITION: [-0.4, 0.075, 0.69] as Vec3,
    SIZE: [0.62, 0.18, 0.28] as Vec3,
    LATCH_POSITION: [-0.4, 0.075, 0.84] as Vec3,
    LATCH_SIZE: [0.1, 0.025, 0.018] as Vec3,
  },
  PASSENGER_WIPER_SWITCH: {
    BASE_POSITION: [-0.72, 0.36, 0.69] as Vec3,
    BASE_SIZE: [0.1, 0.025, 0.1] as Vec3,
    LEVER_POSITION: [-0.72, 0.405, 0.69] as Vec3,
    LEVER_SIZE: [0.025, 0.075, 0.025] as Vec3,
  },
  /** The tablet rests on the co-driver's lap, tipped up so its screen faces their eyes. */
  PASSENGER_TABLET_LAP: {
    POSITION: [PASSENGER_X, 0.1, 0.0] as Vec3,
    TILT: 0.85,
    SCALE: 1.15,
  },
  /** Hood, engine bay parts, toolbox and ignition (car-local; front of the car is +z). */
  ENGINE_BAY: {
    HOOD_HINGE: [0, 0.34, 0.95] as Vec3,
    /** Colour of the opened hood slab, matched to the car model body. */
    HOOD_COLOR: "#2e9e5f",
    HOOD_SIZE: [1.5, 0.05, 1.1] as Vec3,
    LATCH_POSITION: [0, 0.3, 2.05] as Vec3,
    LATCH_SIZE: [0.16, 0.06, 0.05] as Vec3,
    BLOCK_POSITION: [0, 0.4, 1.5] as Vec3,
    BLOCK_SIZE: [0.7, 0.3, 0.6] as Vec3,
    RADIATOR_HOSE: { POSITION: [0.45, 0.56, 1.8] as Vec3, SIZE: [0.07, 0.07, 0.5] as Vec3 },
    SPARK_PLUGS: { POSITION: [-0.2, 0.62, 1.5] as Vec3, SIZE: [0.06, 0.12, 0.06] as Vec3, SPACING: 0.13 },
    DRIVE_BELT: { POSITION: [-0.45, 0.56, 1.8] as Vec3, RADIUS: 0.14, TUBE: 0.025 },
    CAP: { POSITION: [0.1, 0.62, 1.7] as Vec3, RADIUS: 0.06, HEIGHT: 0.04 },
    WATER_BOTTLE: { POSITION: [1.6, 0.35, 2.7] as Vec3, RADIUS: 0.06, HEIGHT: 0.25 },
    SMOKE_ORIGIN: [0, 0.4, 1.5] as Vec3,
    TOOLBOX: { POSITION: [1.6, 0.15, 2.4] as Vec3, SIZE: [0.7, 0.3, 0.4] as Vec3 },
    TOOL_POSITION: [1.6, 0.4, 2.4] as Vec3,
    TOOL_SIZE: [0.06, 0.06, 0.4] as Vec3,
    /** Replacement parts laid out beside the toolbox. */
    SPARES_Z: 2.9,
    SPARES_X: 1.3,
    SPARES_SPACING: 0.3,
    IGNITION_POSITION: [0.55, 0.36, 0.62] as Vec3,
    IGNITION_SIZE: [0.06, 0.03, 0.06] as Vec3,
  },
  BINNACLE: { POSITION: [DRIVER_X, 0.34, 0.56] as Vec3, SIZE: [0.42, 0.06, 0.2] as Vec3 },
  GAUGES: {
    CENTER: [DRIVER_X, 0.28, 0.49] as Vec3,
    SPACING: 0.1,
    RADIUS: 0.06,
    RIM_WIDTH: 0.008,
    NEEDLE_LENGTH: 0.05,
    NEEDLE_WIDTH: 0.006,
    /** Needle sweep from rest to full scale. */
    SWEEP: 4.4,
    /** Angle of the needle at zero, measured from straight up. */
    START_ANGLE: 2.2,
    SPEED_FULL_SCALE_KMH: 200,
    TILT: 0.25,
    /** Smaller temperature and fuel dials below the main pair, plus warning lamps above. */
    SECONDARY_OFFSET_Y: -0.085,
    SECONDARY_RADIUS: 0.034,
    SECONDARY_SPACING: 0.082,
    LAMP_OFFSET_Y: 0.085,
    LAMP_RADIUS: 0.011,
    LAMP_SPACING: 0.05,
    LAMP_BLINK_HZ: 3,
  },
  STEERING: {
    CENTER: [DRIVER_X, 0.27, 0.32] as Vec3,
    TILT: 0.42,
    RADIUS: 0.19,
    TUBE: 0.022,
    SPOKE_WIDTH: 0.03,
    HUB_RADIUS: 0.045,
    HUB_DEPTH: 0.04,
    COLUMN_LENGTH: 0.3,
    COLUMN_RADIUS: 0.025,
    /** Hand grip angle from the 9/3 o'clock line (10-and-2 position). */
    GRIP_ANGLE: 0.35,
  },
  HANDS: {
    GLOVE_SIZE: [0.07, 0.09, 0.06] as Vec3,
    FOREARM_RADIUS: 0.035,
    ELBOW_RADIUS: 0.042,
    /** Elbows rest beside the driver's torso. */
    ELBOW_LEFT: [DRIVER_X + 0.27, 0.08, -0.05] as Vec3,
    ELBOW_RIGHT: [DRIVER_X - 0.27, 0.08, -0.05] as Vec3,
  },
  PASSENGER_HANDS: {
    /** Static resting pose; interaction motion is added with the interaction system. */
    REST: {
      LEFT: [-0.5, -0.075, -0.25] as Vec3,
      RIGHT: [-0.27, -0.075, -0.25] as Vec3,
    },
    ELBOW: {
      LEFT: [-0.62, 0.045, -0.53] as Vec3,
      RIGHT: [-0.12, 0.045, -0.53] as Vec3,
    },
  },
  HOOD: { POSITION: [0, 0.28, 1.47] as Vec3, SIZE: [1.6, 0.06, 1.2] as Vec3, SLOPE: 0.09 },
  MIRROR: { POSITION: [0, 0.78, 0.33] as Vec3, SIZE: [0.24, 0.07, 0.03] as Vec3 },
  SEAT: {
    BASE_SIZE: [0.5, 0.12, 0.5] as Vec3,
    BACK_SIZE: [0.5, 0.72, 0.12] as Vec3,
    BASE_Y: -0.08,
    BASE_Z: -0.4,
    BACK_Z: -0.68,
    BACK_TILT: -0.18,
    STRIPE_WIDTH: 0.12,
    STRIPE_DEPTH: 0.03,
  },
  CONSOLE: { POSITION: [0, -0.05, 0.15] as Vec3, SIZE: [0.22, 0.2, 0.75] as Vec3 },
  GEAR_LEVER: {
    BASE: [0, 0.06, 0.32] as Vec3,
    LENGTH: 0.2,
    RADIUS: 0.012,
    KNOB_RADIUS: 0.03,
    FORWARD_TILT: 0.25,
    REVERSE_TILT: -0.25,
  },
  HANDBRAKE: {
    PIVOT: [0.11, 0.06, 0.0] as Vec3,
    LENGTH: 0.26,
    THICKNESS: 0.03,
    REST_ANGLE: 1.35,
    PULLED_ANGLE: 0.85,
    RESPONSE: 14,
  },
} as const;
