// components/game/car/Tablet.tsx
"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, Group, SRGBColorSpace, Vector3, type MeshBasicMaterial } from "three";
import { MAZE_MAP, TABLET } from "@/lib/game/constants";
import {
  createView,
  cornerSeverity,
  makeHint,
  makeProjection,
  networkBounds,
  routeSlice,
  stepView,
  toggleMode,
  type MapBounds,
  type MapHint,
  type MapKeys,
  type MapView,
  type MapViewport,
} from "@/lib/game/map/mazeMap";
import { PALETTE } from "@/lib/game/palette";
import type { Role } from "@/lib/game/roles";
import type { SessionView } from "@/lib/game/sessionView";
import { NetworkIndex } from "@/lib/game/stage/networkIndex";
import { poseAt } from "@/lib/game/stage/roadIndex";
import type { CornerInfo } from "@/lib/game/stage/types";
import { useGameStore } from "@/lib/game/store";

interface TabletProps {
  session: SessionView;
  activeRole: Role;
}

/** Everything the tablet needs about the maze, built once per stage. */
interface TabletData {
  network: NetworkIndex;
  bounds: MapBounds;
}

/** Mutable tablet state: read and written by key handlers and the frame loop, never by render. */
interface TabletState {
  view: MapView;
  hint: MapHint | null;
  hintsLeft: number;
  keys: MapKeys;
  focused: boolean;
  clock: number;
}

const SCREEN_SIZE = TABLET.SCREEN_SIZE;
const FONT_FAMILY = "Arial, sans-serif";
const WORLD_FORWARD = new Vector3(0, 0, 1);
const FOCUS_COS = Math.cos(MAZE_MAP.FOCUS_HALF_ANGLE_RAD);
const NO_KEYS: MapKeys = { zoomIn: false, zoomOut: false, left: false, right: false, up: false, down: false };
const MAP_KEY_FIELDS: Readonly<Record<string, keyof MapKeys>> = {
  KeyE: "zoomIn",
  KeyQ: "zoomOut",
  KeyA: "left",
  KeyD: "right",
  KeyW: "up",
  KeyS: "down",
};

/**
 * The co-driver's navigation tablet. It rests in their lap, shows the whole maze, and answers to
 * Q/E (zoom), WASD (pan), M (full map / centred on the car) and H (three hints per race) while
 * the co-driver is looking at it.
 * @param props - Active session and the role being viewed.
 * @returns Bezel and textured screen in the parent's space.
 */
export function Tablet({ session, activeRole }: TabletProps) {
  const camera = useThree((state) => state.camera);
  const groupRef = useRef<Group>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<CanvasTexture | null>(null);
  const screenMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const elapsedRef = useRef(0);
  const contentKeyRef = useRef<string | null>(null);
  const stateRef = useRef<TabletState | null>(null);
  const [data] = useState<TabletData>(() => ({ network: new NetworkIndex(session.stage.samples, session.stage.branches), bounds: networkBounds(session.stage) }));
  const position = useMemo(() => new Vector3(), []);
  const toTablet = useMemo(() => new Vector3(), []);
  const forward = useMemo(() => new Vector3(), []);

  /**
   * Lazily creates the mutable state (kept out of render so refs stay pure).
   * @returns The tablet state.
   */
  const state = (): TabletState => {
    stateRef.current ??= { view: createView(), hint: null, hintsLeft: MAZE_MAP.HINTS_PER_RACE, keys: { ...NO_KEYS }, focused: false, clock: 0 };
    return stateRef.current;
  };

  useLayoutEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TABLET.CANVAS_SIZE.width;
    canvas.height = TABLET.CANVAS_SIZE.height;
    canvasRef.current = canvas;
    const nextTexture = new CanvasTexture(canvas);
    nextTexture.colorSpace = SRGBColorSpace;
    textureRef.current = nextTexture;
    drawTablet(canvas, session, data, state());
    nextTexture.needsUpdate = true;
    const screenMaterial = screenMaterialRef.current;
    if (screenMaterial) {
      screenMaterial.map = nextTexture;
      screenMaterial.needsUpdate = true;
    }
    return () => {
      if (screenMaterial?.map === nextTexture) {
        screenMaterial.map = null;
        screenMaterial.needsUpdate = true;
      }
      nextTexture.dispose();
      textureRef.current = null;
      canvasRef.current = null;
    };
  }, [data, session]);

  useEffect(() => {
    /**
     * @returns True when the map keys apply: co-driver, seated, looking at the tablet.
     */
    const active = (): boolean => activeRole === "codriver" && useGameStore.getState().footRole === null && state().focused;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!active()) return;
      const field = MAP_KEY_FIELDS[event.code];
      const tablet = state();
      if (field) {
        tablet.keys[field] = true;
        return;
      }
      if (event.repeat) return;
      if (event.code === "KeyM") tablet.view = toggleMode(tablet.view);
      if (event.code === "KeyH" && tablet.hintsLeft > 0) {
        const position = session.renderPosition;
        const progress = data.network.nearest(position.x, position.z, TABLET.PROJECTION_SEARCH_RADIUS)?.s ?? session.stage.startS;
        const hint = makeHint(session.stage.corners, progress, tablet.clock);
        if (hint) {
          tablet.hint = hint;
          tablet.hintsLeft -= 1;
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      const field = MAP_KEY_FIELDS[event.code];
      if (field) state().keys[field] = false;
    };
    const onBlur = (): void => {
      state().keys = { ...NO_KEYS };
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [activeRole, data, session]);

  useFrame((_, delta) => {
    const tablet = state();
    tablet.clock += delta;
    if (tablet.hint && tablet.clock > tablet.hint.expiresAt) tablet.hint = null;
    const group = groupRef.current;
    if (group) {
      group.getWorldPosition(position);
      toTablet.copy(position).sub(camera.position).normalize();
      camera.getWorldDirection(forward);
      tablet.focused = activeRole === "codriver" && forward.dot(toTablet) > FOCUS_COS;
    }
    const viewport = mapViewport();
    const car = session.renderPosition;
    const { scale } = makeProjection(tablet.view, car, data.bounds, viewport);
    tablet.view = stepView(tablet.view, tablet.keys, delta, scale);

    const activeTexture = textureRef.current;
    if (!activeTexture || !canvasRef.current) return;
    elapsedRef.current += delta;
    if (elapsedRef.current < 1 / TABLET.REDRAW_HZ) return;
    elapsedRef.current %= 1 / TABLET.REDRAW_HZ;
    const nextContentKey = getContentKey(session, data, tablet);
    if (nextContentKey === contentKeyRef.current) return;
    contentKeyRef.current = nextContentKey;
    drawTablet(canvasRef.current, session, data, tablet);
    activeTexture.needsUpdate = true;
  });

  return (
    <group ref={groupRef} name="co-driver-navigation-tablet">
      <RoundedBox args={[...TABLET.BODY_SIZE]} radius={TABLET.BODY_CORNER_RADIUS} smoothness={3} position={[...TABLET.BODY_POSITION]} castShadow>
        <meshStandardMaterial color={PALETTE.interior} flatShading roughness={TABLET.BODY_ROUGHNESS} />
      </RoundedBox>
      <mesh position={[...TABLET.SCREEN_OFFSET]} rotation={[0, TABLET.SCREEN_FACING_YAW, 0]}>
        <planeGeometry args={[SCREEN_SIZE[0], SCREEN_SIZE[1]]} />
        <meshBasicMaterial ref={screenMaterialRef} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * Pixel size of the map area (between the header and the key legend).
 * @returns Map viewport dimensions.
 */
function mapViewport(): MapViewport {
  return { width: TABLET.CANVAS_SIZE.width, height: TABLET.CANVAS_SIZE.height - TABLET.HEADER_HEIGHT - TABLET.LEGEND_HEIGHT };
}

/**
 * Heading of the car in the world.
 * @param session - Session with the interpolated car pose.
 * @returns Heading in radians (tangent is (sin h, cos h)).
 */
function carHeading(session: SessionView): number {
  const vector = WORLD_FORWARD.clone().applyQuaternion(session.renderQuaternion);
  return Math.atan2(vector.x, vector.z);
}

/**
 * Compact state key so an unchanged screen costs no canvas work or GPU upload.
 * @param session - Current session.
 * @param data - Tablet data.
 * @param tablet - Mutable tablet state.
 * @returns Quantised key of everything visible.
 */
function getContentKey(session: SessionView, data: TabletData, tablet: TabletState): string {
  const car = session.renderPosition;
  const { project, scale } = makeProjection(tablet.view, car, data.bounds, mapViewport());
  const marker = project(car.x, car.z);
  return [
    tablet.view.mode,
    Math.round(scale * 1000),
    Math.round(marker.x),
    Math.round(marker.y),
    Math.round(carHeading(session) * TABLET.DEGREES_PER_RADIAN),
    tablet.hint ? Math.round(tablet.hint.expiresAt) : "none",
    tablet.hintsLeft,
    tablet.focused ? 1 : 0,
  ].join("|");
}

/**
 * Redraws the whole screen: every road, the hint, the car, and the key legend.
 * @param canvas - Persistent screen canvas.
 * @param session - Current session.
 * @param data - Tablet data.
 * @param tablet - Mutable tablet state.
 */
function drawTablet(canvas: HTMLCanvasElement, session: SessionView, data: TabletData, tablet: TabletState): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { stage } = session;
  const viewport = mapViewport();
  const car = session.renderPosition;
  const { project, scale } = makeProjection(tablet.view, car, data.bounds, viewport);
  const toCanvas = (x: number, z: number): { x: number; y: number } => {
    const point = project(x, z);
    return { x: point.x, y: point.y + TABLET.HEADER_HEIGHT };
  };

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = PALETTE.dashboard;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.beginPath();
  context.rect(0, TABLET.HEADER_HEIGHT, viewport.width, viewport.height);
  context.clip();

  context.lineCap = "round";
  context.lineJoin = "round";
  for (const road of [stage.samples, ...stage.branches.map((branch) => branch.samples)]) {
    strokePath(context, road.map((sample) => toCanvas(sample.x, sample.z)), PALETTE.gravel, MAZE_MAP.ROAD_PIXELS);
  }
  if (tablet.hint) {
    const slice = routeSlice(stage.samples, tablet.hint.fromS, tablet.hint.toS);
    strokePath(context, slice.map((sample) => toCanvas(sample.x, sample.z)), PALETTE.steeringHub, MAZE_MAP.HINT_ROAD_PIXELS);
    strokePath(context, slice.map((sample) => toCanvas(sample.x, sample.z)), PALETTE.gravel, MAZE_MAP.ROAD_PIXELS);
  }
  const hinted = new Set<CornerInfo>(tablet.hint?.corners ?? []);
  for (const road of [{ samples: stage.samples, corners: stage.corners }, ...stage.branches]) {
    for (const corner of road.corners) {
      const apex = poseAt(road.samples, corner.apexS);
      drawCornerMarker(context, toCanvas(apex.x, apex.z), corner, hinted.has(corner));
    }
  }
  const start = stage.samples.find((sample) => sample.s >= stage.startS) ?? stage.samples[0];
  const finish = stage.samples.find((sample) => sample.s >= stage.finishS) ?? stage.samples[stage.samples.length - 1];
  drawFlag(context, toCanvas(start.x, start.z), "S", PALETTE.grass);
  drawFlag(context, toCanvas(finish.x, finish.z), "F", PALETTE.gaugeFace);
  drawCar(context, toCanvas(car.x, car.z), carHeading(session));
  context.restore();

  drawHeader(context, tablet, scale);
  drawLegend(context, canvas.width, canvas.height, tablet);
}

/**
 * Strokes a polyline.
 * @param context - Canvas context.
 * @param points - Projected points.
 * @param color - Stroke colour.
 * @param width - Stroke width in pixels.
 */
function strokePath(context: CanvasRenderingContext2D, points: ReadonlyArray<{ x: number; y: number }>, color: string, width: number): void {
  if (points.length < 2) return;
  context.beginPath();
  points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}

/** Marker colour by corner severity. */
const SEVERITY_COLORS = { 1: PALETTE.severity1, 2: PALETTE.severity2, 3: PALETTE.severity3, 4: PALETTE.severity4 } as const;

/**
 * Draws a corner marker whose number says how wild the corner is (1 fast, 4 tight); a ring shows
 * the corners a hint points out.
 * @param context - Canvas context.
 * @param point - Projected apex.
 * @param corner - The corner.
 * @param hinted - True when the active hint includes this corner.
 */
function drawCornerMarker(context: CanvasRenderingContext2D, point: { x: number; y: number }, corner: CornerInfo, hinted: boolean): void {
  const severity = cornerSeverity(corner);
  if (hinted) {
    context.beginPath();
    context.arc(point.x, point.y, MAZE_MAP.TURN_MARKER_RADIUS_PX + MAZE_MAP.HINT_RING_PX, 0, Math.PI * 2);
    context.strokeStyle = PALETTE.steeringHub;
    context.lineWidth = MAZE_MAP.HINT_RING_WIDTH_PX;
    context.stroke();
  }
  context.beginPath();
  context.arc(point.x, point.y, MAZE_MAP.TURN_MARKER_RADIUS_PX, 0, Math.PI * 2);
  context.fillStyle = SEVERITY_COLORS[severity];
  context.fill();
  context.strokeStyle = PALETTE.dashboard;
  context.lineWidth = TABLET.MARKER_STROKE_WIDTH;
  context.stroke();
  context.fillStyle = PALETTE.dashboard;
  context.font = `bold ${MAZE_MAP.SEVERITY_FONT_PX}px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(severity), point.x, point.y + TABLET.CORNER_MARKER_BASELINE_OFFSET);
  context.textAlign = "left";
}

/**
 * Draws the start or finish marker.
 * @param context - Canvas context.
 * @param point - Projected position.
 * @param label - Single letter.
 * @param fill - Marker colour.
 */
function drawFlag(context: CanvasRenderingContext2D, point: { x: number; y: number }, label: string, fill: string): void {
  context.beginPath();
  context.arc(point.x, point.y, TABLET.START_MARKER_RADIUS + 3, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = PALETTE.dashboard;
  context.lineWidth = TABLET.MARKER_STROKE_WIDTH;
  context.stroke();
  context.fillStyle = PALETTE.dashboard;
  context.font = `bold ${MAZE_MAP.FONT_PX - 4}px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, point.x, point.y + TABLET.CORNER_MARKER_BASELINE_OFFSET);
  context.textAlign = "left";
}

/**
 * Draws the car as an arrow pointing the way it faces (north is up).
 * @param context - Canvas context.
 * @param point - Projected car position.
 * @param heading - Car heading in the world.
 */
function drawCar(context: CanvasRenderingContext2D, point: { x: number; y: number }, heading: number): void {
  context.save();
  context.translate(point.x, point.y);
  // World +z is up the screen and +x is screen-left, so heading h turns the arrow by -h.
  context.rotate(-heading);
  context.beginPath();
  context.moveTo(0, -MAZE_MAP.CAR_LENGTH_PX);
  context.lineTo(MAZE_MAP.CAR_HALF_WIDTH_PX, MAZE_MAP.CAR_LENGTH_PX / 2);
  context.lineTo(0, TABLET.CAR_MARKER_TAIL_Y_OFFSET);
  context.lineTo(-MAZE_MAP.CAR_HALF_WIDTH_PX, MAZE_MAP.CAR_LENGTH_PX / 2);
  context.closePath();
  context.fillStyle = PALETTE.carBody;
  context.fill();
  context.strokeStyle = PALETTE.gaugeFace;
  context.lineWidth = TABLET.MARKER_STROKE_WIDTH;
  context.stroke();
  context.restore();
}

/**
 * Draws the title, view mode, zoom and remaining hints.
 * @param context - Canvas context.
 * @param tablet - Tablet state.
 * @param scale - Pixels per metre in use.
 */
function drawHeader(context: CanvasRenderingContext2D, tablet: TabletState, scale: number): void {
  context.fillStyle = PALETTE.gaugeFace;
  context.font = `bold ${MAZE_MAP.TITLE_FONT_PX}px ${FONT_FAMILY}`;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillText("RALLY NAV", TABLET.HEADER_TITLE_X, TABLET.HEADER_CENTER_Y);
  context.fillStyle = PALETTE.lever;
  context.font = `bold ${MAZE_MAP.FONT_PX}px ${FONT_FAMILY}`;
  context.textAlign = "right";
  const view = tablet.view.mode === "CAR" ? "CENTRED ON CAR" : "FULL MAP";
  context.fillText(`${view}  ·  HINTS ${tablet.hintsLeft}/${MAZE_MAP.HINTS_PER_RACE}  ·  ${Math.round(scale * 100) / 100} px/m`, context.canvas.width - TABLET.HEADER_TITLE_X, TABLET.HEADER_CENTER_Y);
  context.textAlign = "left";
}

/**
 * Draws the key reference along the bottom; it lights up when the co-driver looks at the tablet.
 * @param context - Canvas context.
 * @param width - Canvas width.
 * @param height - Canvas height.
 * @param tablet - Tablet state.
 */
function drawLegend(context: CanvasRenderingContext2D, width: number, height: number, tablet: TabletState): void {
  context.fillStyle = tablet.focused ? PALETTE.interiorLight : PALETTE.interior;
  context.fillRect(0, height - TABLET.LEGEND_HEIGHT, width, TABLET.LEGEND_HEIGHT);
  context.fillStyle = PALETTE.gaugeFace;
  context.font = `${MAZE_MAP.FOOTER_FONT_PX}px ${FONT_FAMILY}`;
  context.textBaseline = "middle";
  context.textAlign = "center";
  const text = tablet.focused
    ? "Q / E zoom   ·   W A S D move map   ·   M full map / centred   ·   H hint: next 5 turns"
    : "Look at the tablet to use the map keys (Q/E zoom · WASD move · M view · H hint)";
  context.fillText(text, width / 2, height - TABLET.LEGEND_HEIGHT / 2);
  context.textAlign = "left";
}
