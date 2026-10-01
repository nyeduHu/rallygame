// lib/game/onfoot/onFootBody.ts
import type { Collider, KinematicCharacterController, RigidBody, World } from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import { ON_FOOT } from "../constants";
import { GROUPS } from "../physics/collisionGroups";
import type { Rapier } from "../physics/rapier";

/** Distance at which the controller keeps the capsule glued to descending ground. */
const SNAP_TO_GROUND = 0.3;
/** Skin gap between the capsule and surfaces. */
const CONTROLLER_OFFSET = 0.01;

/**
 * A walking player: a kinematic capsule moved by Rapier's character controller so it climbs
 * small steps and slopes and collides with ground, trees and the car chassis.
 */
export class OnFootBody {
  /** Capsule centre in world space. */
  readonly position = new Vector3();
  grounded = false;
  private verticalSpeed = 0;
  private readonly body: RigidBody;
  private readonly collider: Collider;
  private readonly controller: KinematicCharacterController;

  /**
   * @param R - Initialised Rapier module.
   * @param world - World to walk in (the driver's session world or a co-driver world).
   * @param feet - World position of the player's feet.
   */
  constructor(R: Rapier, private readonly world: World, feet: { x: number; y: number; z: number }) {
    const centreY = feet.y + ON_FOOT.CAPSULE_HALF_HEIGHT + ON_FOOT.CAPSULE_RADIUS;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(feet.x, centreY, feet.z));
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(ON_FOOT.CAPSULE_HALF_HEIGHT, ON_FOOT.CAPSULE_RADIUS).setCollisionGroups(GROUPS.player),
      this.body,
    );
    this.controller = world.createCharacterController(CONTROLLER_OFFSET);
    this.controller.enableAutostep(ON_FOOT.STEP_HEIGHT, ON_FOOT.STEP_MIN_WIDTH, false);
    this.controller.setMaxSlopeClimbAngle(ON_FOOT.MAX_SLOPE_RADIANS);
    this.controller.enableSnapToGround(SNAP_TO_GROUND);
    this.position.set(feet.x, centreY, feet.z);
  }

  /**
   * Moves the capsule for one frame.
   * @param dt - Frame time in seconds.
   * @param velocity - Desired horizontal velocity in m/s.
   */
  step(dt: number, velocity: { x: number; z: number }): void {
    this.verticalSpeed = this.grounded ? 0 : this.verticalSpeed + ON_FOOT.GRAVITY * dt;
    this.controller.computeColliderMovement(
      this.collider,
      { x: velocity.x * dt, y: this.verticalSpeed * dt, z: velocity.z * dt },
      undefined,
      GROUPS.player,
    );
    const movement = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    this.position.set(this.position.x + movement.x, this.position.y + movement.y, this.position.z + movement.z);
    this.body.setNextKinematicTranslation(this.position);
  }

  /** @returns World position of the eye. */
  eyePosition(target: Vector3): Vector3 {
    const feetY = this.position.y - ON_FOOT.CAPSULE_HALF_HEIGHT - ON_FOOT.CAPSULE_RADIUS;
    return target.set(this.position.x, feetY + ON_FOOT.EYE_HEIGHT, this.position.z);
  }

  /** @returns World position of the feet. */
  feetPosition(target: Vector3): Vector3 {
    return target.set(this.position.x, this.position.y - ON_FOOT.CAPSULE_HALF_HEIGHT - ON_FOOT.CAPSULE_RADIUS, this.position.z);
  }

  /** Removes the capsule and controller from the world. */
  dispose(): void {
    this.world.removeCharacterController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}

