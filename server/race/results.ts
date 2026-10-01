// server/race/results.ts
/** Team result data for the leaderboard. */
export interface TeamResult {
  teamId: string;
  name: string;
  status: "finished" | "dnf";
  rawMs: number;
  penaltyMs: number;
  pitMs: number;
  totalMs: number;
  damage01: number;
  fuel01: number;
  navErrors: number;
  crashes: number;
}

/** Computes the total time from the raw and penalty components. */
export function computeTotalMs(rawMs: number, penaltyMs: number, pitMs: number): number {
  return rawMs + penaltyMs + pitMs;
}

/** Formats a penalty duration in the mm:ss.cc style used by the rally results UI. */
export function formatPenalty(milliseconds: number): string {
  const totalMs = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const centiseconds = Math.floor((totalMs % 1000) / 10);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
}

/** Sorts the result list with finishers ahead of DNF teams and by total time ascending. */
export function sortResults(entries: TeamResult[]): TeamResult[] {
  return [...entries].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "finished" ? -1 : 1;
    }
    return left.totalMs - right.totalMs;
  });
}
