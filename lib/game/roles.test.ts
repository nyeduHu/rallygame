// lib/game/roles.test.ts
import { describe, expect, it } from "vitest";
import { parseRole, seatOf } from "./roles";

describe("role helpers", () => {
  it("accepts supported single role values and rejects malformed search params", () => {
    expect(parseRole("driver")).toBe("driver");
    expect(parseRole("codriver")).toBe("codriver");
    expect(parseRole("host")).toBeNull();
    expect(parseRole(["driver", "codriver"])).toBeNull();
    expect(parseRole(undefined)).toBeNull();
  });

  it("maps roles to their established cockpit seats", () => {
    expect(seatOf("driver")).toEqual({ x: 0.37 });
    expect(seatOf("codriver")).toEqual({ x: -0.37 });
  });
});
