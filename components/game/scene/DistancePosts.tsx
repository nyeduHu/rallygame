// components/game/scene/DistancePosts.tsx
"use client";

import { useMemo } from "react";
import { CanvasTexture } from "three";
import { POSTS, ROAD } from "@/lib/game/constants";
import { leftVector, poseAt } from "@/lib/game/stage/roadIndex";
import type { StageData } from "@/lib/game/stage/types";

const SHOULDER_EDGE = ROAD.WIDTH / 2 + ROAD.SHOULDER_WIDTH;
const FONT_FRACTION = 0.5;

/**
 * Draws the distance number onto a small canvas texture.
 * @param metres - Distance from the start in metres.
 * @returns Texture for the plate.
 */
function plateTexture(metres: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = POSTS.TEXTURE_PX;
  canvas.height = POSTS.TEXTURE_PX;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = POSTS.PLATE_COLOR;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = POSTS.TEXT_COLOR;
    context.font = `bold ${Math.round(canvas.height * FONT_FRACTION)}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(metres), canvas.width / 2, canvas.height / 2);
  }
  return new CanvasTexture(canvas);
}

interface PostProps {
  stage: StageData;
  metres: number;
}

/**
 * One distance post with a numbered plate facing oncoming traffic; deliberately non-solid.
 * @param props - Stage and distance from the start.
 * @returns Post group.
 */
function Post({ stage, metres }: PostProps) {
  const pose = poseAt(stage.samples, stage.startS + metres);
  const [lx, lz] = leftVector(pose.heading);
  const offset = -(SHOULDER_EDGE + POSTS.OFFSET);
  const texture = useMemo(() => plateTexture(metres), [metres]);
  return (
    <group position={[pose.x + lx * offset, pose.y - ROAD.SHOULDER_DROP, pose.z + lz * offset]} rotation={[0, pose.heading + Math.PI, 0]}>
      <mesh position={[0, POSTS.SIZE[1] / 2, 0]} castShadow>
        <boxGeometry args={[...POSTS.SIZE]} />
        <meshStandardMaterial color={POSTS.POST_COLOR} flatShading />
      </mesh>
      <mesh position={[0, POSTS.SIZE[1] + POSTS.PLATE_SIZE[1] / 2, 0]}>
        <planeGeometry args={[...POSTS.PLATE_SIZE]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </group>
  );
}

interface DistancePostsProps {
  stage: StageData;
}

/**
 * Posts every 500 m of the stage so the co-driver can match the tablet to the road.
 * @param props - Stage.
 * @returns Posts along the right edge of the road.
 */
export function DistancePosts({ stage }: DistancePostsProps) {
  const distances: number[] = [];
  for (let m = POSTS.SPACING_M; stage.startS + m < stage.finishS; m += POSTS.SPACING_M) distances.push(m);
  return (
    <>
      {distances.map((metres) => (
        <Post key={metres} stage={stage} metres={metres} />
      ))}
    </>
  );
}
