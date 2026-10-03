// components/game/hud/Crosshair.tsx
"use client";

import { useGameStore } from "@/lib/game/store";

/**
 * Pointer-lock centre mark that expands and names the current physical target.
 * @returns Accessible crosshair overlay.
 */
export function Crosshair() {
  const hoveredLabel = useGameStore((state) => state.hoveredLabel);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" aria-live="polite">
      <div className="flex flex-col items-center gap-2 text-hud-text">
        <span
          aria-hidden="true"
          className={`relative block rounded-full border border-white/90 bg-hud-surface/50 transition-[width,height] duration-100 ${
            hoveredLabel ? "h-5 w-5" : "h-3 w-3"
          }`}
        />
        {hoveredLabel && (
          <span className="rounded-md bg-hud-surface/90 px-2.5 py-1 text-xs font-semibold shadow-lg">
            {hoveredLabel}
          </span>
        )}
      </div>
    </div>
  );
}
