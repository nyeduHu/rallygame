// server/net/rateLimit.test.ts
import { describe, expect, it } from "vitest";
import { TokenBucket } from "./rateLimit";

describe("TokenBucket", () => {
  it("allows a burst up to the rate, then drops, then refills", () => {
    let now = 0;
    const bucket = new TokenBucket(30, () => now);
    const allowed = Array.from({ length: 40 }, () => bucket.take()).filter(Boolean).length;
    expect(allowed).toBe(30);
    now += 100;
    expect(bucket.take()).toBe(true);
  });
});
