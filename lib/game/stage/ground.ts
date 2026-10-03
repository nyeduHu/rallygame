// lib/game/stage/ground.ts
import { ROAD_NETWORK, TERRAIN } from "../constants";
import { fbm2D } from "../noise";

/**
 * Gentle ground height shared by every road and the terrain, so roads that overlap at a junction
 * always agree.
 * @param x - World x.
 * @param z - World z.
 * @param seed - Terrain seed.
 * @returns Height in metres.
 */
export function networkHeight(x: number, z: number, seed: number): number {
  return ROAD_NETWORK.GROUND_AMPLITUDE * fbm2D(x, z, seed, { wavelength: ROAD_NETWORK.GROUND_WAVELENGTH, octaves: 2, persistence: TERRAIN.PERSISTENCE, lacunarity: TERRAIN.LACUNARITY });
}
