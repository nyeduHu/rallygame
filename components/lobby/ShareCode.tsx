// components/lobby/ShareCode.tsx
"use client";

import { useState } from "react";

interface ShareCodeProps {
  code: string;
}

/**
 * Room code with a copy button; the status text is announced politely.
 * @param props - Room code.
 * @returns Share row.
 */
export function ShareCode({ code }: ShareCodeProps) {
  const [status, setStatus] = useState("");
  const copy = (): void => {
    navigator.clipboard
      .writeText(code)
      .then(() => setStatus("Copied"))
      .catch(() => setStatus("Copy failed"));
  };
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm uppercase tracking-widest text-slate-400">Room code</span>
      <span className="font-mono text-2xl text-cyan-300">{code}</span>
      <button type="button" onClick={copy} className="rounded bg-slate-700 px-3 py-1 text-sm">
        Copy
      </button>
      <span aria-live="polite" className="text-sm text-slate-400">{status}</span>
    </div>
  );
}
