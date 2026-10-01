// lib/net/netConstants.ts
export const NET = {
  ROOM_CODE_LENGTH: 6,
  ROOM_CODE_ALPHABET: "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
  MAX_TEAMS_DEFAULT: 6,
  MAX_TEAMS_LIMIT: 12,
  PLAYER_NAME_MAX: 20,
  SNAPSHOT_HZ: 20,
  POSE_HZ: 20,
  INTERPOLATION_DELAY_MS: 100,
  COUNTDOWN_SECONDS: 5,
  RESULTS_TIMEOUT_AFTER_FIRST_FINISH_S: 120,
  RECONNECT_GRACE_S: 30,
  PING_SAMPLES: 8,
  ACK_TIMEOUT_MS: 5000,
  MAX_SPEED_MS: 70,
  /** Speed at which the co-driver view shows redline revs (no rpm is networked). */
  REMOTE_RPM_FULL_SPEED_MS: 45,
  /** Forward speed below which the co-driver view shows reverse. */
  REMOTE_REVERSE_SPEED_MS: -0.5,
  MAX_OFF_ROAD_METRES: 80,
  POSE_SLACK_METRES: 6,
  MAX_VIOLATIONS_PER_10S: 25,
  RATE_LIMITS: {
    "car:pose": 30,
    "car:inputs": 30,
    "car:impact": 10,
  },
} as const;
