// components/game/hud/StageTimer.tsx
"use client";

import { formatStageTime } from "@/lib/game/format";
import { useGameStore } from "@/lib/game/store";

const PERCENT = 100;

/**
 * Stage clock, checkpoint counter and progress bar, top centre.
 * @returns Timer panel.
 */
export function StageTimer() {
  const elapsed = useGameStore((state) => state.race.elapsed);
  const passed = useGameStore((state) => state.race.checkpointsPassed);
  const total = useGameStore((state) => state.race.checkpointTotal);
  const progress = useGameStore((state) => state.race.progress);

  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-hud-border bg-hud-surface px-4 py-2 backdrop-blur-sm">
      <span role="timer" aria-label="Stage time" className="font-mono text-2xl font-bold tabular-nums md:text-3xl">
        {formatStageTime(elapsed)}
      </span>
      <span className="font-mono text-xs uppercase tracking-widest text-hud-muted" aria-live="polite">
        Checkpoint {passed}/{total}
      </span>
      <meter
        aria-label="Stage progress"
        min={0}
        max={PERCENT}
        value={progress * PERCENT}
        className="h-1.5 w-40 appearance-none overflow-hidden rounded-full [&::-moz-meter-bar]:bg-hud-accent [&::-webkit-meter-bar]:rounded-full [&::-webkit-meter-bar]:border-0 [&::-webkit-meter-bar]:bg-hud-track [&::-webkit-meter-optimum-value]:bg-hud-accent"
      />
    </div>
  );
}
