// lib/net/clockSync.ts
/** Minimal network clock offset estimator for server-synced countdowns. */
export interface ClockSample {
  t0: number;
  serverNow: number;
  rtt: number;
}

/** Calculates the median clock offset across a set of samples. */
export function calculateClockOffset(samples: ClockSample[]): number {
  if (samples.length === 0) {
    return 0;
  }

  const values = [...samples].map((sample) => sample.serverNow - (sample.t0 + sample.rtt / 2)).sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)] ?? 0;
}

/** Returns a server-time estimate using the current offset. */
export function estimateServerNow(offsetMs: number, localNowMs: number): number {
  return localNowMs + offsetMs;
}
