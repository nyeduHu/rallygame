// components/results/RoomResults.tsx
"use client";

import type { RoomResults as RoomResultsData } from "@/lib/net/protocol";
import { TeamResultCard } from "./TeamResultCard";

interface RoomResultsProps {
  results: RoomResultsData;
}

/**
 * Final ranking for a room.
 * @param props - Server-ranked results (finishers first, then DNF).
 * @returns Leaderboard list.
 */
export function RoomResults({ results }: RoomResultsProps) {
  return (
    <section aria-label="Final results" className="mx-auto max-w-2xl space-y-3">
      <h2 className="text-2xl font-semibold text-white">Results</h2>
      <ol className="space-y-3">
        {results.results.map((result, index) => (
          <TeamResultCard key={result.teamId} rank={index + 1} result={result} />
        ))}
      </ol>
    </section>
  );
}
