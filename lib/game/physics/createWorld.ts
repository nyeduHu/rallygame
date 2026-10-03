// lib/game/physics/createWorld.ts
import type { RigidBody, World } from "@dimforge/rapier3d-compat";
import { GATES, PROPS, ROAD, SIMULATION } from "../constants";
import { poseAt } from "../stage/roadIndex";
import { BARRIER_YAW_OFFSET, gateHalfWidth } from "../stage/props";
import type { MeshData } from "../stage/meshData";
import type { StageData, SurfaceKind } from "../stage/types";
import { GROUPS } from "./collisionGroups";
import type { Rapier } from "./rapier";

/** Physics world plus lookups the vehicle and renderer need. */
export interface PhysicsWorld {
  world: World;
  /** Maps collider handle to ground surface; anything absent is not drivable ground. */
  surfaces: Map<number, SurfaceKind>;
  /** Dynamic cone bodies, index-aligned with stage.cones. */
  coneBodies: RigidBody[];
}

/** Arc-length positions of every gantry: start, checkpoints, finish. */
export function gateArcPositions(stage: StageData): number[] {
  return [stage.startS, ...stage.checkpointS, stage.finishS];
}

/**
 * Builds a yaw-only quaternion.
 * @param yaw - Rotation about +Y.
 * @returns Rapier rotation.
 */
function yawRotation(yaw: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/**
 * Creates the Rapier world with all static stage colliders.
 * @param R - Initialised Rapier module.
 * @param stage - Generated stage.
 * @param road - Road mesh (shared with rendering).
 * @param terrain - Terrain mesh (shared with rendering).
 * @returns Physics world bundle.
 */
export function createPhysicsWorld(R: Rapier, stage: StageData, road: MeshData, terrain: MeshData): PhysicsWorld {
  const world = new R.World({ x: 0, y: SIMULATION.GRAVITY, z: 0 });
  world.timestep = SIMULATION.FIXED_TIMESTEP;
  const surfaces = new Map<number, SurfaceKind>();

  const roadCollider = world.createCollider(
    R.ColliderDesc.trimesh(road.positions, road.indices).setCollisionGroups(GROUPS.ground),
  );
  surfaces.set(roadCollider.handle, "gravel");
  const terrainCollider = world.createCollider(
    R.ColliderDesc.trimesh(terrain.positions, terrain.indices).setCollisionGroups(GROUPS.ground),
  );
  surfaces.set(terrainCollider.handle, "grass");

  for (const tree of stage.trees) {
    if (!tree.hasCollider) continue;
    const radius = tree.scale * PROPS.TREE_TRUNK_RADIUS_RATIO;
    const halfHeight = tree.scale / 2;
    world.createCollider(
      R.ColliderDesc.cylinder(halfHeight, radius)
        .setTranslation(tree.x, tree.y + halfHeight, tree.z)
        .setCollisionGroups(GROUPS.props),
    );
  }

  for (const rock of stage.rocks) {
    const radius = rock.scale * PROPS.ROCK_COLLIDER_RADIUS_RATIO;
    world.createCollider(
      R.ColliderDesc.ball(radius).setTranslation(rock.x, rock.y, rock.z).setCollisionGroups(GROUPS.props),
    );
  }

  for (const wall of stage.walls) {
    world.createCollider(
      R.ColliderDesc.cuboid(wall.halfX, wall.height / 2, wall.halfZ)
        .setTranslation(wall.x, wall.y + wall.height / 2, wall.z)
        .setCollisionGroups(GROUPS.props),
    );
  }

  for (const barrier of stage.barriers) {
    world.createCollider(
      R.ColliderDesc.cuboid(PROPS.BARRIER_LENGTH / 2, PROPS.BARRIER_HEIGHT / 2, PROPS.BARRIER_DEPTH / 2)
        .setTranslation(barrier.x, barrier.y + PROPS.BARRIER_HEIGHT / 2, barrier.z)
        .setRotation(yawRotation(barrier.yaw + BARRIER_YAW_OFFSET))
        .setCollisionGroups(GROUPS.props),
    );
  }

  const legOffset = gateHalfWidth() - GATES.LEG_THICKNESS / 2;
  for (const s of gateArcPositions(stage)) {
    const pose = poseAt(stage.samples, s);
    const lx = Math.cos(pose.heading);
    const lz = -Math.sin(pose.heading);
    for (const side of [1, -1]) {
      world.createCollider(
        R.ColliderDesc.cuboid(GATES.LEG_THICKNESS / 2, GATES.HEIGHT / 2, GATES.DEPTH / 2)
          .setTranslation(
            pose.x + lx * legOffset * side,
            pose.y - ROAD.SHOULDER_DROP + GATES.HEIGHT / 2,
            pose.z + lz * legOffset * side,
          )
          .setRotation(yawRotation(pose.heading))
          .setCollisionGroups(GROUPS.props),
      );
    }
  }

  for (const s of gateArcPositions(stage)) {
    const pose = poseAt(stage.samples, s);
    const sideOffset = ROAD.WIDTH / 2 + GATES.TOWER_OFFSET;
    const lx = Math.cos(pose.heading);
    const lz = -Math.sin(pose.heading);
    for (const side of [1, -1]) {
      world.createCollider(
        R.ColliderDesc.cuboid(
          GATES.TOWER_HALF_EXTENTS.x,
          GATES.TOWER_HALF_EXTENTS.y,
          GATES.TOWER_HALF_EXTENTS.z,
        )
          .setTranslation(
            pose.x + lx * sideOffset * side,
            pose.y - ROAD.SHOULDER_DROP + GATES.TOWER_HALF_EXTENTS.y,
            pose.z + lz * sideOffset * side,
          )
          .setRotation(yawRotation(pose.heading))
          .setCollisionGroups(GROUPS.props),
      );
    }
  }

  const coneBodies = stage.cones.map((cone) => {
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(cone.x, cone.y, cone.z).setRotation(yawRotation(cone.yaw)),
    );
    world.createCollider(
      R.ColliderDesc.cone(PROPS.CONE_HEIGHT / 2, PROPS.CONE_RADIUS)
        .setTranslation(0, PROPS.CONE_HEIGHT / 2, 0)
        .setMass(PROPS.CONE_MASS)
        .setCollisionGroups(GROUPS.debris),
      body,
    );
    return body;
  });

  return { world, surfaces, coneBodies };
}
