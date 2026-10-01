// components/game/hud/VisibilityBar.tsx
"use client";

import { useGameStore } from "@/lib/game/store";

/**
 * Debug-only windshield visibility meter, shown with `&debug=1`.
 * @returns Meter or nothing.
 */
export function VisibilityBar() {
  const debug = useGameStore((state) => state.debug);
  const visibility = useGameStore((state) => state.visibility);
  if (!debug) return null;
  return (
    <label className="absolute bottom-2 left-2 flex items-center gap-2 rounded-md bg-hud-surface px-2 py-1 text-xs text-hud-muted">
      VISIBILITY
      <meter min={0} max={1} value={visibility} className="w-32" />
    </label>
  );
}
