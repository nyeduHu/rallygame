// components/game/hud/Speedometer.tsx
"use client";

import { DRIVETRAIN } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";

const SURFACE_LABELS = { gravel: "Gravel", grass: "Grass" } as const;

/**
 * Speed, gear, rev meter and current surface, bottom right.
 * @returns Speedometer panel.
 */
export function Speedometer() {
  const speedKmh = useGameStore((state) => state.telemetry.speedKmh);
  const rpm = useGameStore((state) => state.telemetry.rpm);
  const gear = useGameStore((state) => state.telemetry.gear);
  const surface = useGameStore((state) => state.telemetry.surface);

  return (
    <div className="flex min-w-44 flex-col gap-1.5 rounded-lg border border-hud-border bg-hud-surface px-4 py-3 backdrop-blur-sm">
      <div className="flex items-end justify-between gap-4">
        <p className="font-mono leading-none tabular-nums">
          <span className="text-4xl font-bold">{Math.round(speedKmh)}</span>
          <span className="ml-1 text-xs text-hud-muted">km/h</span>
        </p>
        <p aria-label={`Gear ${gear}`} className="font-mono text-3xl font-bold leading-none text-hud-accent">
          {gear}
        </p>
      </div>
      <meter
        aria-label="Engine RPM"
        min={0}
        max={DRIVETRAIN.REDLINE_RPM}
        low={DRIVETRAIN.SHIFT_DOWN_RPM}
        high={DRIVETRAIN.SHIFT_UP_RPM}
        optimum={DRIVETRAIN.SHIFT_DOWN_RPM}
        value={rpm}
        className="h-2 w-full appearance-none overflow-hidden rounded-full [&::-moz-meter-bar]:bg-hud-accent [&::-webkit-meter-bar]:rounded-full [&::-webkit-meter-bar]:border-0 [&::-webkit-meter-bar]:bg-hud-track [&::-webkit-meter-even-less-good-value]:bg-hud-danger [&::-webkit-meter-optimum-value]:bg-hud-accent [&::-webkit-meter-suboptimum-value]:bg-hud-accent"
      />
      <p className="flex justify-between font-mono text-xs uppercase tracking-widest text-hud-muted">
        <span className="tabular-nums">{Math.round(rpm)} rpm</span>
        <span>{surface ? SURFACE_LABELS[surface] : "Airborne"}</span>
      </p>
    </div>
  );
}
