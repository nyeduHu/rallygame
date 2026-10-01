// components/game/overlays/LoadingScreen.tsx

interface LoadingScreenProps {
  message: string;
}

/**
 * Full-screen loading state shown while the stage, physics and models load.
 * @param props - Status message.
 * @returns Loading screen.
 */
export function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-stage-bg"
    >
      <div
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-4 border-hud-track border-t-hud-accent motion-reduce:animate-none"
      />
      <p className="font-mono text-sm uppercase tracking-widest text-hud-muted">{message}</p>
    </div>
  );
}
