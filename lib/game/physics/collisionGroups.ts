// lib/game/physics/collisionGroups.ts
/**
 * Rapier interaction groups. Wheel rays must only hit drivable ground, otherwise a
 * wheel touching a barrier top or a cone would act as suspension contact.
 */
export const COLLISION_LAYER = {
  GROUND: 1 << 0,
  PROPS: 1 << 1,
  CHASSIS: 1 << 2,
  DEBRIS: 1 << 3,
  WHEEL_QUERY: 1 << 4,
  PLAYER: 1 << 5,
} as const;

const GROUP_BITS = 16;
const GROUP_MASK = 0xffff;

/**
 * Packs membership and filter masks into Rapier's 32-bit interaction group format.
 * @param membership - Layers this collider belongs to.
 * @param filter - Layers this collider interacts with.
 * @returns Packed interaction groups.
 */
export function interactionGroups(membership: number, filter: number): number {
  return (((membership & GROUP_MASK) << GROUP_BITS) | (filter & GROUP_MASK)) >>> 0;
}

export const GROUPS = {
  ground: interactionGroups(
    COLLISION_LAYER.GROUND,
    COLLISION_LAYER.CHASSIS | COLLISION_LAYER.DEBRIS | COLLISION_LAYER.WHEEL_QUERY | COLLISION_LAYER.PLAYER,
  ),
  props: interactionGroups(COLLISION_LAYER.PROPS, COLLISION_LAYER.CHASSIS | COLLISION_LAYER.DEBRIS | COLLISION_LAYER.PLAYER),
  chassis: interactionGroups(
    COLLISION_LAYER.CHASSIS,
    COLLISION_LAYER.GROUND | COLLISION_LAYER.PROPS | COLLISION_LAYER.DEBRIS | COLLISION_LAYER.PLAYER,
  ),
  debris: interactionGroups(
    COLLISION_LAYER.DEBRIS,
    COLLISION_LAYER.GROUND | COLLISION_LAYER.PROPS | COLLISION_LAYER.CHASSIS | COLLISION_LAYER.DEBRIS,
  ),
  player: interactionGroups(
    COLLISION_LAYER.PLAYER,
    COLLISION_LAYER.GROUND | COLLISION_LAYER.PROPS | COLLISION_LAYER.CHASSIS,
  ),
  wheelQuery: interactionGroups(COLLISION_LAYER.WHEEL_QUERY, COLLISION_LAYER.GROUND),
} as const;
