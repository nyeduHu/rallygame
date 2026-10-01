// lib/game/onfoot/onFootWorld.ts
import type { RigidBody } from "@dimforge/rapier3d-compat";
import type { Quaternion, Vector3 } from "three";
import { VEHICLE } from "../constants";
import { GROUPS } from "../physics/collisionGroups";
import { createPhysicsWorld, type PhysicsWorld } from "../physics/createWorld";
import type { Rapier } from "../physics/rapier";
import type { MeshData } from "../stage/meshData";
import type { StageData } from "../stage/types";

/**
 * Minimal world for a co-driver client that does not simulate the car: stage colliders plus the
 * car as a kinematic body that follows the team's server pose.
 */
export class OnFootWorld {
  readonly physics: PhysicsWorld;
  private readonly car: RigidBody;

  /**
   * @param R - Initialised Rapier module.
   * @param stage - Generated stage.
   * @param road - Road mesh.
   * @param terrain - Terrain mesh.
   */
  constructor(R: Rapier, stage: StageData, road: MeshData, terrain: MeshData) {
    this.physics = createPhysicsWorld(R, stage, road, terrain);
    const half = VEHICLE.CHASSIS_HALF_EXTENTS;
    this.car = this.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    this.physics.world.createCollider(
      R.ColliderDesc.cuboid(half.x, half.y, half.z).setCollisionGroups(GROUPS.chassis),
      this.car,
    );
  }

  /**
   * Moves the kinematic car and steps the world so queries see current collider positions.
   * @param position - Car position.
   * @param rotation - Car orientation.
   */
  update(position: Vector3, rotation: Quaternion): void {
    this.car.setNextKinematicTranslation(position);
    this.car.setNextKinematicRotation(rotation);
    this.physics.world.step();
  }

  /** Frees WASM memory. */
  dispose(): void {
    this.physics.world.free();
  }
}
