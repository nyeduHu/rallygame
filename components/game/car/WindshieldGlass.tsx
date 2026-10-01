// components/game/car/WindshieldGlass.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { DoubleSide, ShaderMaterial } from "three";
import { COCKPIT } from "@/lib/game/cockpitLayout";
import { useGameStore } from "@/lib/game/store";
import { windshieldRuntime } from "@/lib/game/weather/runtime";
import { visibility } from "@/lib/game/weather/weather";
import { beamTransform } from "./Beam";

const DROPLET_CELLS = 38;
const DARKEN_AT_ZERO_VISIBILITY = 0.75;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform float uDirt;
uniform float uDarken;
uniform float uCells;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 grid = vUv * uCells;
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;
  float r = hash(cell);
  // Each cell holds one droplet whose size grows with dirt; bigger droplets appear later.
  float radius = 0.5 * smoothstep(r * 0.8, r * 0.8 + 0.4, uDirt);
  float drop = 1.0 - smoothstep(radius * 0.6, radius, length(local));
  float haze = uDirt * 0.5;
  float alpha = clamp(drop * 0.55 + haze + uDarken, 0.0, 0.97);
  gl_FragColor = vec4(mix(vec3(0.62, 0.7, 0.78), vec3(0.05, 0.06, 0.08), uDarken), alpha);
}`;

/**
 * Droplet/haze overlay just inside the windshield, driven by the shared dirt value; the
 * background darkens as visibility drops (never fully black).
 * @returns Overlay plane in car-local space.
 */
export function WindshieldGlass() {
  const { BASE, TOP, WIDTH } = COCKPIT.WINDSHIELD;
  const { position, quaternion, length } = useMemo(() => beamTransform(BASE, TOP), [BASE, TOP]);
  const materialRef = useRef<ShaderMaterial>(null);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { uDirt: { value: 0 }, uDarken: { value: 0 }, uCells: { value: DROPLET_CELLS } },
      }),
    [],
  );

  useFrame(() => {
    const m = materialRef.current;
    if (!m) return;
    const dirt = windshieldRuntime.dirt;
    m.uniforms.uDirt.value = dirt;
    const seen = visibility({ dirt });
    m.uniforms.uDarken.value = (1 - seen) * DARKEN_AT_ZERO_VISIBILITY;
    // Hidden entirely in clear weather with a clean pane so there is zero cost.
    m.visible = dirt > 0 || useGameStore.getState().weather.kind === "rain";
  });

  return (
    <mesh position={position} quaternion={quaternion} renderOrder={2}>
      <planeGeometry args={[WIDTH, length]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
}
