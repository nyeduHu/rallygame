// components/game/hud/Hud.tsx
"use client";

import { useGameStore } from "@/lib/game/store";
import { MechanicsBars } from "./MechanicsBars";
import { Speedometer } from "./Speedometer";
import { StageTimer } from "./StageTimer";

/**
 * Countdown digits during the 3-2-1 start.
 * @returns Countdown display or nothing.
 */
function Countdown() {
  const phase = useGameStore((state) => state.race.phase);
  const remaining = useGameStore((state) => state.race.countdownRemaining);
  if (phase !== "countdown") return null;
  return (
    <p
      aria-live="assertive"
      className="font-mono text-8xl font-black text-hud-accent drop-shadow-lg motion-safe:animate-pulse"
    >
      {Math.max(1, Math.ceil(remaining))}
    </p>
  );
}

/**
 * Pit stop banner: what is still missing, then GO.
 * @returns Banner or nothing.
 */
function PitBanner() {
  const pitActive = useGameStore((state) => state.pitActive);
  const pitReady = useGameStore((state) => state.pitReady);
  if (!pitActive) return null;
  return (
    <p aria-live="polite" className="rounded-md bg-hud-surface px-4 py-2 font-mono text-lg font-bold">
      {pitReady ? <span className="text-hud-success">GO!</span> : <span className="text-hud-accent">PIT STOP</span>}
    </p>
  );
}

/**
 * Reminder shown while driving without mouse capture.
 * @returns Hint or nothing.
 */
function PointerHint() {
  const locked = useGameStore((state) => state.pointerLocked);
  const phase = useGameStore((state) => state.race.phase);
  if (locked || phase === "ready" || phase === "finished") return null;
  return (
    <p className="rounded-md bg-hud-surface px-3 py-1.5 text-xs text-hud-muted">Click the view to look around with the mouse</p>
  );
}

/**
 * Minimal driving HUD (speed, rpm/gear, timer). Purely presentational and never
 * intercepts pointer input meant for the canvas.
 * @returns HUD overlay.
 */
export function Hud() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 text-hud-text md:p-5">
      <div className="flex justify-center">
        <StageTimer />
      </div>
      <div className="flex flex-col items-center gap-3">
        <Countdown />
        <PitBanner />
        <PointerHint />
      </div>
      <div className="flex items-end justify-between">
        <MechanicsBars />
        <Speedometer />
      </div>
    </div>
  );
}
