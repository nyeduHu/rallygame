// server/rooms/room.ts
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { randomSeed } from "../../lib/game/random";
import type { PlayerView, Role, RoomPhase, RoomView, TeamView } from "../../lib/net/protocol";
import { NET } from "../../lib/net/netConstants";

export type RoomActionResult = { ok: true } | { ok: false; error: string };

export interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  role: Role | null;
  teamId: string | null;
  /** SHA-256 of the resume token; the raw token is only ever sent to its owner. */
  resumeTokenHash: string;
  disconnectedAtMs: number | null;
}

export interface RoomTeam {
  id: string;
  name: string;
  driverId: string | null;
  codriverId: string | null;
}

export interface RoomOptions {
  maxTeams?: number;
  seed?: number;
  stageIndex?: number;
}

const RESUME_TOKEN_BYTES = 16;

/** @returns SHA-256 hex digest of a resume token. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sanitizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed.replace(/[\u0000-\u001F\u007F]/g, "");
}

/** Represents a room containing players, seat assignments, and lobby-state flow. */
export class Room {
  readonly code: string;
  readonly hostId: string;
  readonly maxTeams: number;
  readonly seed: number;
  readonly stageIndex: number;
  phase: RoomPhase;
  readonly players = new Map<string, RoomPlayer>();
  readonly teams = new Map<string, RoomTeam>();

  constructor(code: string, hostName: string, options: RoomOptions = {}) {
    this.code = code;
    this.maxTeams = Math.min(options.maxTeams ?? NET.MAX_TEAMS_DEFAULT, NET.MAX_TEAMS_LIMIT);
    this.seed = options.seed ?? randomSeed();
    this.stageIndex = options.stageIndex ?? 0;
    this.phase = "lobby";

    const host = this.addPlayer(hostName);
    this.hostId = host.id;
  }

  /** Adds a player to the room and returns the created record. */
  addPlayer(name: string): RoomPlayer {
    const cleaned = sanitizeName(name);
    const player: RoomPlayer = {
      id: randomUUID(),
      name: cleaned.slice(0, NET.PLAYER_NAME_MAX),
      connected: true,
      ready: false,
      role: null,
      teamId: null,
      resumeTokenHash: "",
      disconnectedAtMs: null,
    };

    this.players.set(player.id, player);
    return player;
  }

  /** Returns the room view in the shape used by the protocol. */
  toView(): RoomView {
    const teams: TeamView[] = [...this.teams.values()].map((team) => ({
      id: team.id,
      name: team.name,
      driver: this.playerView(team.driverId),
      codriver: this.playerView(team.codriverId),
    }));

    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      seed: this.seed,
      stageIndex: this.stageIndex,
      maxTeams: this.maxTeams,
      teams,
      players: [...this.players.values()].map((player) => this.playerView(player.id) ?? {
        id: player.id,
        name: player.name,
        ready: player.ready,
        connected: player.connected,
        role: player.role,
        teamId: player.teamId,
      }),
    };
  }

  /** Creates a team and returns the new team record. */
  createTeam(name: string): RoomTeam {
    const team: RoomTeam = {
      id: randomUUID(),
      name: sanitizeName(name).slice(0, NET.PLAYER_NAME_MAX),
      driverId: null,
      codriverId: null,
    };

    this.teams.set(team.id, team);
    return team;
  }

  /** Attempts to assign a valid role on the specified team. */
  joinTeam(playerId: string, teamId: string, role: Role): RoomActionResult {
    if (this.phase === "countdown" || this.phase === "racing" || this.phase === "pit_stop" || this.phase === "finished" || this.phase === "results") {
      return { ok: false, error: "room_locked" };
    }

    const player = this.players.get(playerId);
    const team = this.teams.get(teamId);
    if (!player || !team) {
      return { ok: false, error: "not_found" };
    }

    const seatTaken = role === "driver" ? team.driverId : team.codriverId;
    if (seatTaken && seatTaken !== playerId) {
      return { ok: false, error: "role_taken" };
    }

    if (player.teamId && player.teamId !== teamId) {
      this.leaveTeam(playerId);
    }

    if (role === "driver") {
      team.driverId = playerId;
    } else {
      team.codriverId = playerId;
    }

    player.role = role;
    player.teamId = teamId;
    return { ok: true };
  }

  /** Removes a player from the active team seat. */
  leaveTeam(playerId: string): RoomActionResult {
    const player = this.players.get(playerId);
    if (!player) {
      return { ok: false, error: "not_found" };
    }

    const team = player.teamId ? this.teams.get(player.teamId) : undefined;
    if (team) {
      if (team.driverId === playerId) {
        team.driverId = null;
      }
      if (team.codriverId === playerId) {
        team.codriverId = null;
      }
    }

    player.role = null;
    player.teamId = null;
    player.ready = false;
    return { ok: true };
  }

  /** Sets the ready flag for a player. */
  setReady(playerId: string, ready: boolean): RoomActionResult {
    const player = this.players.get(playerId);
    if (!player) {
      return { ok: false, error: "not_found" };
    }
    player.ready = ready;
    return { ok: true };
  }

  /** Returns whether the room is ready to begin a rally. */
  canStart(): boolean {
    const seatedPlayers = [...this.players.values()].filter((player) => player.teamId !== null && player.role !== null);
    if (seatedPlayers.length === 0) {
      return false;
    }

    const allSeatedReady = seatedPlayers.every((player) => player.ready);
    const hasFullTeam = [...this.teams.values()].some((team) => team.driverId !== null && team.codriverId !== null);
    return allSeatedReady && hasFullTeam;
  }

  /** Starts a room only when the lobby contract is satisfied. */
  startRoom(): RoomActionResult {
    if (!this.canStart()) {
      return { ok: false, error: "not_ready" };
    }
    this.phase = "countdown";
    return { ok: true };
  }

  /** Marks a player as disconnected and keeps the seat reserved for reconnects. */
  disconnectPlayer(playerId: string, nowMs: number): RoomActionResult {
    const player = this.players.get(playerId);
    if (!player) {
      return { ok: false, error: "not_found" };
    }

    player.connected = false;
    player.disconnectedAtMs = nowMs;
    return { ok: true };
  }

  /**
   * Issues a fresh 128-bit resume token for a player and stores only its hash.
   * @param playerId - Player to issue for.
   * @returns The raw token (empty string for an unknown player).
   */
  issueResumeToken(playerId: string): string {
    const player = this.players.get(playerId);
    if (!player) return "";
    const token = randomBytes(RESUME_TOKEN_BYTES).toString("hex");
    player.resumeTokenHash = hashToken(token);
    return token;
  }

  /** Resumes a disconnected player if the resume token matches. */
  resumePlayer(playerId: string, resumeToken: string): boolean {
    const player = this.players.get(playerId);
    if (!player || player.resumeTokenHash === "" || player.resumeTokenHash !== hashToken(resumeToken)) {
      return false;
    }

    player.connected = true;
    player.disconnectedAtMs = null;
    return true;
  }

  /** Returns a protocol player view or null when the player is not found. */
  private playerView(playerId: string | null): PlayerView | null {
    if (!playerId) {
      return null;
    }

    const player = this.players.get(playerId);
    if (!player) {
      return null;
    }

    return {
      id: player.id,
      name: player.name,
      ready: player.ready,
      connected: player.connected,
      role: player.role,
      teamId: player.teamId,
    };
  }
}
