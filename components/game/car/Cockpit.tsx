// components/game/car/Cockpit.tsx
"use client";

import type { SessionView } from "@/lib/game/sessionView";
import type { Role } from "@/lib/game/roles";
import { CockpitShell } from "./CockpitShell";
import { Gauges } from "./Gauges";
import { Levers } from "./Levers";
import { PassengerSide } from "./PassengerSide";
import { SteeringWheel } from "./SteeringWheel";
import { WindshieldGlass } from "./WindshieldGlass";
import { Wipers } from "./Wipers";

interface CockpitProps {
  session: SessionView;
  activeRole: Role;
}

/**
 * Driver's-seat interior (spec section 17): shell, dashboard gauges, steering
 * wheel with hands, gear lever and handbrake. Lives in car-local space.
 * @param props - Game session.
 * @returns Cockpit group.
 */
export function Cockpit({ session, activeRole }: CockpitProps) {
  return (
    <group name="cockpit">
      <CockpitShell />
      <WindshieldGlass />
      <Wipers />
      <Gauges session={session} />
      <SteeringWheel session={session} />
      <Levers session={session} />
      <PassengerSide session={session} activeRole={activeRole} />
    </group>
  );
}
