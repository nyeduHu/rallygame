// components/game/RallyGame.tsx
"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { CAMERA, MAZE_MAP, RENDER } from "@/lib/game/constants";
import { KeyboardControls } from "@/lib/game/input/keyboardControls";
import { MouseLook } from "@/lib/game/input/mouseLook";
import { useGameStore } from "@/lib/game/store";
import { setTuningEnabled } from "@/lib/game/tuning";
import { InteractionSystem } from "@/lib/game/interaction/interactionSystem";
import type { Role } from "@/lib/game/roles";
import { Hud } from "./hud/Hud";
import { FinishOverlay } from "./overlays/FinishOverlay";
import { LoadingScreen } from "./overlays/LoadingScreen";
import { StartOverlay } from "./overlays/StartOverlay";
import { TuningPanel } from "./hud/TuningPanel";
import { Crosshair } from "./hud/Crosshair";
import { VisibilityBar } from "./hud/VisibilityBar";
import { GameScene } from "./scene/GameScene";
import type { BrokenPart } from "@/lib/game/vehicle/mechanics";
import { GameSession } from "@/lib/game/session";
import { useGameSession } from "./useGameSession";

interface RallyGameProps {
  seed: number;
  role: Role;
  solo: boolean;
  /** Online room race: the server owns start time and results; omit for the solo prototype. */
  online?: { ownTeamId: string; remoteTeamIds: string[] };
}

const METRES_PER_KM = 1000;

/** @returns The broken part named in the URL, or null. */
function parseBrokenPart(raw: string | null): BrokenPart | null {
  return raw === "radiator_hose" || raw === "spark_plug" || raw === "drive_belt" ? raw : null;
}
const KM_DECIMALS = 1;
const CAMERA_SETTINGS = { fov: CAMERA.FOV, near: CAMERA.NEAR, far: CAMERA.FAR } as const;
const PIXEL_RATIO: [number, number] = [1, RENDER.MAX_PIXEL_RATIO];

/**
 * Phase 1 driving prototype: one seeded stage, one car, HUD and start/finish flow.
 * @param props - Stage seed.
 * @returns Canvas plus DOM overlays.
 */
export function RallyGame({ seed, role, solo, online }: RallyGameProps) {
  const { session, road, terrain, error } = useGameSession(seed, online !== undefined && role === "codriver");
  const keyboard = useMemo(() => new KeyboardControls(solo), [solo]);
  const mouseLook = useMemo(() => new MouseLook(), []);
  const interactionSystem = useMemo(() => new InteractionSystem(), []);
  const [sceneReady, setSceneReady] = useState(false);
  const phase = useGameStore((state) => state.race.phase);
  const finishTime = useGameStore((state) => state.race.finishTime);
  const splits = useGameStore((state) => state.race.splits);
  const setPointerLocked = useGameStore((state) => state.setPointerLocked);
  const setRole = useGameStore((state) => state.setRole);
  const setSoloActiveRole = useGameStore((state) => state.setSoloActiveRole);
  const showTuningPanel =
    process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).get("tune") === "1";

  const handleStart = useCallback(() => {
    if (!(session instanceof GameSession)) return;
    mouseLook.requestLock();
    session.beginCountdown();
  }, [session, mouseLook]);

  const handleRestart = useCallback(() => {
    if (!(session instanceof GameSession)) return;
    session.restart();
    mouseLook.requestLock();
    session.beginCountdown();
  }, [session, mouseLook]);

  useEffect(() => {
    keyboard.attach();
    return () => keyboard.detach();
  }, [keyboard]);

  useEffect(() => {
    setRole(role);
    setSoloActiveRole(role);
    if (role === "codriver") mouseLook.pitch = -MAZE_MAP.START_PITCH_DOWN_RAD;
    return keyboard.onRoleSwapChange((held) => setSoloActiveRole(held ? (role === "driver" ? "codriver" : "driver") : role));
  }, [keyboard, mouseLook, role, setRole, setSoloActiveRole]);

  useEffect(() => () => mouseLook.detach(), [mouseLook]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    useGameStore.getState().setFlags({
      rainForced: params.get("rain") === "1",
      debug: params.get("debug") === "1",
      online: online !== undefined,
      overheatForced: params.get("overheat") === "1",
      failPart: parseBrokenPart(params.get("fail")),
    });
  }, [online]);

  useEffect(() => {
    setTuningEnabled(showTuningPanel);
    return () => setTuningEnabled(false);
  }, [showTuningPanel]);

  useEffect(() => {
    if (!(session instanceof GameSession)) return;
    return keyboard.onAction((action) => {
      if (action === "resetToRoad") session.resetToRoad();
      if (action === "toggleView") useGameStore.getState().toggleView();
      if (action === "restart" && session.race.currentPhase === "finished") handleRestart();
    });
  }, [keyboard, session, handleRestart]);

  // Free the mouse on the results screen so the buttons are clickable.
  useEffect(() => {
    if (phase === "finished") mouseLook.releaseLock();
  }, [phase, mouseLook]);

  const handleReady = useCallback(() => setSceneReady(true), []);

  if (error) throw new Error(error);

  return (
    <div className="absolute inset-0">
      {session && (
        <Canvas
          shadows="percentage"
          dpr={PIXEL_RATIO}
          camera={CAMERA_SETTINGS}
          onCreated={({ gl }) => mouseLook.attach(gl.domElement, setPointerLocked)}
          aria-label="Rally stage view"
        >
          <Suspense fallback={null}>
            <GameScene
              session={session}
              road={road}
              terrain={terrain}
              keyboard={keyboard}
              role={role}
              solo={solo}
              mouseLook={mouseLook}
              interactionSystem={interactionSystem}
              online={online}
              onReady={handleReady}
            />
          </Suspense>
        </Canvas>
      )}
      {sceneReady && session ? (
        <>
          <Hud />
          <Crosshair />
          <VisibilityBar />
          {showTuningPanel && <TuningPanel />}
          {phase === "ready" && !online && (
            <StartOverlay
              seed={seed}
              stageLengthKm={((session.stage.finishS - session.stage.startS) / METRES_PER_KM).toFixed(KM_DECIMALS)}
              onStart={handleStart}
            />
          )}
          {phase === "finished" && finishTime !== null && !online && (
            <FinishOverlay finishTime={finishTime} splits={splits} onRestart={handleRestart} />
          )}
        </>
      ) : (
        <LoadingScreen message={session ? "Loading scenery" : "Generating stage"} />
      )}
    </div>
  );
}
