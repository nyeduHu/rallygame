// lib/game/session.ts
import { Quaternion, Vector3 } from "three";
import { SIMULATION, VEHICLE } from "./constants";
import { createPhysicsWorld, type PhysicsWorld } from "./physics/createWorld";
import type { Rapier } from "./physics/rapier";
import { Vehicle, type DriverControls } from "./physics/vehicle";
import { RaceTracker } from "./race/raceTracker";
import type { MeshData } from "./stage/meshData";
import { poseAt } from "./stage/roadIndex";
import type { StageData } from "./stage/types";

/** Controls used while the car is held at the start (handbrake on, no pedals). */
const HELD_CONTROLS: DriverControls = { throttle: false, brake: false, steer: 0, handbrake: true };

/**
 * Owns the simulation for one stage: physics world, car, race timing and the
 * fixed-timestep accumulator. React components only call advance() per frame and
 * read the interpolated render pose.
 */
export class GameSession {
  readonly physics: PhysicsWorld;
  readonly vehicle: Vehicle;
  readonly race: RaceTracker;
  /** Interpolated car pose for rendering this frame. */
  readonly renderPosition = new Vector3();
  readonly renderQuaternion = new Quaternion();
  private accumulator = 0;
  private resetCooldown = 0;
  /** Increments on every reset-to-road so the server accepts the pose jump. */
  resetCount = 0;

  /**
   * @param R - Initialised Rapier module.
   * @param stage - Generated stage.
   * @param roadMesh - Road ribbon mesh data.
   * @param terrainMesh - Terrain mesh data.
   */
  constructor(
    R: Rapier,
    readonly stage: StageData,
    roadMesh: MeshData,
    terrainMesh: MeshData,
  ) {
    this.physics = createPhysicsWorld(R, stage, roadMesh, terrainMesh);
    this.vehicle = new Vehicle(R, this.physics.world, this.physics.surfaces, stage.spawn);
    this.race = new RaceTracker(stage);
    this.vehicle.interpolate(1, this.renderPosition, this.renderQuaternion);
  }

  /**
   * Runs as many fixed steps as the frame time demands, then interpolates the car pose.
   * @param frameDelta - Real time since the last frame.
   * @param controls - Current driver controls.
   */
  advance(frameDelta: number, controls: DriverControls): void {
    const dt = SIMULATION.FIXED_TIMESTEP;
    this.accumulator = Math.min(this.accumulator + frameDelta, dt * SIMULATION.MAX_STEPS_PER_FRAME);
    this.resetCooldown = Math.max(0, this.resetCooldown - frameDelta);
    while (this.accumulator >= dt) {
      const active = this.race.controlsEnabled ? controls : HELD_CONTROLS;
      this.vehicle.step(active, dt);
      this.physics.world.step();
      this.vehicle.capturePose();
      const position = this.vehicle.currentPosition;
      this.race.update(dt, position.x, position.z);
      this.accumulator -= dt;
    }
    this.vehicle.interpolate(this.accumulator / dt, this.renderPosition, this.renderQuaternion);
  }

  /** Starts the countdown from the ready state. */
  beginCountdown(): void {
    this.race.beginCountdown();
  }

  /**
   * Puts the car back on the road at its last tracked position, facing the route.
   * Rate-limited so holding R does not lock the car in place.
   */
  resetToRoad(): void {
    if (this.resetCooldown > 0 || !this.race.controlsEnabled) return;
    const s = this.race.resetS;
    this.vehicle.reset(poseAt(this.stage.samples, s), VEHICLE.RESET_LIFT);
    this.race.teleportTo(s);
    this.resetCooldown = VEHICLE.RESET_COOLDOWN;
    this.resetCount += 1;
  }

  /** Restarts the stage: car to spawn, cones restored, timer reset. */
  restart(): void {
    this.vehicle.reset(this.stage.spawn, VEHICLE.SPAWN_LIFT);
    this.race.reset();
    this.accumulator = 0;
    this.resetCooldown = 0;
    this.physics.coneBodies.forEach((body, i) => {
      const cone = this.stage.cones[i];
      const half = cone.yaw / 2;
      body.setTranslation({ x: cone.x, y: cone.y, z: cone.z }, true);
      body.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
    this.vehicle.interpolate(1, this.renderPosition, this.renderQuaternion);
  }

  /** Frees WASM memory held by the physics world. */
  dispose(): void {
    this.physics.world.free();
  }
}
