// lib/game/input/keyboardControls.ts
import type { DriverControls } from "../physics/vehicle";

/** One-shot actions triggered on key press (not held). */
export type KeyAction = "resetToRoad" | "toggleView" | "restart" | "interact" | "swapRole";

/** Key bindings from spec section 18, by physical key code so non-QWERTY layouts work. */
const HELD_KEYS = {
  throttle: "KeyW",
  brake: "KeyS",
  left: "KeyA",
  right: "KeyD",
  handbrake: "Space",
} as const;

const ACTION_KEYS: Readonly<Record<string, KeyAction>> = {
  KeyR: "resetToRoad",
  KeyC: "toggleView",
  Enter: "restart",
  KeyE: "interact",
};

/**
 * Tracks held driving keys and dispatches one-shot actions. Held state lives
 * outside React so the 120 Hz physics loop can read it without re-renders.
 */
export class KeyboardControls {
  private readonly held = new Set<string>();
  private readonly listeners = new Set<(action: KeyAction) => void>();
  private readonly roleSwapListeners = new Set<(held: boolean) => void>();

  /**
   * @param soloMode - Whether Tab is reserved for the local role-view swap.
   */
  constructor(private readonly soloMode = false) {}

  /**
   * @param event - Keyboard event.
   */
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const isSwapKey = this.soloMode && event.code === "Tab";
    const isBound = Object.values(HELD_KEYS).some((code) => code === event.code) || event.code in ACTION_KEYS || isSwapKey;
    if (!isBound) return;
    // Space would otherwise scroll or press the focused button.
    event.preventDefault();
    this.held.add(event.code);
    if (isSwapKey) {
      this.roleSwapListeners.forEach((listener) => listener(true));
      if (!event.repeat) this.listeners.forEach((listener) => listener("swapRole"));
      return;
    }
    const action = ACTION_KEYS[event.code];
    if (action && !event.repeat) this.listeners.forEach((listener) => listener(action));
  };

  /**
   * @param event - Keyboard event.
   */
  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
    if (this.soloMode && event.code === "Tab") this.roleSwapListeners.forEach((listener) => listener(false));
  };

  /** Releases everything when the window loses focus, so keys never stick. */
  private readonly handleBlur = (): void => {
    this.held.clear();
    if (this.soloMode) this.roleSwapListeners.forEach((listener) => listener(false));
  };

  /** Starts listening on the window. */
  attach(): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
  }

  /** Stops listening and clears state. */
  detach(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    this.held.clear();
    this.listeners.clear();
  }

  /**
   * Subscribes to one-shot actions.
   * @param listener - Callback.
   * @returns Unsubscribe function.
   */
  onAction(listener: (action: KeyAction) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Subscribes to Tab hold and release transitions in solo mode.
   * @param listener - Receives true while Tab is held and false on release.
   * @returns Unsubscribe function.
   */
  onRoleSwapChange(listener: (held: boolean) => void): () => void {
    this.roleSwapListeners.add(listener);
    return () => {
      this.roleSwapListeners.delete(listener);
    };
  }

  /**
   * Reads the driver controls without involving React state.
   * @param driveEnabled - Whether the active role is allowed to drive.
   * @returns Current driver controls, or neutral controls for the co-driver.
   */
  read(driveEnabled = true): DriverControls {
    if (!driveEnabled) return { throttle: false, brake: false, steer: 0, handbrake: false };
    const left = this.held.has(HELD_KEYS.left) ? 1 : 0;
    const right = this.held.has(HELD_KEYS.right) ? 1 : 0;
    return {
      throttle: this.held.has(HELD_KEYS.throttle),
      brake: this.held.has(HELD_KEYS.brake),
      steer: right - left,
      handbrake: this.held.has(HELD_KEYS.handbrake),
    };
  }
}
