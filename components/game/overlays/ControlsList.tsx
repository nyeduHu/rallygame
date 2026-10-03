// components/game/overlays/ControlsList.tsx

/** Controls from spec section 18, plus prototype helpers (reset, camera, restart). */
const CONTROLS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: "W", action: "Throttle" },
  { keys: "S", action: "Brake / reverse" },
  { keys: "A / D", action: "Steer" },
  { keys: "Space", action: "Handbrake" },
  { keys: "Mouse", action: "Look around" },
  { keys: "R", action: "Reset to road" },
  { keys: "C", action: "Cockpit / chase view" },
  { keys: "N", action: "Mute / unmute" },
  { keys: "Q / E", action: "Co-driver: zoom the map (look at the tablet)" },
  { keys: "W A S D", action: "Co-driver: move the map" },
  { keys: "M", action: "Co-driver: full map / centred on car" },
  { keys: "H", action: "Co-driver: hint, next 5 turns (3 per race)" },
  { keys: "F", action: "Get out / in (car stopped)" },
  { keys: "Shift", action: "Sprint (on foot)" },
  { keys: "Enter", action: "Restart after finish" },
];

/**
 * Key binding reference.
 * @returns Definition list of controls.
 */
export function ControlsList() {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-left text-sm">
      {CONTROLS.map(({ keys, action }) => (
        <div key={keys} className="contents">
          <dt>
            <kbd className="rounded border border-hud-border bg-hud-track px-1.5 py-0.5 font-mono text-xs text-hud-text">
              {keys}
            </kbd>
          </dt>
          <dd className="text-hud-muted">{action}</dd>
        </div>
      ))}
    </dl>
  );
}
