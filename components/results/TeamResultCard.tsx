// components/results/TeamResultCard.tsx
"use client";

import { formatPenalty } from "@/server/race/results";
import type { RoomResults } from "@/lib/net/protocol";

type Result = RoomResults["results"][number];

interface TeamResultCardProps {
  rank: number;
  result: Result;
}

/**
 * One row of the ranking with the raw + penalty + pit breakdown.
 * @param props - Rank and result.
 * @returns Result card.
 */
export function TeamResultCard({ rank, result }: TeamResultCardProps) {
  const finished = result.status === "finished";
  return (
    <li className="rounded-2xl border border-white/15 bg-slate-900/80 p-4 text-white">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">
          {rank}. {result.name}
        </h3>
        <span className="font-mono text-xl">{finished ? formatPenalty(result.totalMs) : "DNF"}</span>
      </div>
      {finished && (
        <p className="mt-1 font-mono text-sm text-slate-400">
          {formatPenalty(result.rawMs)} + {formatPenalty(result.penaltyMs)} penalties + {formatPenalty(result.pitMs)} pit
        </p>
      )}
    </li>
  );
}
