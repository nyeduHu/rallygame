// lib/game/stage/walls.ts
import { paletteLinear } from "../color";
import { MAZE, TERRAIN } from "../constants";
import { fbm2D } from "../noise";
import type { MeshData } from "./meshData";
import type { PropPlacement, WallBox } from "./types";

const COMPONENTS = 3;
/** Vertices per box: four per face so every face keeps a flat normal. */
const BOX_VERTICES = 24;
const BOX_INDICES = 36;

/**
 * Gentle ground height shared by every road and the terrain of a maze, so roads that overlap
 * at a junction always agree.
 * @param x - World x.
 * @param z - World z.
 * @param seed - Terrain seed.
 * @returns Height in metres.
 */
export function mazeHeight(x: number, z: number, seed: number): number {
  return MAZE.GROUND_AMPLITUDE * fbm2D(x, z, seed, { wavelength: MAZE.GROUND_WAVELENGTH, octaves: 2, persistence: TERRAIN.PERSISTENCE, lacunarity: TERRAIN.LACUNARITY });
}

/**
 * Sets each wall's base and height so it stands on the ground along its whole length.
 * @param walls - Walls at zero elevation (mutated).
 * @param height - Ground height function.
 */
export function elevateWalls(walls: WallBox[], height: (x: number, z: number) => number): void {
  for (const wall of walls) {
    let low = Infinity;
    let high = -Infinity;
    const steps = Math.max(1, Math.ceil(Math.max(wall.halfX, wall.halfZ) / TERRAIN.CELL_SIZE));
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 - 1;
      const h = height(wall.x + wall.halfX * t, wall.z + wall.halfZ * t);
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
    wall.y = low - MAZE.WALL_SINK;
    wall.height = high - low + MAZE.WALL_SINK + MAZE.WALL_HEIGHT;
  }
}

/**
 * Drops props that stand inside or right beside a wall.
 * @param props - Placements.
 * @param walls - Maze walls.
 * @returns Props clear of the walls.
 */
export function clearWalls(props: PropPlacement[], walls: ReadonlyArray<WallBox>): PropPlacement[] {
  if (walls.length === 0) return props;
  const margin = MAZE.WALL_PROP_CLEARANCE_M;
  return props.filter((p) => !walls.some((w) => Math.abs(p.x - w.x) < w.halfX + margin && Math.abs(p.z - w.z) < w.halfZ + margin));
}

/**
 * Builds one flat-shaded mesh for every wall; the physics uses cuboids instead.
 * @param walls - Elevated walls.
 * @returns Mesh arrays.
 */
export function buildWallMesh(walls: ReadonlyArray<WallBox>): MeshData {
  const positions = new Float32Array(walls.length * BOX_VERTICES * COMPONENTS);
  const colors = new Float32Array(positions.length);
  const indices = new Uint32Array(walls.length * BOX_INDICES);
  const stone = paletteLinear("mazeWall");
  const top = paletteLinear("mazeWallTop");
  /** Corner signs of each face (outward normal axis, then four corners). */
  const faces: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
    [[1, 0, 1], [1, 1, 1], [1, 1, -1], [1, 0, -1]],
    [[-1, 0, -1], [-1, 1, -1], [-1, 1, 1], [-1, 0, 1]],
    [[-1, 1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1]],
    [[-1, 0, -1], [-1, 0, 1], [1, 0, 1], [1, 0, -1]],
    [[-1, 0, 1], [-1, 1, 1], [1, 1, 1], [1, 0, 1]],
    [[1, 0, -1], [1, 1, -1], [-1, 1, -1], [-1, 0, -1]],
  ];
  walls.forEach((wall, w) => {
    faces.forEach((face, f) => {
      face.forEach(([sx, sy, sz], k) => {
        const v = (w * BOX_VERTICES + f * 4 + k) * COMPONENTS;
        positions[v] = wall.x + sx * wall.halfX;
        positions[v + 1] = wall.y + sy * wall.height;
        positions[v + 2] = wall.z + sz * wall.halfZ;
        colors.set(f === 2 ? top : stone, v);
      });
      const base = w * BOX_VERTICES + f * 4;
      indices.set([base, base + 2, base + 1, base, base + 3, base + 2], w * BOX_INDICES + f * 6);
    });
  });
  return { positions, indices, colors };
}
