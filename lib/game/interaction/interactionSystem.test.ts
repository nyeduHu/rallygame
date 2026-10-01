// lib/game/interaction/interactionSystem.test.ts
import { describe, expect, it, vi } from "vitest";
import { pickNearest, type InteractableSpec, type InteractionHit } from "./interactionSystem";

/** Creates a test interactable with role and enabled-state controls. */
function makeSpec(id: string, roles: InteractableSpec["roles"], enabled = true): InteractableSpec {
  return {
    id,
    kind: "press",
    roles,
    isEnabled: vi.fn(() => enabled),
    label: id,
    getObjects: () => [],
  };
}

describe("pickNearest", () => {
  it("selects the closest enabled target allowed for the active role", () => {
    const far = makeSpec("far", ["codriver"]);
    const close = makeSpec("close", ["driver"]);
    const specs = new Map([[far.id, far], [close.id, close]]);
    const hits: InteractionHit[] = [{ id: far.id, distance: 0.4 }, { id: close.id, distance: 0.8 }];

    expect(pickNearest(hits, specs, "driver")).toBe(close);
  });

  it("skips disabled and wrong-role targets", () => {
    const disabled = makeSpec("disabled", ["driver"], false);
    const wrongRole = makeSpec("wrong-role", ["codriver"]);
    const specs = new Map([[disabled.id, disabled], [wrongRole.id, wrongRole]]);
    const hits: InteractionHit[] = [
      { id: disabled.id, distance: 0.2 },
      { id: wrongRole.id, distance: 0.3 },
    ];

    expect(pickNearest(hits, specs, "driver")).toBeNull();
  });
});
