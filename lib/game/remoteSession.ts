// lib/game/remoteSession.ts
import { Quaternion, Vector3 } from "three";
import { DRIVETRAIN, STEERING, VEHICLE } from "./constants";
import { lerp, smoothstep } from "./math";
import type { SessionView, VehicleView } from "./sessionView";
import type { StageData } from "./stage/types";
import { NET } from "../net/netConstants";
import type { TeamSnapshot } from "../net/protocol";

const FORWARD = new Vector3(0, 0, 1);
const WHEEL_COUNT = 4;
const FRONT_WHEELS = 2;

/** Mutable wheel record so visuals can read the same shape as the physics vehicle. */
interface MutableWheel {
  spinAngle: number;
  steerAngle: number;
  inContact: boolean;
  compression: number;
}

/**
 * Physics-free stand-in for GameSession used by the co-driver: the car pose and dashboard values
 * come from the interpolated server snapshots of the team's own car.
 */
export class RemoteSession implements SessionView {
  readonly renderPosition = new Vector3();
  readonly renderQuaternion = new Quaternion();
  readonly physics = { coneBodies: [] } as const;
  readonly vehicle: VehicleView;
  private readonly velocity = new Vector3();
  private readonly forward = new Vector3();
  private readonly state: { forwardSpeed: number; steer: number; rpm: number; reverse: boolean } = {
    forwardSpeed: 0,
    steer: 0,
    rpm: DRIVETRAIN.IDLE_RPM,
    reverse: false,
  };
  private readonly wheels: MutableWheel[] = Array.from({ length: WHEEL_COUNT }, () => ({
    spinAngle: 0,
    steerAngle: 0,
    inContact: false,
    compression: 0,
  }));

  /**
   * @param stage - Generated stage (the same seed the driver runs).
   */
  constructor(readonly stage: StageData) {
    const { spawn } = stage;
    this.renderPosition.set(spawn.x, spawn.y + VEHICLE.SPAWN_LIFT, spawn.z);
    this.renderQuaternion.setFromAxisAngle(new Vector3(0, 1, 0), spawn.heading);
    const state = this.state;
    const velocity = this.velocity;
    this.vehicle = {
      get forwardSpeed() {
        return state.forwardSpeed;
      },
      get steer() {
        return state.steer;
      },
      handbrake: false,
      get drivetrain() {
        return { rpm: state.rpm, reverse: state.reverse };
      },
      wheels: this.wheels,
      body: { linvel: () => ({ x: velocity.x, y: velocity.y, z: velocity.z }) },
    };
  }

  /**
   * Applies an interpolated server pose and derives the dashboard values from it.
   * @param pose - Interpolated team snapshot, or null before any snapshot arrives.
   * @param dt - Frame time in seconds, used to advance wheel spin.
   */
  applyPose(pose: TeamSnapshot | null, dt: number): void {
    if (!pose) return;
    this.renderPosition.set(pose.p[0], pose.p[1], pose.p[2]);
    this.renderQuaternion.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3]);
    this.velocity.set(pose.v[0], pose.v[1], pose.v[2]);
    this.forward.copy(FORWARD).applyQuaternion(this.renderQuaternion);
    const state = this.state;
    state.forwardSpeed = this.velocity.dot(this.forward);
    state.steer = pose.steer;
    state.reverse = state.forwardSpeed < NET.REMOTE_REVERSE_SPEED_MS;
    const speedFraction = Math.min(1, Math.abs(state.forwardSpeed) / NET.REMOTE_RPM_FULL_SPEED_MS);
    state.rpm = lerp(DRIVETRAIN.IDLE_RPM, DRIVETRAIN.REDLINE_RPM, speedFraction);

    const maxSteer = lerp(
      STEERING.MAX_ANGLE_LOW_SPEED,
      STEERING.MAX_ANGLE_HIGH_SPEED,
      smoothstep(0, STEERING.FALLOFF_SPEED, Math.abs(state.forwardSpeed)),
    );
    const spin = (state.forwardSpeed / VEHICLE.WHEEL_RADIUS) * dt;
    this.wheels.forEach((wheel, i) => {
      wheel.spinAngle += spin;
      wheel.steerAngle = i < FRONT_WHEELS ? -state.steer * maxSteer : 0;
    });
  }
}
