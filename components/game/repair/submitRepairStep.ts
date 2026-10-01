// components/game/repair/submitRepairStep.ts
import { mechRuntime } from "@/lib/game/mechRuntime";
import { applyStep, settle, type RepairStep } from "@/lib/game/repair/repairMachine";
import { REPAIR } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import { rallyClient } from "@/lib/net/client";

/**
 * Sends a repair intent. Online, the server decides and the state arrives in the next snapshot
 * (no optimistic advance); in solo the same pure machine runs locally.
 * @param request - Requested step.
 */
export function submitRepairStep(request: RepairStep): void {
  const store = useGameStore.getState();
  if (store.online) {
    void rallyClient.request("repair:step", { ...request }).catch(() => undefined);
    return;
  }
  const mech = mechRuntime.current;
  const result = applyStep(store.repair, request, { engineStatus: mech.engineStatus, brokenPart: mech.brokenPart });
  if (!result.ok) return;
  store.setRepair(settle(result.state));
  if (result.effect === "hood_open") store.setHoodOpen(true);
  if (result.effect === "hood_closed") store.setHoodOpen(false);
  if (result.effect === "cooled" || result.effect === "engine_restarted") {
    const restarted = result.effect === "engine_restarted";
    mechRuntime.current = {
      ...mech,
      engineStatus: "ok",
      failHoldSeconds: 0,
      temperature01: Math.min(mech.temperature01, REPAIR.COOLED_TEMPERATURE),
      ...(restarted ? { brokenPart: null, engineHealth01: Math.max(mech.engineHealth01, REPAIR.RESTORED_HEALTH) } : {}),
    };
    store.setMech(mechRuntime.current);
  }
}
