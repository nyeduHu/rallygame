// lib/game/sessionView.ts
import type { Quaternion, Vector3 } from "three";
import type { StageData } from "./stage/types";

/** Wheel values the exterior model reads. */
export interface WheelView {
  readonly spinAngle: number;
  readonly steerAngle: number;
  readonly inContact: boolean;
  readonly compression: number;
}

/** The slice of a vehicle that cockpit, gauges and camera visuals read. */
export interface VehicleView {
  readonly forwardSpeed: number;
  readonly steer: number;
  readonly handbrake: boolean;
  /** Largest sideways tyre slip speed (m/s) this step. */
  readonly slipSpeed: number;
  readonly drivetrain: { readonly rpm: number; readonly reverse: boolean; readonly brake: number };
  readonly wheels: ReadonlyArray<WheelView>;
  readonly body: { linvel(): { x: number; y: number; z: number } };
}

/** A cone body as read by the instanced cone renderer. */
export interface ConeBodyView {
  translation(): { x: number; y: number; z: number };
  rotation(): { x: number; y: number; z: number; w: number };
}

/**
 * What the visual layer needs from a session. `GameSession` implements it with real physics;
 * `RemoteSession` implements it from server snapshots so the co-driver never loads Rapier.
 */
export interface SessionView {
  readonly stage: StageData;
  /** Car pose for rendering this frame. */
  readonly renderPosition: Vector3;
  readonly renderQuaternion: Quaternion;
  readonly vehicle: VehicleView;
  readonly physics: { readonly coneBodies: ReadonlyArray<ConeBodyView> };
}
