// lib/game/store.ts
import { create } from "zustand";
import type { RaceSnapshot } from "./race/raceTracker";
import type { SurfaceKind } from "./stage/types";
import type { Role } from "./roles";
import type { Vector3 } from "three";
import { initialMechanics, type MechanicalState } from "./vehicle/mechanics";
import type { WeatherState } from "./weather/weather";

/** Car readouts shown on the HUD. */
export interface Telemetry {
  speedKmh: number;
  rpm: number;
  gear: string;
  surface: SurfaceKind | null;
}

export type ViewMode = "cockpit" | "chase";

interface GameStore {
  telemetry: Telemetry;
  race: RaceSnapshot;
  viewMode: ViewMode;
  role: Role;
  soloActiveRole: Role;
  pointerLocked: boolean;
  hoveredLabel: string | null;
  interactionHitPoint: Vector3 | null;
  placeholderCubeOn: boolean;
  mech: MechanicalState;
  /** Role currently standing outside the car on this client, or null when seated. */
  footRole: Role | null;
  /** performance.now() when the player last got back in, for the camera blend. */
  seatedAtMs: number;
  setFootRole: (role: Role | null) => void;
  hoodOpen: boolean;
  setHoodOpen: (open: boolean) => void;
  /** Debug: `&overheat=1` drives the heat model as if flat out at a standstill. */
  overheatForced: boolean;
  setMech: (mech: MechanicalState) => void;
  wipersOn: boolean;
  weather: WeatherState;
  /** 0..1 how clearly the driver can see through the windshield. */
  visibility: number;
  /** URL flags: `&rain=1` forces rain, `&debug=1` shows the visibility bar. */
  rainForced: boolean;
  debug: boolean;
  /** True in an online room race (the server owns the wiper state). */
  online: boolean;
  setWipersOn: (on: boolean) => void;
  setWeather: (weather: WeatherState) => void;
  setVisibility: (visibility: number) => void;
  setFlags: (flags: { rainForced: boolean; debug: boolean; online: boolean; overheatForced: boolean }) => void;
  setTelemetry: (telemetry: Telemetry) => void;
  setRace: (race: RaceSnapshot) => void;
  toggleView: () => void;
  setRole: (role: Role) => void;
  setSoloActiveRole: (role: Role) => void;
  setPointerLocked: (locked: boolean) => void;
  setHoveredLabel: (label: string | null) => void;
  setInteractionHitPoint: (point: Vector3 | null) => void;
  togglePlaceholderCube: () => void;
}

const INITIAL_RACE: RaceSnapshot = {
  phase: "ready",
  countdownRemaining: 0,
  elapsed: 0,
  checkpointsPassed: 0,
  checkpointTotal: 0,
  splits: [],
  finishTime: null,
  progress: 0,
};

/**
 * UI-facing game state. The simulation publishes here at a throttled rate; React
 * HUD components subscribe with selectors so only changed readouts re-render.
 */
export const useGameStore = create<GameStore>()((set) => ({
  telemetry: { speedKmh: 0, rpm: 0, gear: "1", surface: null },
  race: INITIAL_RACE,
  viewMode: "cockpit",
  role: "driver",
  soloActiveRole: "driver",
  pointerLocked: false,
  hoveredLabel: null,
  interactionHitPoint: null,
  placeholderCubeOn: false,
  mech: initialMechanics(),
  footRole: null,
  seatedAtMs: 0,
  setFootRole: (footRole) => set(footRole === null ? { footRole, seatedAtMs: performance.now() } : { footRole }),
  hoodOpen: false,
  setHoodOpen: (hoodOpen) => set({ hoodOpen }),
  overheatForced: false,
  setMech: (mech) => set({ mech }),
  wipersOn: false,
  weather: { kind: "clear", intensity: 0 },
  visibility: 1,
  rainForced: false,
  debug: false,
  online: false,
  setWipersOn: (wipersOn) => set({ wipersOn }),
  setWeather: (weather) => set({ weather }),
  setVisibility: (visibility) => set({ visibility }),
  setFlags: (flags) => set(flags),
  setTelemetry: (telemetry) => set({ telemetry }),
  setRace: (race) => set({ race }),
  toggleView: () => set((state) => ({ viewMode: state.viewMode === "cockpit" ? "chase" : "cockpit" })),
  setRole: (role) => set({ role }),
  setSoloActiveRole: (soloActiveRole) => set({ soloActiveRole }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setHoveredLabel: (hoveredLabel) => set({ hoveredLabel }),
  setInteractionHitPoint: (interactionHitPoint) => set({ interactionHitPoint }),
  togglePlaceholderCube: () => set((state) => ({ placeholderCubeOn: !state.placeholderCubeOn })),
}));
