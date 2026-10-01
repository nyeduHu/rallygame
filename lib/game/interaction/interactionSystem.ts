// lib/game/interaction/interactionSystem.ts
import { Raycaster, Vector2, Vector3, type Camera, type Intersection, type Object3D } from "three";
import { INTERACTION } from "../constants";
import type { MouseLook } from "../input/mouseLook";
import type { Role } from "../roles";

export type InteractionKind = "press" | "toggle" | "drag" | "hold";

export interface InteractableSpec {
  id: string;
  kind: InteractionKind;
  /** Roles allowed to use it. */
  roles: readonly Role[];
  /** Enabled predicate evaluated each hit-test (cheap, no allocation). */
  isEnabled: () => boolean;
  /** Label shown near the crosshair when looked at. */
  label: string;
  /** Meshes or groups to raycast against. */
  getObjects: () => readonly Object3D[];
  onPress?: () => void;
  onRelease?: () => void;
  /** Drag delta since the last frame, plus the accumulated drag delta. */
  onDrag?: (dx: number, dy: number, totalDx: number, totalDy: number) => void;
  /** Hold duration in seconds. */
  onHold?: (seconds: number) => void;
}

export interface InteractionHit {
  id: string;
  distance: number;
}

/**
 * Selects the closest enabled interactable allowed for the active role.
 * @param hits - Ray intersections expressed as stable interactable IDs and distances.
 * @param specs - Registered interactables keyed by ID.
 * @param role - Role currently controlling the seat.
 * @returns The nearest allowed interactable, or null when no hit qualifies.
 */
export function pickNearest(
  hits: readonly InteractionHit[],
  specs: ReadonlyMap<string, InteractableSpec>,
  role: Role,
): InteractableSpec | null {
  let nearest: InteractableSpec | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const hit of hits) {
    const spec = specs.get(hit.id);
    if (!spec || !spec.isEnabled() || !spec.roles.includes(role) || hit.distance >= nearestDistance) continue;
    nearest = spec;
    nearestDistance = hit.distance;
  }
  return nearest;
}

/**
 * Pointer-lock compatible raycast and primary-input controller for physical objects.
 * @returns Interaction registry and the most recent hover/hit state.
 */
export class InteractionSystem {
  readonly specs = new Map<string, InteractableSpec>();
  readonly raycaster = new Raycaster();
  readonly hoveredObjects: Object3D[] = [];
  readonly intersections: Intersection[] = [];
  readonly interactionHits: InteractionHit[] = [];
  readonly hitPoint = new Vector3();
  readonly pointer = new Vector2(0, 0);
  hovered: InteractableSpec | null = null;
  hasHitPoint = false;
  private readonly rootIds = new WeakMap<Object3D, string>();
  private readonly activeSources = new Set<string>();
  private active: InteractableSpec | null = null;
  private elapsedHeld = 0;
  private totalDx = 0;
  private totalDy = 0;
  private lastMouseLook: MouseLook | null = null;

  /** Initializes the raycaster at the configured physical reach. */
  constructor() {
    this.raycaster.far = INTERACTION.REACH_METRES;
  }

  /**
   * Registers or replaces an interactable by its stable ID.
   * @param spec - Physical interaction description.
   */
  register(spec: InteractableSpec): void {
    this.specs.set(spec.id, spec);
  }

  /**
   * Removes a registered interactable and safely releases it if active.
   * @param id - Stable registration ID.
   * @param mouseLook - Optional camera controller for restoring drag look.
   */
  unregister(id: string, mouseLook?: MouseLook): void {
    const spec = this.specs.get(id);
    this.specs.delete(id);
    if (this.active === spec) this.finishActive(mouseLook ?? this.lastMouseLook ?? undefined);
  }

  /**
   * Raycasts from the camera centre and advances hold/drag callbacks.
   * @param camera - Current R3F camera after the camera rig update.
   * @param role - Active player role.
   * @param deltaSeconds - Render-frame duration.
   * @param mouseLook - Pointer-lock input source used for raw deltas.
   */
  update(camera: Camera, role: Role, deltaSeconds: number, mouseLook: MouseLook): void {
    this.lastMouseLook = mouseLook;
    this.hoveredObjects.length = 0;
    for (const spec of this.specs.values()) {
      if (!spec.isEnabled() || !spec.roles.includes(role)) continue;
      for (const object of spec.getObjects()) {
        this.rootIds.set(object, spec.id);
        this.hoveredObjects.push(object);
      }
    }

    camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, camera);
    this.intersections.length = 0;
    this.raycaster.intersectObjects(this.hoveredObjects, true, this.intersections);
    this.interactionHits.length = 0;
    let hitIndex = 0;
    for (const intersection of this.intersections) {
      const id = this.findInteractableId(intersection.object);
      if (id === null) continue;
      const existing = this.interactionHits[hitIndex];
      if (existing) {
        existing.id = id;
        existing.distance = intersection.distance;
      } else {
        this.interactionHits.push({ id, distance: intersection.distance });
      }
      hitIndex += 1;
    }
    this.interactionHits.length = hitIndex;
    this.hovered = pickNearest(this.interactionHits, this.specs, role);
    this.hasHitPoint = false;
    if (this.hovered) {
      for (const intersection of this.intersections) {
        if (this.findInteractableId(intersection.object) !== this.hovered.id) continue;
        this.hitPoint.copy(intersection.point);
        this.hasHitPoint = true;
        break;
      }
    }

    const pointerDelta = mouseLook.consumeDelta();
    if (!this.active) return;
    this.elapsedHeld += deltaSeconds;
    if (this.active.kind === "hold") this.active.onHold?.(this.elapsedHeld);
    if (this.active.kind === "drag") {
      this.totalDx += pointerDelta.dx;
      this.totalDy += pointerDelta.dy;
      this.active.onDrag?.(pointerDelta.dx, pointerDelta.dy, this.totalDx, this.totalDy);
    }
  }

  /**
   * Starts a primary mouse or keyboard press on the current hover target.
   * @param source - Input source key, such as mouse or keyboard.
   * @param mouseLook - Camera controller suspended by drag interactions.
   */
  press(source: string, mouseLook: MouseLook): void {
    this.activeSources.add(source);
    if (this.active || !this.hovered) return;
    this.active = this.hovered;
    this.elapsedHeld = 0;
    this.totalDx = 0;
    this.totalDy = 0;
    if (this.active.kind === "drag") mouseLook.setSuspended(true);
    this.active.onPress?.();
  }

  /**
   * Ends the active target after every primary input source is released.
   * @param source - Input source key being released.
   * @param mouseLook - Camera controller restored after a drag.
   */
  release(source: string, mouseLook: MouseLook): void {
    this.activeSources.delete(source);
    if (this.activeSources.size > 0) return;
    this.finishActive(mouseLook);
  }

  /**
   * Releases captured interaction state when input listeners unmount.
   * @param mouseLook - Camera controller restored after a drag.
   */
  releaseAll(mouseLook: MouseLook): void {
    this.activeSources.clear();
    this.finishActive(mouseLook);
  }

  /**
   * Finds the registered group that owns a descendant mesh hit by Three.js.
   * @param object - Raycast mesh or ancestor group.
   * @returns Owner's stable ID, or null when the mesh is not registered.
   */
  private findInteractableId(object: Object3D): string | null {
    let current: Object3D | null = object;
    while (current) {
      const id = this.rootIds.get(current);
      if (id) return id;
      current = current.parent;
    }
    return null;
  }

  /**
   * Runs release callbacks and clears drag capture.
   * @param mouseLook - Camera controller restored after a drag.
   */
  private finishActive(mouseLook?: MouseLook): void {
    if (!this.active) return;
    this.active.onRelease?.();
    if (this.active.kind === "drag") mouseLook?.setSuspended(false);
    this.active = null;
    this.elapsedHeld = 0;
    this.totalDx = 0;
    this.totalDy = 0;
  }
}
