// lib/game/format.ts
const SECONDS_PER_MINUTE = 60;
const CENTISECONDS_PER_SECOND = 100;
const PAD_WIDTH = 2;

/**
 * Formats a stage time as m:ss.cc, the usual rally timing format.
 * @param seconds - Time in seconds.
 * @returns Formatted time.
 */
export function formatStageTime(seconds: number): string {
  const totalCentis = Math.max(0, Math.floor(seconds * CENTISECONDS_PER_SECOND));
  const minutes = Math.floor(totalCentis / (SECONDS_PER_MINUTE * CENTISECONDS_PER_SECOND));
  const secs = Math.floor(totalCentis / CENTISECONDS_PER_SECOND) % SECONDS_PER_MINUTE;
  const centis = totalCentis % CENTISECONDS_PER_SECOND;
  return `${minutes}:${String(secs).padStart(PAD_WIDTH, "0")}.${String(centis).padStart(PAD_WIDTH, "0")}`;
}
