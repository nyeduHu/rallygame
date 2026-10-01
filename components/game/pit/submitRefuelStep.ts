// components/game/pit/submitRefuelStep.ts
import { applyRefuelStep, type RefuelStepName } from "@/lib/game/refuel/refuelMachine";
import { useGameStore } from "@/lib/game/store";
import { rallyClient } from "@/lib/net/client";

/**
 * Sends a refuelling intent. Online, the server validates distance and order and the state
 * returns in the next snapshot; in solo the same pure machine runs locally.
 * @param step - Requested step.
 */
export function submitRefuelStep(step: RefuelStepName): void {
  const store = useGameStore.getState();
  if (store.online) {
    void rallyClient.request("refuel:step", { step }).catch(() => undefined);
    return;
  }
  const result = applyRefuelStep(store.refuel, step);
  if (result.ok) store.setRefuel(result.state);
}
