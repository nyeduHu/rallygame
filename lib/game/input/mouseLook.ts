// lib/game/input/mouseLook.ts
import { CAMERA } from "../constants";
import { clamp, moveTowards } from "../math";

/**
 * Pointer-locked mouse look for the cockpit camera. After a short idle period the
 * view eases back to straight ahead, because drivers glance around rather than
 * permanently re-aim.
 */
export class MouseLook {
  yaw = 0;
  pitch = 0;
  private idleTime = 0;
  private element: HTMLElement | null = null;
  private lockListener: ((locked: boolean) => void) | null = null;
  private pitchDownLimit = CAMERA.MAX_PITCH_DOWN;
  private suspended = false;
  private movementX = 0;
  private movementY = 0;
  private readonly consumedDelta = { dx: 0, dy: 0 };

  /**
   * @param event - Mouse event.
   */
  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.isLocked) return;
    this.movementX += event.movementX;
    this.movementY += event.movementY;
    if (this.suspended) return;
    this.yaw = clamp(this.yaw - event.movementX * CAMERA.MOUSE_SENSITIVITY, -CAMERA.MAX_YAW, CAMERA.MAX_YAW);
    this.pitch = clamp(
      this.pitch - event.movementY * CAMERA.MOUSE_SENSITIVITY,
      -this.pitchDownLimit,
      CAMERA.MAX_PITCH_UP,
    );
    this.idleTime = 0;
  };

  /** Relays pointer-lock changes to the UI. */
  private readonly handleLockChange = (): void => {
    this.lockListener?.(this.isLocked);
  };

  /** Clicking the canvas (re)captures the mouse. */
  private readonly handleClick = (): void => {
    this.requestLock();
  };

  /** @returns True when the pointer is locked to our element. */
  get isLocked(): boolean {
    return this.element !== null && document.pointerLockElement === this.element;
  }

  /**
   * Sets the downward look range for the current seat.
   * @param radians - Maximum downward pitch in radians.
   */
  setPitchDownLimit(radians: number): void {
    this.pitchDownLimit = radians;
    this.pitch = clamp(this.pitch, -radians, CAMERA.MAX_PITCH_UP);
  }

  /** Pauses camera motion while an interaction owns pointer movement. */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
  }

  /**
   * Reads raw pointer movement accumulated since the previous call.
   * @returns Reused delta record in screen pixels.
   */
  consumeDelta(): { dx: number; dy: number } {
    this.consumedDelta.dx = this.movementX;
    this.consumedDelta.dy = this.movementY;
    this.movementX = 0;
    this.movementY = 0;
    return this.consumedDelta;
  }

  /**
   * @param element - Canvas element to lock the pointer to.
   * @param onLockChange - Called when lock state changes.
   */
  attach(element: HTMLElement, onLockChange: (locked: boolean) => void): void {
    this.element = element;
    this.lockListener = onLockChange;
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("pointerlockchange", this.handleLockChange);
    element.addEventListener("click", this.handleClick);
  }

  /** Removes listeners and releases the pointer. */
  detach(): void {
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("pointerlockchange", this.handleLockChange);
    this.element?.removeEventListener("click", this.handleClick);
    if (this.isLocked) document.exitPointerLock();
    this.element = null;
    this.lockListener = null;
    this.suspended = false;
    this.movementX = 0;
    this.movementY = 0;
  }

  /** Requests pointer lock; must be called from a user gesture. */
  requestLock(): void {
    if (!this.element || this.isLocked) return;
    // Rejections (e.g. the user pressed Esc moments ago) are expected; the next click retries.
    const result: unknown = this.element.requestPointerLock();
    if (result instanceof Promise) result.catch(() => undefined);
  }

  /** Releases pointer lock (e.g. on the results screen). */
  releaseLock(): void {
    if (this.isLocked) document.exitPointerLock();
  }

  /**
   * Eases the view back to centre after the mouse has been idle.
   * @param dt - Frame delta.
   */
  update(dt: number): void {
    if (this.suspended) return;
    this.idleTime += dt;
    if (this.idleTime < CAMERA.RECENTER_DELAY) return;
    const step = CAMERA.RECENTER_RATE * dt;
    this.yaw = moveTowards(this.yaw, 0, step);
    this.pitch = moveTowards(this.pitch, 0, step);
  }
}
