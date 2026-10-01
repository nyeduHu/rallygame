// lib/net/protocol.ts
import { z } from "zod";
import { NET } from "./netConstants";

export type Role = "driver" | "codriver";
export type RoomPhase = "lobby" | "ready" | "countdown" | "racing" | "pit_stop" | "finished" | "results";

const finiteNumber = z.number().finite();
const positiveInt = z.number().int().nonnegative();
const vec3Schema = z.tuple([finiteNumber, finiteNumber, finiteNumber]);
const vec4Schema = z.tuple([finiteNumber, finiteNumber, finiteNumber, finiteNumber]);
const playerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(NET.PLAYER_NAME_MAX)
  .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), "control characters are not allowed");
const roomCodePattern = new RegExp(`^[${NET.ROOM_CODE_ALPHABET}]{${NET.ROOM_CODE_LENGTH}}$`);
const roomCodeSchema = z.string().length(NET.ROOM_CODE_LENGTH).regex(roomCodePattern, "invalid room code");

export const roleSchema = z.enum(["driver", "codriver"]) as z.ZodType<Role>;
export const roomPhaseSchema = z.enum(["lobby", "ready", "countdown", "racing", "pit_stop", "finished", "results"]) as z.ZodType<RoomPhase>;

export const playerViewSchema = z.object({
  id: z.string().min(1),
  name: playerNameSchema,
  ready: z.boolean(),
  connected: z.boolean(),
  role: roleSchema.nullable(),
  teamId: z.string().nullable(),
}).strict();

export type PlayerView = z.infer<typeof playerViewSchema>;

export const teamViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  driver: playerViewSchema.nullable(),
  codriver: playerViewSchema.nullable(),
}).strict();

export type TeamView = z.infer<typeof teamViewSchema>;

export const roomViewSchema = z.object({
  code: roomCodeSchema,
  hostId: z.string().min(1),
  phase: roomPhaseSchema,
  seed: z.number().int().nonnegative(),
  stageIndex: z.number().int().nonnegative(),
  maxTeams: z.number().int().min(1).max(NET.MAX_TEAMS_LIMIT),
  teams: z.array(teamViewSchema),
  players: z.array(playerViewSchema),
}).strict();

export type RoomView = z.infer<typeof roomViewSchema>;

export const roomCreateSchema = z.object({
  name: playerNameSchema,
  maxTeams: z.number().int().min(1).max(NET.MAX_TEAMS_LIMIT).optional(),
  useDailySeed: z.boolean().optional(),
}).strict();
export type RoomCreatePayload = z.infer<typeof roomCreateSchema>;

export const roomJoinSchema = z.object({
  roomCode: roomCodeSchema,
  name: playerNameSchema,
}).strict();
export type RoomJoinPayload = z.infer<typeof roomJoinSchema>;

export const roomResumeSchema = z.object({
  roomCode: roomCodeSchema,
  playerId: z.string().min(1),
  resumeToken: z.string().min(1),
}).strict();
export type RoomResumePayload = z.infer<typeof roomResumeSchema>;

export const teamCreateSchema = z.object({}).strict();
export type TeamCreatePayload = z.infer<typeof teamCreateSchema>;

export const teamJoinSchema = z.object({
  teamId: z.string().min(1),
  role: roleSchema,
}).strict();
export type TeamJoinPayload = z.infer<typeof teamJoinSchema>;

export const teamLeaveSchema = z.object({}).strict();
export type TeamLeavePayload = z.infer<typeof teamLeaveSchema>;

export const playerReadySchema = z.object({
  ready: z.boolean(),
}).strict();
export type PlayerReadyPayload = z.infer<typeof playerReadySchema>;

export const roomStartSchema = z.object({}).strict();
export type RoomStartPayload = z.infer<typeof roomStartSchema>;

export const poseReportSchema = z.object({
  seq: positiveInt,
  /** Increments when the driver resets to the road, so the server accepts the jump. */
  epoch: positiveInt,
  clientTimeMs: z.number().finite().nonnegative(),
  p: vec3Schema,
  q: vec4Schema,
  v: vec3Schema,
  steer: finiteNumber,
  wheelSpin: finiteNumber,
  susp: z.tuple([finiteNumber, finiteNumber, finiteNumber, finiteNumber]),
}).strict();
export type PoseReport = z.infer<typeof poseReportSchema>;

export const carInputsSchema = z.object({
  throttle01: z.number().finite().min(0).max(1),
  brake01: z.number().finite().min(0).max(1),
  steer: finiteNumber,
  handbrake: z.boolean(),
  rpm: finiteNumber,
}).strict();
export type CarInputs = z.infer<typeof carInputsSchema>;

export const carImpactSchema = z.object({
  kind: z.enum(["cone", "solid"]),
  impulse: z.number().finite().nonnegative(),
  /** Stable id of the cone that was hit; ignored for solid impacts. */
  objectId: positiveInt.optional(),
}).strict();
export type CarImpact = z.infer<typeof carImpactSchema>;

export const engineStatusSchema = z.enum(["ok", "overheating", "failed"]);
export const brokenPartSchema = z.enum(["radiator_hose", "spark_plug", "drive_belt"]);

export const seatSetSchema = z.object({
  to: z.enum(["foot", "seat"]),
}).strict();
export type SeatSetPayload = z.infer<typeof seatSetSchema>;

export const footPoseSchema = z.object({
  seq: positiveInt,
  p: vec3Schema,
  yaw: finiteNumber,
}).strict();
export type FootPose = z.infer<typeof footPoseSchema>;

export const seatStateSchema = z.enum(["seat", "foot"]);

export const onFootViewSchema = z.object({
  teamId: z.string().min(1),
  role: roleSchema,
  p: vec3Schema,
  yaw: finiteNumber,
}).strict();
export type OnFootView = z.infer<typeof onFootViewSchema>;

export const repairStepSchema = z.object({
  step: z.enum(["OPEN_HOOD", "INSPECT", "GRAB_TOOL", "REMOVE_PART", "INSTALL_NEW", "CLOSE_HOOD", "IGNITION", "UNSCREW_CAP", "POUR_WATER", "SCREW_CAP"]),
  partId: brokenPartSchema.optional(),
}).strict();
export type RepairStepPayload = z.infer<typeof repairStepSchema>;

export const repairViewSchema = z.object({
  kind: z.string().min(1),
  part: brokenPartSchema.optional(),
}).strict();
export type RepairView = z.infer<typeof repairViewSchema>;

export const refuelStepSchema = z.object({
  step: z.enum(["OPEN_FLAP", "CLOSE_FLAP", "GRAB_HOSE", "CONNECT", "START", "STOP", "DISCONNECT", "RETURN_HOSE"]),
}).strict();
export type RefuelStepPayload = z.infer<typeof refuelStepSchema>;

export const refuelViewSchema = z.object({
  kind: z.enum(["idle", "hose_held", "connected", "fueling"]),
  flapOpen: z.boolean(),
}).strict();

export const codriverWipersSchema = z.object({
  on: z.boolean(),
}).strict();
export type CodriverWipersPayload = z.infer<typeof codriverWipersSchema>;

export const clockPingSchema = z.object({
  t0: z.number().finite(),
}).strict();
export type ClockPingPayload = z.infer<typeof clockPingSchema>;

export const weatherStateSchema = z.object({
  kind: z.enum(["clear", "rain"]),
  intensity: z.number().finite().min(0).max(1),
}).strict();
export type WeatherState = z.infer<typeof weatherStateSchema>;

export const teamSnapshotSchema = z.object({
  teamId: z.string().min(1),
  seq: positiveInt,
  p: vec3Schema,
  q: vec4Schema,
  v: vec3Schema,
  steer: finiteNumber,
  wheelSpin: finiteNumber,
  wipers: z.boolean(),
  visibility: z.number().finite().min(0).max(1),
  checkpoint: z.number().int().nonnegative(),
  progress01: z.number().finite().min(0).max(1),
  status: z.enum(["racing", "pit", "disabled", "dnf", "finished"]),
  fuel: z.number().finite().min(0).max(1).optional(),
  engineHealth: z.number().finite().min(0).max(1).optional(),
  temperature: z.number().finite().min(0).max(1).optional(),
  damage: z.number().finite().min(0).max(1).optional(),
  engineStatus: engineStatusSchema.optional(),
  brokenPart: brokenPartSchema.nullable().optional(),
  penaltyMs: z.number().finite().nonnegative().optional(),
  repair: repairViewSchema.optional(),
  refuel: refuelViewSchema.optional(),
  pitReady: z.boolean().optional(),
  wrongWay: z.boolean().optional(),
  hoodOpen: z.boolean().optional(),
  occupancy: z.object({ driver: seatStateSchema, codriver: seatStateSchema }).strict().optional(),
}).strict();
export type TeamSnapshot = z.infer<typeof teamSnapshotSchema>;

export const worldSnapshotSchema = z.object({
  serverNowMs: z.number().finite(),
  raceElapsedMs: z.number().finite(),
  weather: weatherStateSchema,
  teams: z.array(teamSnapshotSchema),
  onFoot: z.array(onFootViewSchema).optional(),
}).strict();
export type WorldSnapshot = z.infer<typeof worldSnapshotSchema>;

export const raceCountdownSchema = z.object({
  goAtServerMs: z.number().finite(),
}).strict();
export type RaceCountdown = z.infer<typeof raceCountdownSchema>;

export const raceEventSchema = z.object({
  teamId: z.string().min(1),
  kind: z.string().min(1),
  atServerMs: z.number().finite(),
  data: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type RaceEvent = z.infer<typeof raceEventSchema>;

export const roomResultsSchema = z.object({
  results: z.array(
    z.object({
      teamId: z.string().min(1),
      name: z.string().min(1),
      status: z.enum(["finished", "dnf"]),
      totalMs: z.number().finite().nonnegative(),
      penaltyMs: z.number().finite().nonnegative(),
      rawMs: z.number().finite().nonnegative(),
      pitMs: z.number().finite().nonnegative(),
      damage01: z.number().finite().min(0).max(1),
      fuel01: z.number().finite().min(0).max(1),
      navErrors: z.number().int().nonnegative(),
      crashes: z.number().int().nonnegative(),
    }).strict(),
  ),
}).strict();
export type RoomResults = z.infer<typeof roomResultsSchema>;

export const clientEventSchemas = {
  "room:create": roomCreateSchema,
  "room:join": roomJoinSchema,
  "room:resume": roomResumeSchema,
  "team:create": teamCreateSchema,
  "team:join": teamJoinSchema,
  "team:leave": teamLeaveSchema,
  "player:ready": playerReadySchema,
  "room:start": roomStartSchema,
  "car:pose": poseReportSchema,
  "car:inputs": carInputsSchema,
  "car:impact": carImpactSchema,
  "seat:set": seatSetSchema,
  "repair:step": repairStepSchema,
  "refuel:step": refuelStepSchema,
  "foot:pose": footPoseSchema,
  "codriver:wipers": codriverWipersSchema,
  "clock:ping": clockPingSchema,
} as const;

export const serverEventSchemas = {
  "room:state": roomViewSchema,
  "race:countdown": raceCountdownSchema,
  "race:snapshot": worldSnapshotSchema,
  "race:event": raceEventSchema,
  "race:results": roomResultsSchema,
} as const;

export type ClientEventName = keyof typeof clientEventSchemas;
export type ServerEventName = keyof typeof serverEventSchemas;
