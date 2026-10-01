// lib/game/constants.ts
/**
 * Every gameplay tunable lives here so driving feel, stage generation and
 * presentation can be balanced from one place without hunting through systems.
 * Units: metres, seconds, kilograms, newtons, radians unless noted otherwise.
 */

const DEG_TO_RAD = Math.PI / 180;

/** Fixed-step simulation settings. */
export const SIMULATION = {
  /** 120 Hz keeps the stiff tyre/suspension springs stable while rendering at 60 fps. */
  FIXED_TIMESTEP: 1 / 120,
  /** Caps catch-up work after a tab stall so the sim never spirals. */
  MAX_STEPS_PER_FRAME: 8,
  GRAVITY: -9.81,
  /** HUD/store publish rate; React does not need 120 updates per second. */
  HUD_PUBLISH_INTERVAL: 1 / 20,
  COUNTDOWN_SECONDS: 3,
} as const;

/** Seed handling. */
export const SEED = {
  /** Upper bound (exclusive) for generated seeds, keeps URLs short and readable. */
  MAX_RANDOM_SEED: 1_000_000,
  MAX_SEED_DIGITS: 9,
  /** Mixes the retry attempt into the seed so retries stay deterministic. */
  ATTEMPT_SALT: 0x9e3779b1,
  /** Salt for the per-stage weather plan. */
  WEATHER_SALT: 0x57ea7e5,
  /** Salt for the seeded part-failure stream. */
  FAILURES_SALT: 0xfa11ed,
} as const;

/** Road layout and validation. */
export const ROAD = {
  WIDTH: 7.5,
  SHOULDER_WIDTH: 2.5,
  /** The shoulder slopes down into a shallow ditch so the road reads as a raised gravel track. */
  SHOULDER_DROP: 0.3,
  SAMPLE_SPACING: 2,
  TARGET_LENGTH: 2800,
  /** Straight before the start gate: spawn area plus room for the gantry. */
  START_STRAIGHT: 70,
  /** Distance from the first sample to the start line. */
  START_LINE_OFFSET: 40,
  FINISH_STRAIGHT: 90,
  /** Distance from the last sample back to the finish line, leaves a run-out. */
  FINISH_LINE_OFFSET: 50,
  STRAIGHT_MIN: 25,
  STRAIGHT_MAX: 140,
  /** Chance of a short link instead of a full straight, creating corner sequences. */
  SHORT_LINK_CHANCE: 0.35,
  SHORT_LINK_MIN: 6,
  SHORT_LINK_MAX: 18,
  /** Once heading drifts this far from the stage's main direction, corners turn back. */
  HEADING_SOFT_LIMIT: 70 * DEG_TO_RAD,
  /** Hairpins are only allowed when the road is roughly on its main heading. */
  HAIRPIN_HEADING_LIMIT: 30 * DEG_TO_RAD,
  MAX_GENERATION_ATTEMPTS: 60,
  MIN_CORNERS: 8,
  MIN_SEVERE_CORNERS: 1,
  /** Non-adjacent road parts must stay this far apart (centreline to centreline). */
  MIN_SEPARATION: 42,
  /** Pairs closer than this along the road belong to the same corner and are exempt. */
  SEPARATION_ARC_EXEMPT: 150,
  /** Gentle elevation: road follows the terrain but is smoothed and grade-limited. */
  ELEVATION_SMOOTH_WINDOW: 60,
  ELEVATION_SMOOTH_PASSES: 3,
  MAX_GRADE: 0.09,
  /** Alternating forward/backward passes until the grade limit holds both ways. */
  GRADE_LIMIT_PASSES: 4,
  CHECKPOINT_COUNT: 4,
} as const;

/** Corner classes with radius/angle ranges and selection weights. */
export const CORNER_CLASSES = [
  { id: "hairpin", weight: 0.1, radiusMin: 12, radiusMax: 16, angleMin: 150 * DEG_TO_RAD, angleMax: 175 * DEG_TO_RAD },
  { id: "tight", weight: 0.22, radiusMin: 22, radiusMax: 40, angleMin: 50 * DEG_TO_RAD, angleMax: 110 * DEG_TO_RAD },
  { id: "medium", weight: 0.36, radiusMin: 45, radiusMax: 90, angleMin: 30 * DEG_TO_RAD, angleMax: 90 * DEG_TO_RAD },
  { id: "fast", weight: 0.32, radiusMin: 100, radiusMax: 220, angleMin: 15 * DEG_TO_RAD, angleMax: 50 * DEG_TO_RAD },
] as const;

/** Terrain heightfield. */
export const TERRAIN = {
  CELL_SIZE: 4,
  MARGIN: 170,
  AMPLITUDE: 16,
  BASE_WAVELENGTH: 260,
  OCTAVES: 3,
  PERSISTENCE: 0.45,
  LACUNARITY: 2.1,
  /** Flat zone beyond the shoulder edge; must exceed a cell diagonal so no triangle pokes through the road. */
  FLAT_EXTRA: 6.5,
  BLEND_DISTANCE: 32,
  SPATIAL_CELL: 16,
  COLOR_NOISE_WAVELENGTH: 23,
  /** Maximum blend from light to dark grass. */
  COLOR_NOISE_STRENGTH: 0.8,
  /** Slopes steeper than this tint toward dirt. */
  STEEP_SLOPE_START: 0.35,
  STEEP_SLOPE_FULL: 0.9,
} as const;

/** Prop scattering. */
export const PROPS = {
  TREE_GRID: 7.5,
  TREE_JITTER: 0.85,
  TREE_FILL_CHANCE: 0.7,
  /** Clearance from the shoulder edge so trees frame the road without blocking it. */
  TREE_CLEARANCE: 3,
  TREE_MAX_DISTANCE: 95,
  TREE_HEIGHT_MIN: 7,
  TREE_HEIGHT_MAX: 14,
  /** Trees further than this from the road get no collider; nobody drives that far in. */
  TREE_COLLIDER_DISTANCE: 45,
  TREE_TRUNK_RADIUS_RATIO: 0.035,
  ROCK_CHANCE_PER_SAMPLE: 0.035,
  ROCK_OFFSET_MIN: 1.2,
  ROCK_OFFSET_MAX: 9,
  ROCK_SIZE_MIN: 1.2,
  ROCK_SIZE_MAX: 3.2,
  ROCK_COLLIDER_RADIUS_RATIO: 0.38,
  GRASS_CHANCE_PER_SAMPLE: 0.9,
  GRASS_OFFSET_MIN: 0.4,
  GRASS_OFFSET_MAX: 14,
  GRASS_SIZE_MIN: 0.6,
  GRASS_SIZE_MAX: 1.3,
  /** Corners tighter than this get barriers on the outside. */
  BARRIER_RADIUS_THRESHOLD: 30,
  BARRIER_LENGTH: 2.4,
  BARRIER_HEIGHT: 0.9,
  BARRIER_DEPTH: 0.6,
  BARRIER_OUTSIDE_OFFSET: 1.2,
  CONES_PER_HAIRPIN: 3,
  CONE_SPACING: 2.5,
  CONE_HEIGHT: 0.75,
  CONE_RADIUS: 0.3,
  CONE_MASS: 4,
  /** Gates keep this much space clear around them. */
  GATE_CLEAR_RADIUS: 12,
} as const;

/** Start/finish/checkpoint gantries. */
export const GATES = {
  SIDE_MARGIN: 1.2,
  HEIGHT: 6.5,
  DEPTH: 1.2,
  LEG_THICKNESS: 1.0,
  FLAG_HEIGHT: 5,
  FLAG_SIDE_OFFSET: 2,
  TOWER_HEIGHT: 6,
  /** Distance beyond the road edge to the tower centre, matching the gate dressing. */
  TOWER_OFFSET: 4.7,
  /** Half extents of bannerTowerGreen after height normalisation to TOWER_HEIGHT. */
  TOWER_HALF_EXTENTS: { x: 0.93, y: 3, z: 0.93 },
  /** Lateral tolerance for a checkpoint crossing to count. */
  DETECTION_HALF_WIDTH: 12,
  /** Progress beyond a gate by this much without crossing it counts as a missed gate. */
  MISS_MARGIN: 10,
  /** A reset after a missed gate puts the car this far before the gate. */
  RESET_BEFORE_GATE: 15,
} as const;

/** Pace-note classification and callout distances. */
export const PACE_NOTES = {
  SEVERITY_BANDS: [
    { minimumRadius: 140, severity: 1 },
    { minimumRadius: 80, severity: 2 },
    { minimumRadius: 40, severity: 3 },
    { minimumRadius: 0, severity: 4 },
  ] as const,
  LONG_ARC_METRES: 80,
  LINK_DISTANCE: 35,
  CAUTION_STRAIGHT_METRES: 250,
  CALL_LEAD_METRES: 0,
  DISTANCE_STEP: 10,
  MIN_SPOKEN_DISTANCE: 30,
  MAX_SPOKEN_DISTANCE: 500,
} as const;

/** Navigation-tablet dimensions and map composition. */
export const TABLET = {
  CANVAS_SIZE: { width: 1024, height: 640 },
  REDRAW_HZ: 10,
  MAP_MARGIN: 38,
  ROAD_LINE_WIDTH: 7,
  ARROW_SPACING_METRES: 150,
  DISTANCE_TICK_METRES: 500,
  NEXT_WINDOW_METRES: 600,
  NEXT_REAR_WINDOW_METRES: 80,
  NEXT_CAR_VERTICAL_RATIO: 0.72,
  DEGREES_PER_RADIAN: 180 / Math.PI,
  HEADER_HEIGHT: 36,
  PROJECTION_SEARCH_RADIUS: 250,
  SCREEN_SIZE: [0.54, 0.32, 0.025] as const,
  BODY_SIZE: [0.59, 0.37, 0.055] as const,
  BODY_POSITION: [0, 0, 0] as const,
  BODY_CORNER_RADIUS: 0.025,
  BODY_ROUGHNESS: 0.6,
  BUTTON_SIZE: [0.045, 0.045, 0.02] as const,
  SCREEN_OFFSET: [0, 0, -0.035] as const,
  SCREEN_FACING_YAW: Math.PI,
  LEGEND_HEIGHT: 42,
  NOTE_STRIP_HEIGHT: 116,
  HEADER_TITLE_X: 56,
  HEADER_CENTER_Y: 20,
  HEADER_TITLE_FONT_SIZE: 26,
  HEADER_MODE_FONT_SIZE: 21,
  ROAD_CENTER_LINE_WIDTH: 1.5,
  MARKER_STROKE_WIDTH: 2,
  START_MARKER_RADIUS: 9,
  FINISH_CHECKER_SIZE: 6,
  FINISH_CHECKER_COLUMNS: 2,
  FINISH_CHECKER_CENTER_OFFSET: 1,
  CHECKPOINT_HALF_LENGTH: 8,
  CHECKPOINT_LINE_WIDTH: 2,
  DIRECTION_ARROW_LENGTH: 8,
  DIRECTION_ARROW_HALF_WIDTH: 6,
  DIRECTION_ARROW_BASE_Y: 2,
  DIRECTION_ARROW_STROKE_WIDTH: 3,
  DISTANCE_LABEL_FONT_SIZE: 17,
  DISTANCE_LABEL_OFFSET_X: 12,
  DISTANCE_LABEL_OFFSET_Y: 12,
  CORNER_MARKER_RADIUS: 12,
  CORNER_MARKER_FONT_SIZE: 16,
  HAIRPIN_RADIUS: 9,
  HAIRPIN_STROKE_WIDTH: 3,
  HAIRPIN_ARROW_INSET: 1,
  HAIRPIN_ARROW_OFFSET: 1,
  HAIRPIN_ARROW_BASE_Y: 2,
  CAR_MARKER_LENGTH: 13,
  CAR_MARKER_HALF_WIDTH: 9,
  CAR_MARKER_REAR_INSET: 6,
  CAR_MARKER_TAIL_Y_OFFSET: 3,
  NOTE_STRIP_PADDING_X: 24,
  NOTE_LABEL_FONT_SIZE: 19,
  NOTE_PRIMARY_FONT_SIZE: 43,
  NOTE_DISTANCE_FONT_SIZE: 25,
  NOTE_FOLLOWUP_FONT_SIZE: 20,
  NOTE_PRIMARY_BASELINE: 75,
  NOTE_DISTANCE_BASELINE: 72,
  NOTE_FOLLOWUP_BASELINE: 103,
  NOTE_LABEL_BASELINE: 27,
  NOTE_DISTANCE_RESERVED_WIDTH: 265,
  CORNER_MARKER_BASELINE_OFFSET: 1,
  LEGEND_FONT_SIZE: 18,
  LEGEND_HAIRPIN_X_OFFSET: 147,
  LEGEND_HAIRPIN_TEXT_OFFSET: 128,
  BUTTON_OFFSET: [0.255, 0.14, -0.047] as const,
} as const;

/** Reach, update, and presentation limits for physical cockpit interactions. */
export const INTERACTION = {
  REACH_METRES: 1.6,
  HOVER_PUBLISH_HZ: 20,
  HAND_DAMPING: 12,
  PLACEHOLDER_CUBE_POSITION: [-0.7, 0.42, 0.67] as const,
  PLACEHOLDER_CUBE_SIZE: 0.08,
} as const;

/** Pure-pursuit controls used only by the headless regression runner. */
export const AUTOPILOT = {
  SEED_START: 1,
  SEED_COUNT: 20,
  MAX_SIMULATION_SECONDS: 600,
  LOOKAHEAD_BASE: 6,
  LOOKAHEAD_PER_MS: 0.25,
  LOOKAHEAD_MAX: 18,
  MAX_SPEED_MS: 30,
  MAX_LATERAL_ACCELERATION: 4.5,
  BRAKING_DECELERATION: 4,
  SPEED_MARGIN_MS: 0.5,
  /** Below this speed the car counts as stuck, like a human reaching for the reset key. */
  STUCK_SPEED_MS: 0.5,
  STUCK_SECONDS: 3,
  TUNED_FRONT_GRIP: 1.01,
  BASELINE_SEED: 847291,
} as const;

/** Surface grip and rolling resistance. */
export const SURFACES = {
  gravel: { grip: 0.92, rollingResistance: 0.018 },
  grass: { grip: 0.62, rollingResistance: 0.06 },
} as const;

/** Vehicle chassis and suspension. */
export const VEHICLE = {
  MASS: 1250,
  CHASSIS_HALF_EXTENTS: { x: 0.88, y: 0.3, z: 2.05 },
  CHASSIS_COLLIDER_OFFSET_Y: 0.12,
  CENTER_OF_MASS: { x: 0, y: -0.18, z: 0.08 },
  /** Scales the box-derived inertia; values below one make the car rotate more eagerly. */
  INERTIA_SCALE: 0.9,
  CHASSIS_FRICTION: 0.4,
  CHASSIS_RESTITUTION: 0.15,
  ANGULAR_DAMPING: 0.3,
  WHEEL_RADIUS: 0.33,
  WHEEL_FRONT_Z: 1.3,
  WHEEL_REAR_Z: -1.25,
  WHEEL_HALF_TRACK: 0.78,
  WHEEL_MOUNT_Y: -0.05,
  SUSPENSION_REST_LENGTH: 0.36,
  SPRING_STIFFNESS: 36000,
  DAMPING_BUMP: 3600,
  DAMPING_REBOUND: 4400,
  ANTI_ROLL_FRONT: 14000,
  ANTI_ROLL_REAR: 9000,
  /** Last few cm of travel get a progressive bump stop to avoid bottoming through. */
  BUMP_STOP_LENGTH: 0.05,
  BUMP_STOP_STIFFNESS: 220000,
  /** 0 = tyre forces at ground (max body roll), 1 = at centre of mass (no roll). */
  TIRE_FORCE_ROLL_FACTOR: 0.4,
  AERO_DRAG: 0.55,
  SPAWN_LIFT: 0.25,
  SPAWN_BEHIND_START: 9,
  RESET_LIFT: 1.2,
  RESET_COOLDOWN: 1,
} as const;

/** Tyre model (simplified magic formula + friction ellipse). */
export const TIRE = {
  LATERAL_B: 16,
  LATERAL_C: 1.4,
  /** Below this longitudinal speed slip angle behaves like a damper, avoiding low-speed jitter. */
  LOW_SPEED_SLIP_REFERENCE: 4,
  FRONT_GRIP: 1.0,
  REAR_GRIP: 0.96,
  /** How much a saturated longitudinal force eats into lateral grip. */
  FRICTION_ELLIPSE_LONG_WEIGHT: 0.85,
  HANDBRAKE_FORCE: 6500,
  HANDBRAKE_REAR_LATERAL_GRIP: 0.42,
  BRAKE_FORCE_MAX: 11000,
  BRAKE_FRONT_BIAS: 0.62,
  /** Visual-only spin added to wheels that are spinning on throttle. */
  WHEELSPIN_VISUAL_GAIN: 12,
} as const;

/** Engine, gearbox, drivetrain. */
export const DRIVETRAIN = {
  IDLE_RPM: 900,
  LAUNCH_RPM: 3800,
  REDLINE_RPM: 7200,
  SHIFT_UP_RPM: 6700,
  SHIFT_DOWN_RPM: 3300,
  SHIFT_DURATION: 0.22,
  /** [rpm, torque Nm] points; linearly interpolated. */
  TORQUE_CURVE: [
    [800, 150],
    [2500, 215],
    [4200, 255],
    [5800, 245],
    [7200, 195],
  ] as ReadonlyArray<readonly [number, number]>,
  GEAR_RATIOS: [3.1, 2.05, 1.5, 1.16, 0.95, 0.8] as ReadonlyArray<number>,
  REVERSE_RATIO: 3.2,
  FINAL_DRIVE: 4.6,
  EFFICIENCY: 0.88,
  ENGINE_BRAKE_TORQUE: 45,
  /** 0.6 = AWD with rear bias, 1 = pure RWD. */
  REAR_TORQUE_SPLIT: 0.6,
  /** Below this speed holding the opposite pedal swaps between forward and reverse. */
  DIRECTION_SWITCH_SPEED: 0.8,
  THROTTLE_RISE_RATE: 6,
  THROTTLE_FALL_RATE: 10,
  BRAKE_RISE_RATE: 8,
  BRAKE_FALL_RATE: 12,
} as const;

/** Steering. */
export const STEERING = {
  MAX_ANGLE_LOW_SPEED: 34 * DEG_TO_RAD,
  MAX_ANGLE_HIGH_SPEED: 7 * DEG_TO_RAD,
  /** Speed (m/s) at which the steering lock reaches its high-speed limit. */
  FALLOFF_SPEED: 38,
  INPUT_RATE: 3.2,
  RETURN_RATE: 5.5,
  /** Visual steering wheel rotation per unit of input. */
  WHEEL_VISUAL_ROTATION: 110 * DEG_TO_RAD,
} as const;

/** First-person and chase camera. */
export const CAMERA = {
  FOV: 72,
  NEAR: 0.04,
  FAR: 900,
  DRIVER_EYE: { x: 0.37, y: 0.5, z: -0.28 },
  PASSENGER_EYE: { x: -0.37, y: 0.5, z: -0.28 },
  MOUSE_SENSITIVITY: 0.0022,
  MAX_YAW: 120 * DEG_TO_RAD,
  MAX_PITCH_UP: 40 * DEG_TO_RAD,
  MAX_PITCH_DOWN: 55 * DEG_TO_RAD,
  PASSENGER_MAX_PITCH_DOWN: 75 * DEG_TO_RAD,
  RECENTER_DELAY: 1.6,
  RECENTER_RATE: 2.5,
  /** Head sways against acceleration for a sense of g-force. */
  HEAD_SWAY_GAIN: 0.0045,
  HEAD_SWAY_MAX: 0.06,
  HEAD_SWAY_SMOOTHING: 6,
  CHASE_DISTANCE: 7,
  CHASE_HEIGHT: 2.6,
  CHASE_LOOK_AHEAD: 3,
  CHASE_SMOOTHING: 5,
} as const;

/** Lighting, fog, shadows. */
export const RENDER = {
  FOG_NEAR: 110,
  FOG_FAR: 520,
  SUN_DIRECTION: { x: -0.45, y: 0.8, z: 0.35 },
  SUN_DISTANCE: 120,
  SUN_INTENSITY: 2.4,
  HEMI_INTENSITY: 1.1,
  SHADOW_MAP_SIZE: 2048,
  SHADOW_EXTENT: 70,
  SHADOW_NEAR: 1,
  SHADOW_BIAS: -0.0004,
  MAX_PIXEL_RATIO: 1.75,
  GLASS_OPACITY: 0.12,
} as const;

/** Unit conversions used across HUD and physics. */
export const UNITS = {
  MS_TO_KMH: 3.6,
  RAD_PER_SEC_TO_RPM: 60 / (2 * Math.PI),
  MS_PER_SECOND: 1000,
} as const;

/** Rain and windshield dirt model (shared with the server). */
export const WEATHER = {
  /** About 22 s from clear to opaque at full intensity. */
  DIRT_RATE_PER_SECOND_AT_FULL_INTENSITY: 0.045,
  /** Faster driving collects more drops. */
  SPEED_DIRT_BONUS_PER_MS: 0.0006,
  /** Dirt below this does not hurt visibility. */
  DIRT_VISIBLE_START: 0.2,
  /** The windshield never goes fully black. */
  MIN_VISIBILITY: 0.08,
  MAX_RAIN_PARTICLES: 1500,
  /** URL `&rain=1` forces rain from this race time. */
  FORCED_RAIN_START_SECONDS: 10,
  /** Seconds into a later stage at which seeded rain begins (range). */
  PLANNED_RAIN_START_MIN_SECONDS: 20,
  PLANNED_RAIN_START_SPAN_SECONDS: 60,
  /** Chance that a stage after the tutorial has rain. */
  PLANNED_RAIN_CHANCE: 0.5,
  PLANNED_RAIN_MIN_INTENSITY: 0.5,
  RAIN_BOX_SIZE: 30,
  RAIN_BOX_HEIGHT: 18,
  RAIN_FALL_SPEED: 22,
  RAIN_POINT_SIZE: 0.12,
  RAIN_COLOR: "#b8c6d6",
  /** Fog colour and range at full rain intensity. */
  RAIN_FOG_COLOR: "#7d8794",
  RAIN_FOG_NEAR: 25,
  RAIN_FOG_FAR: 220,
} as const;

/** Windshield wipers. */
export const WIPERS = {
  WIPE_RATE_PER_SECOND: 0.35,
  /** Peak sweep of each blade in radians (about 80 degrees). */
  SWEEP_ANGLE: 1.4,
  /** Blade sweeps per second while on. */
  SWEEPS_PER_SECOND: 0.9,
  BLADE_LENGTH: 0.55,
  BLADE_THICKNESS: 0.025,
  /** Switch lever tilt (radians) when on, and its damping. */
  SWITCH_ON_TILT: 0.5,
  SWITCH_DAMPING: 14,
} as const;

/**
 * Engine, fuel, temperature and damage model. Fuel calc: stages run about 170 s at the slowest;
 * 1.35 x 230 s of "moderate load" (throttle x rpm = 0.4) must fit in one tank, so
 * FUEL_IDLE + FUEL_PER_LOAD x 0.4 = 0.42 units/s stays under TANK / 230 = 0.435 units/s.
 */
export const MECHANICS = {
  TANK_CAPACITY_UNITS: 100,
  FUEL_IDLE: 0.1,
  FUEL_PER_LOAD: 0.8,
  FUEL_RANGE_MULTIPLIER: 1.35,
  HEAT_PER_LOAD: 0.05,
  HEAT_DAMAGE: 0.03,
  COOL_BASE: 0.01,
  COOL_PER_SPEED: 0.04,
  COOL_HOOD_OPEN: 0.06,
  COOL_PER_AMBIENT: 0.01,
  MAX_SPEED_MS: 30,
  OVERHEAT_WARN: 0.85,
  OVERHEAT_FAIL: 1,
  OVERHEAT_FAIL_SECONDS: 6,
  /** Overheat clears below this temperature. */
  OVERHEAT_RECOVER: 0.6,
  OVERHEAT_POWER_FLOOR: 0.55,
  HEALTH_LOSS_OVERHEAT_PER_S: 0.02,
  /** Engine health lost per newton-second of impact beyond the free threshold. */
  HEALTH_PER_IMPULSE: 1 / 90000,
  /** Impacts below this are free (kerbs, cones). */
  IMPACT_FREE_THRESHOLD: 1500,
  DAMAGE_PER_IMPULSE: 1 / 60000,
  /** A crash is an impact at least this hard. */
  CRASH_IMPULSE: 8000,
  P_BREAK_ON_CRASH: 0.5,
  /** Power lost at full body damage. */
  DAMAGE_POWER_LOSS: 0.3,
  TIRE_WEAR_PER_S_GRAVEL: 0.0005,
  TIRE_WEAR_PER_S_GRASS: 0.0012,
  DEFAULT_AMBIENT: 0.5,
} as const;
