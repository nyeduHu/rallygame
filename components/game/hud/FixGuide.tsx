// components/game/hud/FixGuide.tsx
"use client";

import { refuelGuide, repairGuide, type Guide } from "@/lib/game/repair/repairGuide";
import { useGameStore } from "@/lib/game/store";

/**
 * Step-by-step checklist for the current repair or refuel, with the step to do now highlighted
 * and chips for the hood, the wrench and the new part.
 * @returns Panel on the left of the screen, or nothing when there is nothing to fix.
 */
export function FixGuide() {
  const mech = useGameStore((state) => state.mech);
  const repair = useGameStore((state) => state.repair);
  const hoodOpen = useGameStore((state) => state.hoodOpen);
  const footRole = useGameStore((state) => state.footRole);
  const refuel = useGameStore((state) => state.refuel);
  const pitActive = useGameStore((state) => state.pitActive);
  const onFoot = footRole !== null;
  const guide: Guide | null =
    repairGuide({ engineStatus: mech.engineStatus, brokenPart: mech.brokenPart, repair, hoodOpen, onFoot }) ??
    refuelGuide({ pitActive, refuel, fuel01: mech.fuel01, onFoot });
  if (!guide) return null;

  return (
    <aside
      aria-label="Repair guide"
      aria-live="polite"
      className="absolute left-3 top-1/2 w-72 -translate-y-1/2 rounded-lg bg-hud-surface/90 p-3 text-sm shadow-lg md:left-5"
    >
      <h2 className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-hud-accent">{guide.title}</h2>
      <ol className="flex flex-col gap-1.5">
        {guide.steps.map((step, index) => {
          const done = index < guide.current;
          const current = index === guide.current;
          return (
            <li
              key={step}
              className={`flex gap-2 leading-snug ${current ? "font-semibold text-hud-text" : done ? "text-hud-muted line-through" : "text-hud-muted"}`}
            >
              <span aria-hidden="true" className={`w-4 shrink-0 text-center ${current ? "text-hud-accent" : done ? "text-hud-success" : ""}`}>
                {done ? "✓" : current ? "▶" : index + 1}
              </span>
              <span>{step}</span>
            </li>
          );
        })}
      </ol>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {guide.chips.map((chip) => (
          <li
            key={chip.label}
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${chip.on ? "bg-hud-success/25 text-hud-success" : "bg-hud-track text-hud-muted"}`}
          >
            {chip.label}
          </li>
        ))}
      </ul>
    </aside>
  );
}
