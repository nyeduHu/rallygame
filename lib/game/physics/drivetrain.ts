// lib/game/physics/drivetrain.ts
import { UNITS } from "../constants";
import { clamp, moveTowards } from "../math";
import { getActiveTuning } from "../tuning";

/** Raw pedal keys as pressed by the driver. */
export interface PedalInput {
  throttleKey: boolean;
  brakeKey: boolean;
}

/** Drivetrain output for one physics step. */
export interface DrivetrainOutput {
  /** Total tractive force along the car's forward axis (negative in reverse). */
  driveForce: number;
  /** Service brake pedal 0..1. */
  brake: number;
}

const THROTTLE_IDLE_THRESHOLD = 0.05;
const ENGINE_BRAKE_MIN_SPEED = 1;

/**
 * Interpolates the engine torque curve.
 * @param rpm - Engine speed.
 * @returns Full-throttle torque in Nm.
 */
export function torqueAt(rpm: number): number {
  const curve = getActiveTuning().DRIVETRAIN.TORQUE_CURVE;
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [r1, t1] = curve[i];
    if (rpm <= r1) {
      const [r0, t0] = curve[i - 1];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return curve[curve.length - 1][1];
}

/**
 * Simple engine + automatic gearbox. Owns pedal smoothing and the forward/reverse
 * decision so "S brakes, then reverses" works like an arcade racer.
 */
export class Drivetrain {
  gear = 0;
  reverse = false;
  rpm: number = getActiveTuning().DRIVETRAIN.IDLE_RPM;
  throttle = 0;
  brake = 0;
  private shiftTimer = 0;

  /** Returns the drivetrain to first gear at idle. */
  reset(): void {
    const { DRIVETRAIN } = getActiveTuning();
    this.gear = 0;
    this.reverse = false;
    this.rpm = DRIVETRAIN.IDLE_RPM;
    this.throttle = 0;
    this.brake = 0;
    this.shiftTimer = 0;
  }

  /** @returns Gear label for the HUD. */
  get gearLabel(): string {
    return this.reverse ? "R" : String(this.gear + 1);
  }

  /** @returns Current overall ratio (gear x final drive). */
  private get overallRatio(): number {
    const { DRIVETRAIN } = getActiveTuning();
    const ratio = this.reverse ? DRIVETRAIN.REVERSE_RATIO : DRIVETRAIN.GEAR_RATIOS[this.gear];
    return ratio * DRIVETRAIN.FINAL_DRIVE;
  }

  /**
   * Advances the drivetrain by one fixed step.
   * @param input - Pedal keys.
   * @param forwardSpeed - Car speed along its forward axis (m/s).
   * @param dt - Step length.
   * @returns Tractive force and brake pedal.
   */
  update(input: PedalInput, forwardSpeed: number, dt: number): DrivetrainOutput {
    const { DRIVETRAIN, VEHICLE } = getActiveTuning();
    if (!this.reverse && input.brakeKey && !input.throttleKey && forwardSpeed < DRIVETRAIN.DIRECTION_SWITCH_SPEED) {
      this.reverse = true;
    } else if (
      this.reverse &&
      input.throttleKey &&
      !input.brakeKey &&
      forwardSpeed > -DRIVETRAIN.DIRECTION_SWITCH_SPEED
    ) {
      this.reverse = false;
      this.gear = 0;
    }

    const wantsThrottle = this.reverse ? input.brakeKey : input.throttleKey;
    const wantsBrake = this.reverse ? input.throttleKey : input.brakeKey;
    this.throttle = moveTowards(
      this.throttle,
      wantsThrottle ? 1 : 0,
      (wantsThrottle ? DRIVETRAIN.THROTTLE_RISE_RATE : DRIVETRAIN.THROTTLE_FALL_RATE) * dt,
    );
    this.brake = moveTowards(
      this.brake,
      wantsBrake ? 1 : 0,
      (wantsBrake ? DRIVETRAIN.BRAKE_RISE_RATE : DRIVETRAIN.BRAKE_FALL_RATE) * dt,
    );

    const wheelOmega = Math.abs(forwardSpeed) / VEHICLE.WHEEL_RADIUS;
    let rpm = wheelOmega * this.overallRatio * UNITS.RAD_PER_SEC_TO_RPM;
    // First gear and reverse slip the clutch so the car can launch from standstill.
    if (this.reverse || this.gear === 0) {
      rpm = Math.max(rpm, DRIVETRAIN.IDLE_RPM + this.throttle * (DRIVETRAIN.LAUNCH_RPM - DRIVETRAIN.IDLE_RPM));
    }
    this.rpm = clamp(rpm, DRIVETRAIN.IDLE_RPM, DRIVETRAIN.REDLINE_RPM);

    this.updateGear(dt);

    let engineTorque = 0;
    if (this.shiftTimer <= 0) {
      if (this.throttle > THROTTLE_IDLE_THRESHOLD) {
        engineTorque = rpm < DRIVETRAIN.REDLINE_RPM ? this.throttle * torqueAt(this.rpm) : 0;
      } else if (Math.abs(forwardSpeed) > ENGINE_BRAKE_MIN_SPEED) {
        engineTorque = -DRIVETRAIN.ENGINE_BRAKE_TORQUE * (this.rpm / DRIVETRAIN.REDLINE_RPM);
      }
    }

    const wheelForce = (engineTorque * this.overallRatio * DRIVETRAIN.EFFICIENCY) / VEHICLE.WHEEL_RADIUS;
    // Engine braking opposes motion; drive pushes in the selected direction.
    const direction = engineTorque >= 0 ? (this.reverse ? -1 : 1) : Math.sign(forwardSpeed);
    return { driveForce: Math.abs(wheelForce) * direction, brake: this.brake };
  }

  /**
   * Automatic shifting with a short torque cut, giving a readable rhythm to acceleration.
   * @param dt - Step length.
   */
  private updateGear(dt: number): void {
    const { DRIVETRAIN } = getActiveTuning();
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      return;
    }
    if (this.reverse) return;
    const topGear = DRIVETRAIN.GEAR_RATIOS.length - 1;
    if (this.rpm >= DRIVETRAIN.SHIFT_UP_RPM && this.gear < topGear && this.throttle > THROTTLE_IDLE_THRESHOLD) {
      this.gear++;
      this.shiftTimer = DRIVETRAIN.SHIFT_DURATION;
    } else if (this.rpm <= DRIVETRAIN.SHIFT_DOWN_RPM && this.gear > 0) {
      this.gear--;
      this.shiftTimer = DRIVETRAIN.SHIFT_DURATION;
    }
  }
}
