// components/game/scene/GameScene.tsx
"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect } from "react";
import { BARRIER_MODEL_PATHS, MODEL_PATHS, ROCK_MODEL_PATHS, TREE_MODEL_PATHS } from "@/lib/game/assets";
import type { KeyboardControls } from "@/lib/game/input/keyboardControls";
import type { MouseLook } from "@/lib/game/input/mouseLook";
import { GameSession } from "@/lib/game/session";
import { RemoteSession } from "@/lib/game/remoteSession";
import type { SessionView } from "@/lib/game/sessionView";
import type { MeshData } from "@/lib/game/stage/meshData";
import type { Role } from "@/lib/game/roles";
import { CameraRig } from "../car/CameraRig";
import { CarRig } from "../car/CarRig";
import { Cones } from "./Cones";
import { Gates } from "./Gates";
import { GroundMesh } from "./GroundMesh";
import { Lighting } from "./Lighting";
import { RemoteDriver } from "./RemoteDriver";
import { SimulationDriver } from "./SimulationDriver";
import { GhostCars } from "./GhostCars";
import { NetDriver } from "./NetDriver";
import { StageProps } from "./StageProps";
import { InteractionDriver } from "../interaction/InteractionDriver";
import type { InteractionSystem } from "@/lib/game/interaction/interactionSystem";

// Start every model download immediately instead of waterfalling through Suspense.
[...Object.values(MODEL_PATHS), ...TREE_MODEL_PATHS, ...ROCK_MODEL_PATHS, ...BARRIER_MODEL_PATHS].forEach((path) =>
  useGLTF.preload(path),
);

interface GameSceneProps {
  session: SessionView;
  road: MeshData;
  terrain: MeshData;
  keyboard: KeyboardControls;
  role: Role;
  solo: boolean;
  interactionSystem: InteractionSystem;
  mouseLook: MouseLook;
  /** Online race: other teams to draw as ghosts; the driver also streams poses. */
  online?: { ownTeamId: string; remoteTeamIds: string[] };
  /** Called once all suspended assets have mounted. */
  onReady: () => void;
}

/**
 * Signals readiness after the suspended scene has committed.
 * @param props - Ready callback.
 * @returns Nothing visible.
 */
function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

/**
 * Everything inside the canvas: environment, stage, car, camera and the simulation loop.
 * @param props - Session, meshes and input sources.
 * @returns Scene graph.
 */
export function GameScene({
  session,
  road,
  terrain,
  keyboard,
  role,
  solo,
  mouseLook,
  interactionSystem,
  online,
  onReady,
}: GameSceneProps) {
  return (
    <InteractionDriver system={interactionSystem} mouseLook={mouseLook} role={role} solo={solo}>
      <Lighting session={session} />
      <GroundMesh mesh={terrain} name="terrain" />
      <GroundMesh mesh={road} name="road" />
      <StageProps stage={session.stage} />
      <Gates stage={session.stage} />
      <Cones session={session} />
      <CarRig session={session} role={role} solo={solo} />
      <CameraRig session={session} mouseLook={mouseLook} role={role} solo={solo} />
      {session instanceof GameSession && (
        <SimulationDriver session={session} keyboard={keyboard} role={role} solo={solo} />
      )}
      {session instanceof RemoteSession && online && <RemoteDriver session={session} teamId={online.ownTeamId} />}
      {online && role === "driver" && session instanceof GameSession && <NetDriver session={session} />}
      {online && <GhostCars teamIds={online.remoteTeamIds} />}
      <ReadySignal onReady={onReady} />
    </InteractionDriver>
  );
}
