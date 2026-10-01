// lib/game/events.ts
/** Typed game events other systems (audio, effects) can hook without coupling to the emitters. */
export interface GameEvents {
  overheatWarning: { temperature01: number };
  overheatCleared: Record<string, never>;
  engineFailed: { brokenPart: string | null };
  crash: { impulse: number };
}

type Listener<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

const listeners: { [K in keyof GameEvents]: Set<Listener<K>> } = {
  overheatWarning: new Set(),
  overheatCleared: new Set(),
  engineFailed: new Set(),
  crash: new Set(),
};

/** Tiny dependency-free typed event bus. */
export const gameEvents = {
  /**
   * Subscribes to an event.
   * @param type - Event name.
   * @param listener - Handler.
   * @returns Unsubscribe function.
   */
  on<K extends keyof GameEvents>(type: K, listener: Listener<K>): () => void {
    const set: Set<Listener<K>> = listeners[type];
    set.add(listener);
    return () => set.delete(listener);
  },
  /**
   * Emits an event to all listeners.
   * @param type - Event name.
   * @param payload - Event data.
   */
  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set: Set<Listener<K>> = listeners[type];
    set.forEach((listener) => listener(payload));
  },
};
