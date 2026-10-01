// lib/net/netStore.ts
import { create } from "zustand";
import { SnapshotBuffer } from "./snapshotBuffer";
import type { RaceEvent, RoomResults, WorldSnapshot } from "./protocol";

interface NetStore {
  /** Server time minus local time, from clock sync. */
  clockOffsetMs: number;
  goAtServerMs: number | null;
  snapshot: WorldSnapshot | null;
  results: RoomResults | null;
  lastEvent: RaceEvent | null;
  setClockOffset: (offsetMs: number) => void;
  setGoAt: (goAtServerMs: number | null) => void;
  setSnapshot: (snapshot: WorldSnapshot) => void;
  setResults: (results: RoomResults) => void;
  setLastEvent: (event: RaceEvent) => void;
  reset: () => void;
}

/** Shared, non-reactive-per-frame buffer: scene code reads it directly instead of subscribing. */
export const snapshotBuffer = new SnapshotBuffer();

/** Online race state published by the socket listeners in `useRoom`. */
export const useNetStore = create<NetStore>()((set) => ({
  clockOffsetMs: 0,
  goAtServerMs: null,
  snapshot: null,
  results: null,
  lastEvent: null,
  setClockOffset: (clockOffsetMs) => set({ clockOffsetMs }),
  setGoAt: (goAtServerMs) => set({ goAtServerMs }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setResults: (results) => set({ results }),
  setLastEvent: (lastEvent) => set({ lastEvent }),
  reset: () => set({ goAtServerMs: null, snapshot: null, results: null, lastEvent: null }),
}));

/** @returns Best estimate of the current server time in ms. */
export function serverNowMs(): number {
  return Date.now() + useNetStore.getState().clockOffsetMs;
}
