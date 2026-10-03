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
  /** Salt for pit placement (reserved: placement is deterministic from the road, not random). */
  PIT_SALT: 0x91750,
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
  /** No corner may be tighter than this radius. */
  MIN_RADIUS: 12,
  /** Minimum straight between consecutive corners, except deliberate linked corners. */
  MIN_STRAIGHT_BETWEEN: 20,
  MIN_LINK_STRAIGHT: 6,
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
  /** Props are removed within this radius of the start and finish lines. */
  MIN_CLEAR_RADIUS_START: 30,
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
  /** Gates ignore fog so they stay visible from this far. */
  VISIBLE_DISTANCE_M: 900,
  /** Lateral tolerance for a checkpoint crossing to count. */
  DETECTION_HALF_WIDTH: 12,
  /** Progress beyond a gate by this much without crossing it counts as a missed gate. */
  MISS_MARGIN: 10,
  /** A reset after a missed gate puts the car this far before the gate. */
  RESET_BEFORE_GATE: 15,
} as const;

/** Pace-note classification and callout distances. */
export const PACE_NOTES = {
  /** Longest note text the co-driver tablet and voice can handle. */
  MAX_TEXT_LENGTH: 28,
  /** More notes than this per 100 m cannot be read aloud. */
  MAX_NOTES_PER_100M: 3,
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
  /** The co-driver sees road within this distance of the car (fog of war beyond it). */
  REVEAL_RADIUS_M: 250,
  /** Chevron every this many samples along revealed road. */
  ARROW_SAMPLE_INTERVAL: 75,
  FINISH_DISTANCE_STEP_M: 10,
  COMPASS_RADIUS: 30,
  COMPASS_MARGIN: 64,
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
  /** Title starts right of the physical mode button in the top-left corner. */
  HEADER_TITLE_LEFT: 120,
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
  gravel: { grip: 1.05, rollingResistance: 0.018 },
  grass: { grip: 0.7, rollingResistance: 0.06 },
} as const;

/** Vehicle chassis and suspension. */
export const VEHICLE = {
  MASS: 1250,
  CHASSIS_HALF_EXTENTS: { x: 0.88, y: 0.3, z: 2.05 },
  CHASSIS_COLLIDER_OFFSET_Y: 0.12,
  CENTER_OF_MASS: { x: 0, y: -0.18, z: 0.08 },
  /** Scales the box-derived inertia; values below one make the car rotate more eagerly (and spin more easily). */
  INERTIA_SCALE: 1.2,
  CHASSIS_FRICTION: 0.4,
  CHASSIS_RESTITUTION: 0.15,
  ANGULAR_DAMPING: 1.5,
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
  FRONT_GRIP: 1.2,
  REAR_GRIP: 0.96,
  /** How much a saturated longitudinal force eats into lateral grip. */
  FRICTION_ELLIPSE_LONG_WEIGHT: 0.55,
  HANDBRAKE_FORCE: 6500,
  HANDBRAKE_REAR_LATERAL_GRIP: 0.42,
  BRAKE_FORCE_MAX: 11000,
  BRAKE_FRONT_BIAS: 0.62,
  /** ABS-like cap: braking never uses more than this share of a tyre's grip, leaving the rest to steer with. */
  BRAKE_GRIP_LIMIT: 0.8,
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
  /** Counter-steer assist: steers toward the direction of travel when the rear steps out. */
  ASSIST_MIN_SPEED: 4,
  /** Sideslip (radians) where the assist starts and where it is at full strength. */
  ASSIST_START: 8 * DEG_TO_RAD,
  ASSIST_FULL: 30 * DEG_TO_RAD,
  /** Steering input added per radian of sideslip, and its cap (steer units, -1..1). */
  ASSIST_GAIN: 1.6,
  ASSIST_MAX: 0.8,
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
  /** Per-step velocity change below this is normal driving, not an impact. */
  IMPACT_MIN_DELTA_V: 0.35,
  /** A cone moving faster than this has been hit. */
  CONE_HIT_SPEED: 1.5,
} as const;

/** On-foot player (leaving the car, pit work). */
export const ON_FOOT = {
  /** Car must be slower than this to get out. */
  EXIT_MAX_SPEED_MS: 0.6,
  CAPSULE_RADIUS: 0.3,
  CAPSULE_HALF_HEIGHT: 0.6,
  EYE_HEIGHT: 1.6,
  WALK_SPEED_MS: 3.2,
  SPRINT_MULTIPLIER: 1.8,
  STEP_HEIGHT: 0.4,
  STEP_MIN_WIDTH: 0.2,
  /** Steepest slope (radians) the player can walk up. */
  MAX_SLOPE_RADIANS: 0.9,
  MAX_PITCH: 85 * (Math.PI / 180),
  /** Sprinting speed used by the server as the plausibility limit (x1.5 slack on top). */
  MAX_SPEED_MS: 3.2 * 1.8,
  MAX_DISTANCE_FROM_CAR_M: 60,
  ENTER_RADIUS_M: 2.2,
  ENTER_BLEND_S: 0.35,
  /** Door position relative to the car centre along local x (driver +x, passenger -x). */
  DOOR_OFFSET_X: 1.3,
  DOOR_OFFSET_Z: 0,
  /** Where a player appears when leaving the car, beside the door. */
  EXIT_OFFSET_X: 1.6,
  EXIT_LIFT: 0.3,
  GRAVITY: -9.81,
  /** Body colours/height used for other players' low-poly characters. */
  BODY_RADIUS: 0.28,
  BODY_HEIGHT: 1.1,
  HEAD_RADIUS: 0.2,
  SERVER_SPEED_SLACK: 1.5,
} as const;

/** Repair mini-game rules (spec 4.2, 19). */
export const REPAIR = {
  WRONG_GUESS_SECONDS: 3,
  WRONG_PART_SECONDS: 5,
  /** Engine health restored by a completed repair. */
  RESTORED_HEALTH: 0.6,
  HOOD_HOLD_S: 0.8,
  WATER_HOLD_S: 3,
  /** Cooling with water drops the temperature to this level. */
  COOLED_TEMPERATURE: 0.4,
  /** Player must be within this distance of the car to work on it. */
  MAX_DISTANCE_M: 6,
  /** Hood opens to this angle (radians). */
  HOOD_OPEN_ANGLE: 1.05,
  HOOD_DAMPING: 8,
} as const;

/** Pit stop placement and flow (spec 7, 8). */
export const PIT = {
  /** Allowed band of the stage (fractions of stage length). */
  BAND_START: 0.45,
  BAND_END: 0.65,
  MIN_STRAIGHT_METRES: 120,
  MIN_CLEARANCE_FROM_CORNER_M: 60,
  /** Fallback when no straight gives the full clearance: the longest gap, but never closer than this. */
  FALLBACK_CLEARANCE_M: 15,
  /** Box dimensions: x across the road, z along it. */
  BOX_SIZE: { x: 7, z: 14 },
  /** Gap between the road shoulder edge and the box. */
  BOX_GAP: 0.5,
  /** Pump distance beyond the outer edge of the box. */
  PUMP_OFFSET: 1.6,
  /** Props within this margin of the box (and pump) are removed. */
  CLEAR_MARGIN: 3,
  MAX_ENTRY_SPEED_MS: 2,
  MIN_FUEL_TO_RELEASE: 0.9,
} as const;

/** Refuelling hardware (co-driver, spec 7). */
export const REFUEL = {
  HOSE_LENGTH_M: 8,
  LITRES_PER_SECOND: 2.5,
  /** Litres a full tank holds (equal to MECHANICS.TANK_CAPACITY_UNITS). */
  TANK_LITRES: 100,
  OVERFLOW_AT: 1,
  TANGLE_PENALTY_S: 4,
  SPILL_PENALTY_S: 3,
  /** Co-driver must be within this distance of the car flap or pump to act. */
  MAX_DISTANCE_M: 3,
  /** Fuel flap position on the car (car-local: right/passenger side rear). */
  FLAP_LOCAL: [-0.93, 0.45, -1.3] as readonly [number, number, number],
} as const;

/** Checkpoint spacing limits. */
export const CHECKPOINT = {
  MIN_SPACING: 300,
  MAX_SPACING: 900,
  /** Checkpoints keep at least this far from a hairpin apex. */
  MIN_DISTANCE_FROM_HAIRPIN_APEX: 20,
} as const;

/**
 * Difficulty windows by stage index. Score = sum of corner severity weights; stage 0 is the
 * low-difficulty tutorial. A stage outside its window is rejected and regenerated.
 */
export const DIFFICULTY = {
  SEVERITY_WEIGHT: { hairpin: 4, tight: 3, medium: 2, fast: 1 },
  STAGE: [
    { min: 28, max: 41 },
    { min: 34, max: 50 },
    { min: 40, max: 62 },
  ],
  /** Stage 0 never has two hairpins closer than this along the road. */
  STAGE0_HAIRPIN_SPACING: 300,
} as const;

/** Roadside distance posts (non-solid). */
export const POSTS = {
  SPACING_M: 500,
  SIZE: [0.25, 1.4, 0.25] as const,
  PLATE_SIZE: [0.9, 0.5] as const,
  /** Distance beyond the shoulder edge. */
  OFFSET: 1.2,
  TEXTURE_PX: 128,
  PLATE_COLOR: "#f6f3ea",
  TEXT_COLOR: "#1c1d21",
  POST_COLOR: "#7d828c",
} as const;

/** Procedural audio (Web Audio only; no sample assets). */
export const ENGINE_SOUND = {
  BASE_HZ: 38,
  HZ_PER_RPM: 0.03,
  SQUARE_DETUNE_CENTS: 12,
  SQUARE_GAIN: 0.35,
  LOWPASS_BASE_HZ: 380,
  LOWPASS_PER_RPM_HZ: 0.12,
  IDLE_GAIN: 0.12,
  THROTTLE_GAIN: 0.2,
  RUMBLE_GAIN: 0.06,
  RUMBLE_LOWPASS_HZ: 180,
  /** Gain smoothing time constant (s) so changes never click. */
  SMOOTHING_S: 0.05,
  GRAVEL_FULL_SLIP_MS: 6,
  GRAVEL_MAX_GAIN: 0.22,
  GRAVEL_BAND_HZ: 1400,
  GRAVEL_ROLL_GAIN: 0.05,
  GRASS_FACTOR: 0.6,
  THUD_GAIN: 0.5,
  THUD_SECONDS: 0.25,
  THUD_FULL_IMPULSE: 20000,
  BEEP_HZ: 880,
  BEEP_SECONDS: 0.12,
  BEEP_GAP_SECONDS: 0.2,
  BEEP_GAIN: 0.12,
  BUZZ_HZ: 160,
  BUZZ_SECONDS: 1.2,
  RAIN_GAIN: 0.18,
  RAIN_LOWPASS_HZ: 1800,
  WIPER_THUNK_GAIN: 0.2,
  MASTER_GAIN: 0.8,
  STORAGE_KEY: "rally-muted",
} as const;

/** Visual effects. */
export const FX = {
  MAX_DUST_PARTICLES: 600,
  DUST_LIFETIME_S: 1.6,
  DUST_RISE_SPEED: 0.8,
  DUST_SIZE: 0.9,
  DUST_COLOR: "#b89c74",
  /** Dust is emitted above this speed on gravel. */
  DUST_MIN_SPEED_MS: 4,
  /** Particles spawned per second at 30 m/s. */
  DUST_RATE_AT_30MS: 80,
  MAX_SKID_SEGMENTS: 400,
  /** Slip speed above which tyres leave marks. */
  SKID_MIN_SLIP_MS: 2.5,
  SKID_WIDTH: 0.22,
  SKID_LENGTH: 0.6,
  SKID_LIFT: 0.03,
  SKID_COLOR: "#2b2a28",
  SKID_SPACING_M: 0.5,
  BRAKE_LIGHT_ON: "#ff2a1a",
  BRAKE_LIGHT_OFF: "#4a0d0a",
  BRAKE_LIGHT_SIZE: [0.22, 0.08, 0.04] as const,
  BRAKE_LIGHT_POSITION: [0.55, 0.45, -2.08] as const,
  /** Screen shake. */
  SHAKE_FULL_IMPULSE: 20000,
  SHAKE_MAX_METRES: 0.12,
  SHAKE_MAX_RADIANS: 0.03,
  SHAKE_DECAY_PER_S: 3.5,
  SHAKE_FREQUENCY_HZ: 24,
  SMOKE_WHITE: "#e6e8ec",
  SMOKE_BLACK: "#1c1d21",
} as const;

/** Road network (alternative routes and dead ends). */
export const NETWORK = {
  /** Metres into a dead end before it counts as a wrong turn. */
  WRONG_WAY_GRACE_M: 60,
  /** Time penalty for confirming a wrong turn. */
  WRONG_WAY_PENALTY_S: 8,
  /** Number of forks to try to place per stage. */
  FORK_COUNT: 3,
  /** Alternative routes among the forks (the rest are dead ends). */
  ALTERNATIVE_COUNT: 2,
  /** Alternatives span this much of the reference route (fork to join). */
  ALT_SPAN_MIN: 260,
  ALT_SPAN_MAX: 520,
  /** Angle at which a side road leaves the main road. */
  FORK_ANGLE_MIN: 30 * DEG_TO_RAD,
  FORK_ANGLE_MAX: 55 * DEG_TO_RAD,
  /** Bezier handle length as a fraction of the fork-to-join chord. */
  HANDLE_MIN: 0.45,
  HANDLE_MAX: 0.8,
  DEAD_END_MIN: 220,
  DEAD_END_MAX: 480,
  /** A fork or join needs this much straight road on either side. */
  FORK_CORNER_CLEARANCE_M: 22,
  /** Forks keep this far from gates (their zones may not contain a gate). */
  FORK_GATE_CLEARANCE_M: 60,
  /** Padding added around a fork zone (pit and later forks keep out of it). */
  FORK_ZONE_PAD_M: 30,
  FORK_EDGE_CLEARANCE_M: 160,
  /** Minimum spacing between fork zones. */
  FORK_SPACING_M: 120,
  /** Branch samples this close (along the branch) to either end may touch the main road. */
  JUNCTION_ZONE_M: 90,
  /** A branch must keep at least this radius so it is drivable. */
  BRANCH_MIN_RADIUS: 18,
  /** Curvature (1/m) above which a stretch of an alternative counts as a corner. */
  CORNER_CURVATURE: 1 / 260,
  /** Corner gaps shorter than this many samples merge into one corner. */
  CORNER_MERGE_SAMPLES: 5,
} as const;
