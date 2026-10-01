// components/game/overlays/StartOverlay.tsx
"use client";

import Link from "next/link";
import { HudButton } from "@/components/ui/HudButton";
import { ControlsList } from "./ControlsList";

interface StartOverlayProps {
  seed: number;
  stageLengthKm: string;
  onStart: () => void;
}

/**
 * Pre-start screen: seed, stage length, controls and the start button (which also
 * captures the mouse, since pointer lock requires a user gesture).
 * @param props - Stage info and start handler.
 * @returns Modal dialog.
 */
export function StartOverlay({ seed, stageLengthKm, onStart }: StartOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-overlay p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-title"
        className="w-full max-w-sm rounded-xl border border-hud-border bg-hud-surface p-6 shadow-2xl backdrop-blur-sm md:max-w-md"
      >
        <p className="font-mono text-xs uppercase tracking-widest text-hud-accent">Rally seed {seed}</p>
        <h2 id="start-title" className="mt-1 text-2xl font-bold text-hud-text">
          Forest stage · {stageLengthKm} km
        </h2>
        <p className="mt-2 text-sm text-hud-muted">Pass every checkpoint gate and cross the finish as fast as you can.</p>
        <div className="mt-5">
          <ControlsList />
        </div>
        <HudButton className="mt-6 w-full" onClick={onStart} autoFocus>
          Start stage
        </HudButton>
        <Link href="/rally" className="mt-3 block text-center text-sm text-hud-accent underline">
          Play online with a friend (create or join a lobby)
        </Link>
      </section>
    </div>
  );
}
