// components/game/overlays/FinishOverlay.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { HudButton } from "@/components/ui/HudButton";
import { formatStageTime } from "@/lib/game/format";
import { randomSeed } from "@/lib/game/random";

interface FinishOverlayProps {
  finishTime: number;
  splits: ReadonlyArray<number>;
  onRestart: () => void;
}

/**
 * Results dialog: final time, checkpoint splits, replay or a fresh stage.
 * @param props - Times and restart handler.
 * @returns Modal dialog.
 */
export function FinishOverlay({ finishTime, splits, onRestart }: FinishOverlayProps) {
  // Chosen once so the link target is stable across re-renders.
  const [nextSeed] = useState(randomSeed);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-overlay p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-title"
        className="w-full max-w-sm rounded-xl border border-hud-border bg-hud-surface p-6 text-center shadow-2xl backdrop-blur-sm"
      >
        <p className="font-mono text-xs uppercase tracking-widest text-hud-success">Stage complete</p>
        <h2 id="finish-title" className="mt-2 font-mono text-5xl font-bold tabular-nums text-hud-text">
          {formatStageTime(finishTime)}
        </h2>
        {splits.length > 0 && (
          <ol className="mx-auto mt-5 max-w-56 space-y-1 text-sm" aria-label="Checkpoint splits">
            {splits.map((split, i) => (
              <li key={i} className="flex justify-between text-hud-muted">
                <span>Checkpoint {i + 1}</span>
                <span className="font-mono tabular-nums text-hud-text">{formatStageTime(split)}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <HudButton className="flex-1" onClick={onRestart} autoFocus>
            Drive again
          </HudButton>
          <Link
            href={`/?seed=${nextSeed}`}
            className="flex-1 rounded-md border border-hud-border bg-hud-surface px-5 py-2.5 font-semibold text-hud-text transition-colors hover:border-hud-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hud-accent"
          >
            New stage
          </Link>
        </div>
      </section>
    </div>
  );
}
