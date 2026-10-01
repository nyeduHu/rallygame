// server/net/rateLimit.ts
/** Token bucket with an injectable clock; capacity equals one second of the allowed rate. */
export class TokenBucket {
  private tokens: number;
  private lastMs: number;

  /**
   * @param ratePerSecond - Sustained events per second (also the burst size).
   * @param now - Clock in ms.
   */
  constructor(
    private readonly ratePerSecond: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.tokens = ratePerSecond;
    this.lastMs = now();
  }

  /** @returns True when the event is allowed, false when it must be dropped. */
  take(): boolean {
    const nowMs = this.now();
    this.tokens = Math.min(this.ratePerSecond, this.tokens + ((nowMs - this.lastMs) / 1000) * this.ratePerSecond);
    this.lastMs = nowMs;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
