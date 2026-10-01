// components/game/hud/MechanicsBars.tsx
"use client";

import { useGameStore } from "@/lib/game/store";

interface BarProps {
  label: string;
  value: number;
  /** True when a low value is bad (fuel, engine); false when high is bad (damage, temperature). */
  lowIsBad: boolean;
}

/**
 * One labelled meter row.
 * @param props - Label, 0..1 value and polarity.
 * @returns Meter row.
 */
function Bar({ label, value, lowIsBad }: BarProps) {
  return (
    <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-hud-muted">
      <span className="w-14">{label}</span>
      <meter
        aria-label={label}
        min={0}
        max={1}
        low={lowIsBad ? 0.25 : undefined}
        high={lowIsBad ? undefined : 0.75}
        optimum={lowIsBad ? 1 : 0}
        value={value}
        className="h-1.5 w-24 appearance-none overflow-hidden rounded-full [&::-webkit-meter-bar]:border-0 [&::-webkit-meter-bar]:bg-hud-track [&::-webkit-meter-even-less-good-value]:bg-hud-danger [&::-webkit-meter-optimum-value]:bg-hud-success [&::-webkit-meter-suboptimum-value]:bg-hud-accent"
      />
    </label>
  );
}

/**
 * Minimal ENGINE / DAMAGE / FUEL / TEMP bars, bottom left (spec section 16).
 * @returns Bars panel.
 */
export function MechanicsBars() {
  const mech = useGameStore((state) => state.mech);
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-hud-border bg-hud-surface px-3 py-2 backdrop-blur-sm">
      <Bar label="Engine" value={mech.engineHealth01} lowIsBad />
      <Bar label="Damage" value={mech.damage01} lowIsBad={false} />
      <Bar label="Fuel" value={mech.fuel01} lowIsBad />
      <Bar label="Temp" value={mech.temperature01} lowIsBad={false} />
    </div>
  );
}
