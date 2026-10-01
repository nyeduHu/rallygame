// components/lobby/ReadyButton.tsx
"use client";

interface ReadyButtonProps {
  ready: boolean;
  disabled: boolean;
  onToggle: (ready: boolean) => void;
}

/**
 * Ready toggle; disabled until the player has a seat.
 * @param props - Current state and handler.
 * @returns Toggle button.
 */
export function ReadyButton({ ready, disabled, onToggle }: ReadyButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={ready}
      disabled={disabled}
      onClick={() => onToggle(!ready)}
      className="rounded bg-cyan-500 px-4 py-2 font-medium text-slate-950 disabled:opacity-50"
    >
      {ready ? "Not ready" : "Ready"}
    </button>
  );
}
