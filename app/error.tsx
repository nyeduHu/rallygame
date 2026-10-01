// app/error.tsx
"use client";

import { HudButton } from "@/components/ui/HudButton";

interface ErrorPageProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * Route error boundary, e.g. WebGL unavailable or physics failed to initialise.
 * @param props - Error and retry callback.
 * @returns Error screen with retry.
 */
export default function ErrorPage({ error, retry }: ErrorPageProps) {
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 bg-stage-bg p-6 text-center">
      <h2 className="text-2xl font-bold text-hud-text">The stage crashed</h2>
      <p className="max-w-md text-sm text-hud-muted">{error.message}</p>
      <HudButton onClick={retry}>Try again</HudButton>
    </div>
  );
}
