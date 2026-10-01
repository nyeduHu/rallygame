// lib/game/physics/vehicle.ts
import type { Collider, Ray, RigidBody, World } from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import { SIMULATION, SURFACES } from "../constants";
import { clamp, lerp, moveTowards, smoothstep } from "../math";
import type { RoadPose, SurfaceKind } from "../stage/types";
import { getActiveTuning } from "../tuning";
import { GROUPS } from "./collisionGroups";
import { Drivetrain } from "./drivetrain";
import type { Rapier } from "./rapier";

/** Driver controls sampled once per physics step. */
export interface DriverControls {
  throttle: boolean;
  brake: boolean;
  /** -1 = full left, 1 = full right. */
  steer: number;
  handbrake: boolean;
  /** Engine output multiplier (0..1) from the mechanical model; defaults to 1. */
  powerFactor?: number;
}

/** Per-wheel simulation state, also read by visuals (suspension travel, spin). */
export interface WheelState {
  readonly isFront: boolean;
  readonly isLeft: boolean;
  readonly mount: Vector3;
  inContact: boolean;
  compression: number;
  suspensionLength: number;
  surface: SurfaceKind | null;
  spinAngle: number;
  spinRate: number;
  steerAngle: number;
  load: number;
}

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
const LEFT = new Vector3(1, 0, 0);
const WHEEL_COUNT_PER_AXLE = 2;
const AXLE_COUNT = 2;
const WHEEL_COUNT = WHEEL_COUNT_PER_AXLE * AXLE_COUNT;
/** Visual wheel spin decays in the air instead of stopping instantly. */
const AIRBORNE_SPIN_DECAY = 0.99;

/**
 * Static compression of each spring under the car's own weight.
 * @returns Compression in metres.
 */
export function staticCompression(): number {
  const { VEHICLE } = getActiveTuning();
  return (VEHICLE.MASS * -SIMULATION.GRAVITY) / WHEEL_COUNT / VEHICLE.SPRING_STIFFNESS;
}

/**
 * Height of the chassis origin above flat ground when settled.
 * @returns Ride height in metres.
 */
export function restingRideHeight(): number {
  const { VEHICLE } = getActiveTuning();
  return -VEHICLE.WHEEL_MOUNT_Y + (VEHICLE.SUSPENSION_REST_LENGTH - staticCompression()) + VEHICLE.WHEEL_RADIUS;
}

/**
 * Semi-realistic raycast vehicle: per-wheel spring/damper suspension with anti-roll
 * bars, magic-formula lateral grip, a friction ellipse that lets wheelspin and the
 * handbrake break traction, surface-dependent grip, and an automatic AWD drivetrain.
 * Weight transfer is emergent from the springs carrying the load.
 */
export class Vehicle {
  readonly body: RigidBody;
  readonly chassis: Collider;
  readonly drivetrain = new Drivetrain();
  readonly wheels: WheelState[];
  /** Smoothed steering input -1..1. */
  steer = 0;
  handbrake = false;
  forwardSpeed = 0;

  /** Pose before and after the most recent step, for render interpolation. */
  readonly previousPosition = new Vector3();
  readonly previousQuaternion = new Quaternion();
  readonly currentPosition = new Vector3();
  readonly currentQuaternion = new Quaternion();

  private readonly rays: Ray[];
  private readonly scratch = {
    position: new Vector3(),
    quaternion: new Quaternion(),
    up: new Vector3(),
    forward: new Vector3(),
    left: new Vector3(),
    mountWorld: new Vector3(),
    down: new Vector3(),
    contact: new Vector3(),
    normal: new Vector3(),
    wheelForward: new Vector3(),
    wheelSide: new Vector3(),
    velocity: new Vector3(),
    impulse: new Vector3(),
    applyPoint: new Vector3(),
    com: new Vector3(),
  };
  private readonly hitDistance: number[] = new Array<number>(WHEEL_COUNT).fill(0);
  private readonly lastNormals: Vector3[] = Array.from({ length: WHEEL_COUNT }, () => new Vector3(0, 1, 0));
  private readonly previousCompression: number[] = new Array<number>(WHEEL_COUNT).fill(0);

  /**
   * @param R - Rapier module.
   * @param world - Physics world.
   * @param surfaces - Collider handle to surface map.
   * @param spawn - Initial road pose.
   */
  constructor(
    private readonly R: Rapier,
    private readonly world: World,
    private readonly surfaces: Map<number, SurfaceKind>,
    spawn: RoadPose,
  ) {
    const { VEHICLE } = getActiveTuning();
    const { x: hx, y: hy, z: hz } = VEHICLE.CHASSIS_HALF_EXTENTS;
    const mass = VEHICLE.MASS;
    const inertiaFactor = (mass / 12) * VEHICLE.INERTIA_SCALE;
    const width = hx * 2;
    const height = hy * 2;
    const length = hz * 2;

    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setAngularDamping(VEHICLE.ANGULAR_DAMPING).setCcdEnabled(true).setCanSleep(false),
    );
    this.chassis = world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(0, VEHICLE.CHASSIS_COLLIDER_OFFSET_Y, 0)
        .setMassProperties(
          mass,
          VEHICLE.CENTER_OF_MASS,
          {
            x: inertiaFactor * (height * height + length * length),
            y: inertiaFactor * (width * width + length * length),
            z: inertiaFactor * (width * width + height * height),
          },
          { x: 0, y: 0, z: 0, w: 1 },
        )
        .setFriction(VEHICLE.CHASSIS_FRICTION)
        .setRestitution(VEHICLE.CHASSIS_RESTITUTION)
        .setCollisionGroups(GROUPS.chassis),
      this.body,
    );

    const mounts: Array<[boolean, boolean]> = [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ];
    this.wheels = mounts.map(([isFront, isLeft]) => ({
      isFront,
      isLeft,
      mount: new Vector3(
        isLeft ? VEHICLE.WHEEL_HALF_TRACK : -VEHICLE.WHEEL_HALF_TRACK,
        VEHICLE.WHEEL_MOUNT_Y,
        isFront ? VEHICLE.WHEEL_FRONT_Z : VEHICLE.WHEEL_REAR_Z,
      ),
      inContact: false,
      compression: 0,
      suspensionLength: VEHICLE.SUSPENSION_REST_LENGTH,
      surface: null,
      spinAngle: 0,
      spinRate: 0,
      steerAngle: 0,
      load: 0,
    }));
    this.rays = this.wheels.map(() => new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }));
    this.reset(spawn, VEHICLE.SPAWN_LIFT);
  }

  /**
   * Places the car on the road, upright and at rest.
   * @param pose - Road pose.
   * @param lift - Extra height so the car drops onto its wheels.
   */
  reset(pose: RoadPose, lift: number): void {
    const half = pose.heading / 2;
    this.body.setTranslation({ x: pose.x, y: pose.y + restingRideHeight() + lift, z: pose.z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.drivetrain.reset();
    this.steer = 0;
    this.forwardSpeed = 0;
    this.previousCompression.fill(0);
    for (const wheel of this.wheels) {
      wheel.spinRate = 0;
      wheel.compression = 0;
      wheel.inContact = false;
    }
    this.capturePose();
    this.previousPosition.copy(this.currentPosition);
    this.previousQuaternion.copy(this.currentQuaternion);
  }

  /**
   * Applies suspension, tyre and drag forces for one fixed step. Call before world.step().
   * @param controls - Driver controls (pass neutral controls to hold the car).
   * @param dt - Fixed step length.
   */
  step(controls: DriverControls, dt: number): void {
    const { VEHICLE, STEERING } = getActiveTuning();
    const s = this.scratch;
    const t = this.body.translation();
    const r = this.body.rotation();
    s.position.set(t.x, t.y, t.z);
    s.quaternion.set(r.x, r.y, r.z, r.w);
    s.up.copy(UP).applyQuaternion(s.quaternion);
    s.forward.copy(FORWARD).applyQuaternion(s.quaternion);
    s.left.copy(LEFT).applyQuaternion(s.quaternion);
    s.down.copy(s.up).negate();
    const com = this.body.worldCom();
    s.com.set(com.x, com.y, com.z);

    const linvel = this.body.linvel();
    s.velocity.set(linvel.x, linvel.y, linvel.z);
    this.forwardSpeed = s.velocity.dot(s.forward);
    const speed = s.velocity.length();

    this.updateSteering(controls.steer, dt);
    this.handbrake = controls.handbrake;
    const maxSteer = lerp(
      STEERING.MAX_ANGLE_LOW_SPEED,
      STEERING.MAX_ANGLE_HIGH_SPEED,
      smoothstep(0, STEERING.FALLOFF_SPEED, Math.abs(this.forwardSpeed)),
    );
    // Positive steer is right; a right turn is a negative yaw about +Y.
    const steerAngle = -this.steer * maxSteer;

    const output = this.drivetrain.update(
      { throttleKey: controls.throttle, brakeKey: controls.brake, powerFactor: controls.powerFactor },
      this.forwardSpeed,
      dt,
    );

    this.castWheels();
    const springForces = this.computeSpringForces(dt);

    for (let i = 0; i < WHEEL_COUNT; i++) {
      const wheel = this.wheels[i];
      wheel.steerAngle = wheel.isFront ? steerAngle : 0;
      if (!wheel.inContact) {
        wheel.load = 0;
        wheel.spinRate *= AIRBORNE_SPIN_DECAY;
        wheel.spinAngle += wheel.spinRate * dt;
        continue;
      }
      this.applyWheelForces(i, springForces[i], output.driveForce, output.brake, dt);
    }

    // Quadratic aero drag at the centre of mass.
    s.impulse.copy(s.velocity).multiplyScalar(-VEHICLE.AERO_DRAG * speed * dt);
    this.body.applyImpulse(s.impulse, true);
  }

  /**
   * Smooths digital steering; returning to centre is faster than turning in,
   * which keeps keyboard steering from feeling sticky.
   * @param target - Target steer -1..1.
   * @param dt - Step length.
   */
  private updateSteering(target: number, dt: number): void {
    const { STEERING } = getActiveTuning();
    const returning = Math.abs(target) < Math.abs(this.steer) || Math.sign(target) !== Math.sign(this.steer);
    const rate = returning ? STEERING.RETURN_RATE : STEERING.INPUT_RATE;
    this.steer = moveTowards(this.steer, target, rate * dt);
  }

  /** Casts each suspension ray and records hit distance/collider. */
  private castWheels(): void {
    const { VEHICLE } = getActiveTuning();
    const s = this.scratch;
    const maxDistance = VEHICLE.SUSPENSION_REST_LENGTH + VEHICLE.WHEEL_RADIUS;
    for (let i = 0; i < WHEEL_COUNT; i++) {
      const wheel = this.wheels[i];
      s.mountWorld.copy(wheel.mount).applyQuaternion(s.quaternion).add(s.position);
      const ray = this.rays[i];
      ray.origin = { x: s.mountWorld.x, y: s.mountWorld.y, z: s.mountWorld.z };
      ray.dir = { x: s.down.x, y: s.down.y, z: s.down.z };
      const hit = this.world.castRayAndGetNormal(
        ray,
        maxDistance,
        true,
        this.R.QueryFilterFlags.EXCLUDE_SENSORS,
        GROUPS.wheelQuery,
        undefined,
        this.body,
      );
      if (hit) {
        const length = Math.max(0, hit.timeOfImpact - VEHICLE.WHEEL_RADIUS);
        wheel.inContact = true;
        wheel.suspensionLength = length;
        wheel.compression = VEHICLE.SUSPENSION_REST_LENGTH - length;
        wheel.surface = this.surfaces.get(hit.collider.handle) ?? null;
        this.hitDistance[i] = hit.timeOfImpact;
        this.lastNormals[i].set(hit.normal.x, hit.normal.y, hit.normal.z);
      } else {
        wheel.inContact = false;
        wheel.suspensionLength = VEHICLE.SUSPENSION_REST_LENGTH;
        wheel.compression = 0;
        wheel.surface = null;
      }
    }
  }

  /**
   * Spring + damper + bump stop per wheel, then anti-roll bars per axle.
   * @param dt - Step length.
   * @returns Spring force per wheel (>= 0).
   */
  private computeSpringForces(dt: number): number[] {
    const { VEHICLE } = getActiveTuning();
    const forces = this.wheels.map((wheel, i) => {
      const compressionVelocity = (wheel.compression - this.previousCompression[i]) / dt;
      this.previousCompression[i] = wheel.compression;
      if (!wheel.inContact) return 0;
      const damping = compressionVelocity > 0 ? VEHICLE.DAMPING_BUMP : VEHICLE.DAMPING_REBOUND;
      let force = VEHICLE.SPRING_STIFFNESS * wheel.compression + damping * compressionVelocity;
      if (wheel.suspensionLength < VEHICLE.BUMP_STOP_LENGTH) {
        force += VEHICLE.BUMP_STOP_STIFFNESS * (VEHICLE.BUMP_STOP_LENGTH - wheel.suspensionLength);
      }
      return force;
    });

    const axles: Array<[number, number, number]> = [
      [0, 1, VEHICLE.ANTI_ROLL_FRONT],
      [2, 3, VEHICLE.ANTI_ROLL_REAR],
    ];
    for (const [left, right, stiffness] of axles) {
      const delta = (this.wheels[left].compression - this.wheels[right].compression) * stiffness;
      if (this.wheels[left].inContact) forces[left] += delta;
      if (this.wheels[right].inContact) forces[right] -= delta;
    }
    return forces.map((force) => Math.max(0, force));
  }

  /**
   * Tyre model for one grounded wheel, applied as impulses at the contact patch.
   * @param i - Wheel index.
   * @param springForce - Suspension force (tyre normal load).
   * @param driveForce - Total drivetrain force for the car.
   * @param brakePedal - Brake pedal 0..1.
   * @param dt - Step length.
   */
  private applyWheelForces(i: number, springForce: number, driveForce: number, brakePedal: number, dt: number): void {
    const { VEHICLE, TIRE, DRIVETRAIN } = getActiveTuning();
    const s = this.scratch;
    const wheel = this.wheels[i];
    const normal = this.lastNormals[i];

    s.mountWorld.copy(wheel.mount).applyQuaternion(s.quaternion).add(s.position);
    s.contact.copy(s.down).multiplyScalar(this.hitDistance[i]).add(s.mountWorld);

    // Suspension pushes along the ground normal.
    s.impulse.copy(normal).multiplyScalar(springForce * dt);
    this.body.applyImpulseAtPoint(s.impulse, s.contact, true);
    wheel.load = springForce;

    // Wheel frame projected onto the contact plane.
    const cosSteer = Math.cos(wheel.steerAngle);
    const sinSteer = Math.sin(wheel.steerAngle);
    s.wheelForward.copy(s.forward).multiplyScalar(cosSteer).addScaledVector(s.left, sinSteer);
    s.wheelForward.addScaledVector(normal, -s.wheelForward.dot(normal)).normalize();
    s.wheelSide.crossVectors(normal, s.wheelForward);

    const pointVelocity = this.body.velocityAtPoint(s.contact);
    s.velocity.set(pointVelocity.x, pointVelocity.y, pointVelocity.z);
    const vLong = s.velocity.dot(s.wheelForward);
    const vLat = s.velocity.dot(s.wheelSide);

    const surface = SURFACES[wheel.surface ?? "grass"];
    const axleGrip = wheel.isFront ? TIRE.FRONT_GRIP : TIRE.REAR_GRIP;
    const maxForce = surface.grip * axleGrip * springForce;
    const handbrakeOnWheel = this.handbrake && !wheel.isFront;
    const lateralScale = handbrakeOnWheel ? TIRE.HANDBRAKE_REAR_LATERAL_GRIP : 1;

    const slipAngle = Math.atan2(vLat, Math.max(Math.abs(vLong), TIRE.LOW_SPEED_SLIP_REFERENCE));
    const lateralNorm = Math.sin(TIRE.LATERAL_C * Math.atan(TIRE.LATERAL_B * slipAngle));
    let lateral = -lateralNorm * maxForce * lateralScale;

    const split = wheel.isFront ? 1 - DRIVETRAIN.REAR_TORQUE_SPLIT : DRIVETRAIN.REAR_TORQUE_SPLIT;
    let longitudinal = (driveForce * split) / WHEEL_COUNT_PER_AXLE;
    const brakeBias = wheel.isFront ? TIRE.BRAKE_FRONT_BIAS : 1 - TIRE.BRAKE_FRONT_BIAS;
    let brakeForce = (brakePedal * TIRE.BRAKE_FORCE_MAX * brakeBias) / WHEEL_COUNT_PER_AXLE;
    if (handbrakeOnWheel) brakeForce += TIRE.HANDBRAKE_FORCE / WHEEL_COUNT_PER_AXLE;
    brakeForce += surface.rollingResistance * springForce;
    // Never let resistive forces reverse the wheel within one step (prevents jitter at rest).
    const stopForce = (Math.abs(vLong) * (VEHICLE.MASS / WHEEL_COUNT)) / dt;
    longitudinal -= Math.sign(vLong) * Math.min(brakeForce, stopForce);

    const demand = Math.abs(longitudinal);
    longitudinal = clamp(longitudinal, -maxForce, maxForce);
    const longRatio = maxForce > 0 ? longitudinal / maxForce : 0;
    const lateralCap =
      maxForce * Math.sqrt(Math.max(0, 1 - TIRE.FRICTION_ELLIPSE_LONG_WEIGHT * longRatio * longRatio)) * lateralScale;
    lateral = clamp(lateral, -lateralCap, lateralCap);

    // Apply tyre forces partway up toward the centre of mass to tame body roll.
    const heightToCom = s.applyPoint.copy(s.com).sub(s.contact).dot(s.up);
    s.applyPoint.copy(s.contact).addScaledVector(s.up, heightToCom * VEHICLE.TIRE_FORCE_ROLL_FACTOR);
    s.impulse
      .copy(s.wheelForward)
      .multiplyScalar(longitudinal * dt)
      .addScaledVector(s.wheelSide, lateral * dt);
    this.body.applyImpulseAtPoint(s.impulse, s.applyPoint, true);

    const isDriven = split > 0;
    const spinning = isDriven && demand > maxForce && Math.abs(driveForce) > 0;
    wheel.spinRate = handbrakeOnWheel
      ? 0
      : vLong / VEHICLE.WHEEL_RADIUS + (spinning ? Math.sign(driveForce) * TIRE.WHEELSPIN_VISUAL_GAIN : 0);
    wheel.spinAngle += wheel.spinRate * dt;
  }

  /** Records the post-step pose; call after world.step(). */
  capturePose(): void {
    this.previousPosition.copy(this.currentPosition);
    this.previousQuaternion.copy(this.currentQuaternion);
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currentPosition.set(t.x, t.y, t.z);
    this.currentQuaternion.set(r.x, r.y, r.z, r.w);
  }

  /**
   * Interpolated render pose between the last two physics steps.
   * @param alpha - Fraction of a step elapsed since the last step.
   * @param position - Output position.
   * @param quaternion - Output rotation.
   */
  interpolate(alpha: number, position: Vector3, quaternion: Quaternion): void {
    position.lerpVectors(this.previousPosition, this.currentPosition, alpha);
    quaternion.slerpQuaternions(this.previousQuaternion, this.currentQuaternion, alpha);
  }

  /** @returns Chassis linear velocity in world space (m/s), for network pose reports. */
  get currentVelocity(): { x: number; y: number; z: number } {
    return this.body.linvel();
  }

  /** @returns Majority surface under grounded wheels, or null when airborne. */
  get surface(): SurfaceKind | null {
    let gravel = 0;
    let grass = 0;
    for (const wheel of this.wheels) {
      if (wheel.surface === "gravel") gravel++;
      else if (wheel.surface === "grass") grass++;
    }
    if (gravel === 0 && grass === 0) return null;
    return gravel >= grass ? "gravel" : "grass";
  }

  /** Removes the car from the world. */
  dispose(): void {
    this.world.removeRigidBody(this.body);
  }
}
