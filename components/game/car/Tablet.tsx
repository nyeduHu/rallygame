// components/game/car/Tablet.tsx
"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, SRGBColorSpace, Vector3, type MeshBasicMaterial } from "three";
import { TABLET } from "@/lib/game/constants";
import type { SessionView } from "@/lib/game/sessionView";
import { PALETTE } from "@/lib/game/palette";
import { generateBranchNotes, generateRouteNotes } from "@/lib/game/stage/paceNotes";
import { NetworkIndex } from "@/lib/game/stage/networkIndex";
import { poseAt } from "@/lib/game/stage/roadIndex";
import type { PaceNote, RoadSample } from "@/lib/game/stage/types";
import { Interactable } from "../interaction/Interactable";
import type { InteractableSpec } from "@/lib/game/interaction/interactionSystem";
import type { Role } from "@/lib/game/roles";
import {
  computeFit,
  createReveal,
  finishDirection,
  fitPoint,
  isRevealedAt,
  revealedRuns,
  revealAll,
  type MapFit,
  type RevealState,
} from "@/lib/game/map/networkMap";
import {
  mapHeadingToCanvasAngle,
  projectNextPoint,
  type MapPoint,
  type MapViewport,
  type MapWorldPoint,
} from "@/lib/game/map/mapRenderer";

/** Everything the tablet needs about the road network, built once per stage. */
interface TabletData {
  network: NetworkIndex;
  routeNotes: PaceNote[];
  branchNotes: Map<number, PaceNote[]>;
  reveal: RevealState;
  fit: MapFit;
}

type TabletMode = "NEXT" | "OVERVIEW";

interface TabletProps {
  session: SessionView;
  activeRole: Role;
}

const WORLD_FORWARD = new Vector3(0, 0, 1);
const SCREEN_SIZE = TABLET.SCREEN_SIZE;
const BODY_SIZE = TABLET.BODY_SIZE;
const BUTTON_SIZE = TABLET.BUTTON_SIZE;
const SCREEN_OFFSET = TABLET.SCREEN_OFFSET;
const BUTTON_OFFSET = TABLET.BUTTON_OFFSET;
const FONT_FAMILY = "Arial, sans-serif";

/**
 * Co-driver's physical navigation tablet and throttled stage-map display.
 * @param props - Active stage session and optional interaction registration seam.
 * @returns Bezel, textured screen, and mode button in car-local space.
 */
export function Tablet({ session, activeRole }: TabletProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<CanvasTexture | null>(null);
  const screenMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const elapsedRef = useRef(0);
  const contentKeyRef = useRef<string | null>(null);
  const [mode, setMode] = useState<TabletMode>("NEXT");
  const stage = session.stage;
  const [data] = useState<TabletData>(() => createTabletData(stage));
  const toggleMode = useCallback(() => {
    setMode((current) => (current === "NEXT" ? "OVERVIEW" : "NEXT"));
  }, []);
  const modeToggleSpec = useMemo<InteractableSpec>(() => ({
    id: "tablet-map-mode",
    kind: "toggle",
    roles: ["codriver"],
    isEnabled: () => activeRole === "codriver",
    label: "Map mode",
    getObjects: () => [],
    onPress: toggleMode,
  }), [activeRole, toggleMode]);

  useLayoutEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TABLET.CANVAS_SIZE.width;
    canvas.height = TABLET.CANVAS_SIZE.height;
    canvasRef.current = canvas;
    const nextTexture = new CanvasTexture(canvas);
    nextTexture.colorSpace = SRGBColorSpace;
    textureRef.current = nextTexture;
    drawTablet(canvas, session, data, mode);
    contentKeyRef.current = getTabletContentKey(session, data, mode);
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
  }, [mode, data, session]);

  useFrame((_, delta) => {
    const activeTexture = textureRef.current;
    if (!activeTexture || !canvasRef.current) return;
    elapsedRef.current += delta;
    if (elapsedRef.current < 1 / TABLET.REDRAW_HZ) return;
    elapsedRef.current %= 1 / TABLET.REDRAW_HZ;
    const nextContentKey = getTabletContentKey(session, data, mode);
    if (nextContentKey === contentKeyRef.current) return;
    contentKeyRef.current = nextContentKey;
    drawTablet(canvasRef.current, session, data, mode);
    activeTexture.needsUpdate = true;
  });

  return (
    <group name="co-driver-navigation-tablet">
      <RoundedBox
        args={[...BODY_SIZE]}
        radius={TABLET.BODY_CORNER_RADIUS}
        smoothness={3}
        position={[...TABLET.BODY_POSITION]}
        castShadow
      >
        <meshStandardMaterial color={PALETTE.interior} flatShading roughness={TABLET.BODY_ROUGHNESS} />
      </RoundedBox>
      <mesh position={[...SCREEN_OFFSET]} rotation={[0, TABLET.SCREEN_FACING_YAW, 0]}>
        <planeGeometry args={[SCREEN_SIZE[0], SCREEN_SIZE[1]]} />
        <meshBasicMaterial ref={screenMaterialRef} toneMapped={false} />
      </mesh>
      <Interactable spec={modeToggleSpec}>
        <mesh name="tablet-mode-button" position={[...BUTTON_OFFSET]}>
          <boxGeometry args={[...BUTTON_SIZE]} />
          <meshStandardMaterial color={mode === "NEXT" ? PALETTE.leverKnob : PALETTE.steeringHub} flatShading />
        </mesh>
      </Interactable>
    </group>
  );
}

/**
 * Returns the fixed pixel dimensions reserved for the tablet map.
 * @returns Map viewport dimensions.
 */
function mapViewport(): MapViewport {
  return {
    width: TABLET.CANVAS_SIZE.width,
    height: TABLET.CANVAS_SIZE.height - TABLET.HEADER_HEIGHT - TABLET.NOTE_STRIP_HEIGHT - TABLET.LEGEND_HEIGHT,
  };
}

/**
 * Builds the per-stage tablet data: the network index, notes for every road, the fog of war
 * and the overview fit.
 * @param stage - Stage with its side roads.
 * @returns Tablet data.
 */
function createTabletData(stage: SessionView["stage"]): TabletData {
  const reveal = createReveal(stage);
  // The navigator sees the whole map; working out which road is right is the puzzle.
  revealAll(reveal);
  return {
    network: new NetworkIndex(stage.samples, stage.branches),
    routeNotes: generateRouteNotes(stage),
    branchNotes: new Map(stage.branches.map((branch) => [branch.id, generateBranchNotes(branch)])),
    reveal,
    fit: computeFit(reveal.paths, mapViewport(), TABLET.MAP_MARGIN),
  };
}

/** Where the car is on the network and which notes apply there. */
interface Located {
  car: MapWorldPoint;
  /** Progress on the reference route (equivalent progress when on a side road). */
  progress: number;
  notes: ReadonlyArray<PaceNote>;
  /** Progress along the road the notes belong to. */
  noteProgress: number;
  branchId: number | null;
}

/**
 * Finds the car on the network, uncovers the road around it and picks the notes for the road it
 * is on.
 * @param session - Session with the interpolated car pose.
 * @param data - Tablet data.
 * @returns Car position, progress and the active notes.
 */
function locate(session: SessionView, data: TabletData): Located {
  const position = session.renderPosition;
  const headingVector = WORLD_FORWARD.clone().applyQuaternion(session.renderQuaternion);
  const heading = Math.atan2(headingVector.x, headingVector.z);
  const projection = data.network.nearest(position.x, position.z, TABLET.PROJECTION_SEARCH_RADIUS);
  const progress = projection?.s ?? session.stage.startS;
  const branchId = projection?.branchId ?? null;
  const notes = branchId === null ? data.routeNotes : (data.branchNotes.get(branchId) ?? data.routeNotes);
  const noteProgress = branchId === null ? progress : (projection?.localS ?? 0);
  return { car: { x: position.x, z: position.z, s: progress, heading }, progress, notes, noteProgress, branchId };
}

/**
 * Builds the world-to-canvas projection for a map mode.
 * @param mode - NEXT (heading up, zoomed) or OVERVIEW (north up, whole network).
 * @param car - Car world point.
 * @param data - Tablet data (for the overview fit).
 * @returns Projection into map canvas coordinates (below the header).
 */
function makeProjector(mode: TabletMode, car: MapWorldPoint, data: TabletData): (world: MapWorldPoint) => MapPoint {
  const viewport = mapViewport();
  const pixelsPerMetre = Math.max(
    0,
    (viewport.height * TABLET.NEXT_CAR_VERTICAL_RATIO - TABLET.MAP_MARGIN) / TABLET.NEXT_WINDOW_METRES,
  );
  return (world) => {
    const point = mode === "NEXT"
      ? projectNextPoint(world, car, viewport, pixelsPerMetre, TABLET.NEXT_CAR_VERTICAL_RATIO)
      : fitPoint(data.fit, world.x, world.z, world.s, world.heading);
    return { ...point, y: point.y + TABLET.HEADER_HEIGHT };
  };
}

/**
 * Produces a compact visual-state key so an unchanged screen avoids canvas work and GPU uploads.
 * @param session - Current stage session and interpolated car pose.
 * @param data - Tablet data.
 * @param mode - Current map scale mode.
 * @returns Quantized key for all visible dynamic tablet content.
 */
function getTabletContentKey(session: SessionView, data: TabletData, mode: TabletMode): string {
  const located = locate(session, data);
  const { car, notes, noteProgress, progress } = located;
  const marker = makeProjector(mode, car, data)(car);
  const canvasHeading = mapHeadingToCanvasAngle(marker.heading);
  const current = notes.find((note) => note.atS >= noteProgress) ?? notes[notes.length - 1];
  const currentIndex = Math.max(0, notes.indexOf(current));
  const following = notes[currentIndex + 1] ?? current;
  const visibleDistance = Math.round(Math.max(0, current.atS - noteProgress));
  const finish = poseAt(session.stage.samples, session.stage.finishS);
  const finishDistance = Math.round(finishDirection(car, finish).distance / TABLET.FINISH_DISTANCE_STEP_M);
  const viewport = mapViewport();
  const nextRoadPixel = mode === "NEXT"
    ? Math.round(progress * ((viewport.height * TABLET.NEXT_CAR_VERTICAL_RATIO - TABLET.MAP_MARGIN) / TABLET.NEXT_WINDOW_METRES))
    : 0;

  return [
    mode,
    session.stage.seed,
    Math.round(marker.x),
    Math.round(marker.y),
    Math.round(canvasHeading * TABLET.DEGREES_PER_RADIAN),
    Math.round(car.heading * TABLET.DEGREES_PER_RADIAN),
    nextRoadPixel,
    current.text,
    following.text,
    visibleDistance,
    data.reveal.count,
    located.branchId ?? "main",
    finishDistance,
  ].join("|");
}

/**
 * Redraws map, markers, legend, and call strip onto the existing canvas. Only roads the car has
 * seen are drawn; the finish is shown as a direction and distance rather than a map position.
 * @param canvas - Persistent screen canvas.
 * @param session - Current stage and interpolated vehicle pose.
 * @param data - Tablet data.
 * @param mode - Current map scale mode.
 */
function drawTablet(canvas: HTMLCanvasElement, session: SessionView, data: TabletData, mode: TabletMode): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const viewport = mapViewport();
  const { stage } = session;
  const located = locate(session, data);
  const { car, notes, noteProgress, progress } = located;
  const current = notes.find((note) => note.atS >= noteProgress) ?? notes[notes.length - 1];
  const followingIndex = Math.max(0, notes.indexOf(current));
  const following = notes[followingIndex + 1] ?? notes[followingIndex];
  const toPoint = makeProjector(mode, car, data);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = PALETTE.dashboard;
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawHeader(context, mode, canvas.width);
  context.save();
  context.beginPath();
  context.rect(0, TABLET.HEADER_HEIGHT, viewport.width, viewport.height);
  context.clip();

  const { reveal } = data;
  reveal.paths.forEach((path, pathIndex) => {
    revealedRuns(path, reveal.revealed[pathIndex]).forEach((run) => {
      drawRoad(context, run.map((sample) => toPoint(sampleWorldPoint(sample))));
      drawDirectionArrows(context, run, toPoint);
    });
  });
  const referenceFlags = reveal.revealed[0];
  const referencePath = reveal.paths[0];
  if (isRevealedAt(referencePath, referenceFlags, stage.startS)) drawStart(context, stage, toPoint);
  if (isRevealedAt(referencePath, referenceFlags, stage.finishS)) drawFinish(context, stage, toPoint);
  drawCheckpoints(
    context,
    stage.checkpointS.filter((distance) => isRevealedAt(referencePath, referenceFlags, distance)),
    stage.samples,
    toPoint,
  );
  drawDistanceTicks(context, stage, progress, mode, toPoint, (distance) => isRevealedAt(referencePath, referenceFlags, distance));
  drawCornerMarkers(context, stage.corners, stage.samples, data.routeNotes, referencePath, referenceFlags, toPoint);
  stage.branches.forEach((branch) => {
    const index = reveal.paths.findIndex((path) => path.id === branch.id);
    drawCornerMarkers(context, branch.corners, branch.samples, data.branchNotes.get(branch.id) ?? [], reveal.paths[index], reveal.revealed[index], toPoint);
  });
  drawCar(context, toPoint(car));
  drawFinishBearing(context, stage, car, toPoint, viewport.width);
  context.restore();
  drawPaceStrip(context, canvas.width, canvas.height, current, following, Math.max(0, current.atS - noteProgress));
  drawLegend(context, canvas.width, canvas.height);
}

/**
 * Copies a road sample into the renderer's world-point contract.
 * @param sample - Stage road sample.
 * @returns World position, progress, and heading.
 */
function sampleWorldPoint(sample: { x: number; z: number; s: number; heading: number }): MapWorldPoint {
  return { x: sample.x, z: sample.z, s: sample.s, heading: sample.heading };
}

/**
 * Draws the mode title and a compact screen-state indicator.
 * @param context - Canvas context.
 * @param mode - Active map mode.
 * @param width - Canvas width.
 */
function drawHeader(context: CanvasRenderingContext2D, mode: TabletMode, width: number): void {
  context.fillStyle = PALETTE.gaugeFace;
  context.font = `bold ${TABLET.HEADER_TITLE_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textBaseline = "middle";
  context.fillText("RALLY NAV", TABLET.HEADER_TITLE_LEFT, TABLET.HEADER_CENTER_Y);
  context.textAlign = "right";
  context.fillStyle = PALETTE.lever;
  context.font = `bold ${TABLET.HEADER_MODE_FONT_SIZE}px ${FONT_FAMILY}`;
  context.fillText(mode, width - TABLET.HEADER_TITLE_X, TABLET.HEADER_CENTER_Y);
  context.textAlign = "left";
}

/**
 * Draws the stage centreline with a wide gravel casing and fine centre line.
 * @param context - Canvas context.
 * @param points - Projected centreline.
 */
function drawRoad(context: CanvasRenderingContext2D, points: ReadonlyArray<MapPoint>): void {
  if (points.length < 2) return;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
  context.strokeStyle = PALETTE.gravel;
  context.lineWidth = TABLET.ROAD_LINE_WIDTH;
  context.stroke();
  context.strokeStyle = PALETTE.gaugeFace;
  context.lineWidth = TABLET.ROAD_CENTER_LINE_WIDTH;
  context.stroke();
}

/**
 * Draws the start mark.
 * @param context - Canvas context.
 * @param stage - Current stage.
 * @param toPoint - World-to-canvas projection.
 */
function drawStart(
  context: CanvasRenderingContext2D,
  stage: SessionView["stage"],
  toPoint: (point: MapWorldPoint) => MapPoint,
): void {
  const start = poseAt(stage.samples, stage.startS);
  drawDot(
    context,
    toPoint(sampleWorldPoint({ ...start, s: stage.startS })),
    PALETTE.grass,
    TABLET.START_MARKER_RADIUS,
  );
}

/**
 * Draws the checkerboard finish mark (only once the finish has been seen).
 * @param context - Canvas context.
 * @param stage - Current stage.
 * @param toPoint - World-to-canvas projection.
 */
function drawFinish(
  context: CanvasRenderingContext2D,
  stage: SessionView["stage"],
  toPoint: (point: MapWorldPoint) => MapPoint,
): void {
  const finish = poseAt(stage.samples, stage.finishS);
  const point = toPoint(sampleWorldPoint({ ...finish, s: stage.finishS }));
  const tile = TABLET.FINISH_CHECKER_SIZE;
  context.save();
  context.translate(point.x, point.y);
  context.rotate(mapHeadingToCanvasAngle(point.heading));
  for (let row = 0; row < TABLET.FINISH_CHECKER_COLUMNS; row += 1) {
    for (let column = 0; column < TABLET.FINISH_CHECKER_COLUMNS; column += 1) {
      context.fillStyle = (row + column) % TABLET.FINISH_CHECKER_COLUMNS === 0
        ? PALETTE.gaugeFace
        : PALETTE.dashboard;
      context.fillRect(
        (column - TABLET.FINISH_CHECKER_CENTER_OFFSET) * tile,
        (row - TABLET.FINISH_CHECKER_CENTER_OFFSET) * tile,
        tile,
        tile,
      );
    }
  }
  context.restore();
}

/**
 * Draws a circular stage marker.
 * @param context - Canvas context.
 * @param point - Projected marker position.
 * @param color - Palette-derived marker color.
 * @param radius - Marker radius in screen pixels.
 */
function drawDot(context: CanvasRenderingContext2D, point: MapPoint, color: string, radius: number): void {
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = PALETTE.dashboard;
  context.lineWidth = TABLET.MARKER_STROKE_WIDTH;
  context.stroke();
}

/**
 * Draws checkpoint ticks across the road.
 * @param context - Canvas context.
 * @param checkpointDistances - Ordered checkpoint progress values.
 * @param samples - Road samples used to interpolate each checkpoint.
 * @param toPoint - World-to-canvas projection.
 */
function drawCheckpoints(
  context: CanvasRenderingContext2D,
  checkpointDistances: ReadonlyArray<number>,
  samples: SessionView["stage"]["samples"],
  toPoint: (point: MapWorldPoint) => MapPoint,
): void {
  context.strokeStyle = PALETTE.lever;
  context.lineWidth = TABLET.CHECKPOINT_LINE_WIDTH;
  checkpointDistances.forEach((distance) => {
    const pose = poseAt(samples, distance);
    const point = toPoint(sampleWorldPoint({ ...pose, s: distance }));
    const angle = mapHeadingToCanvasAngle(point.heading) + Math.PI / 2;
    const half = TABLET.CHECKPOINT_HALF_LENGTH;
    context.beginPath();
    context.moveTo(point.x - Math.cos(angle) * half, point.y - Math.sin(angle) * half);
    context.lineTo(point.x + Math.cos(angle) * half, point.y + Math.sin(angle) * half);
    context.stroke();
  });
}

/**
 * Places forward chevrons along a revealed run of road.
 * @param context - Canvas context.
 * @param run - Revealed road samples.
 * @param toPoint - World-to-canvas projection.
 */
function drawDirectionArrows(
  context: CanvasRenderingContext2D,
  run: ReadonlyArray<RoadSample>,
  toPoint: (point: MapWorldPoint) => MapPoint,
): void {
  context.strokeStyle = PALETTE.dashboard;
  context.lineWidth = TABLET.DIRECTION_ARROW_STROKE_WIDTH;
  run.forEach((sample, i) => {
    if (i % TABLET.ARROW_SAMPLE_INTERVAL !== TABLET.ARROW_SAMPLE_INTERVAL - 1) return;
    const point = toPoint(sampleWorldPoint(sample));
    context.save();
    context.translate(point.x, point.y);
    context.rotate(mapHeadingToCanvasAngle(point.heading));
    context.beginPath();
    context.moveTo(0, -TABLET.DIRECTION_ARROW_LENGTH);
    context.lineTo(-TABLET.DIRECTION_ARROW_HALF_WIDTH, TABLET.DIRECTION_ARROW_BASE_Y);
    context.moveTo(0, -TABLET.DIRECTION_ARROW_LENGTH);
    context.lineTo(TABLET.DIRECTION_ARROW_HALF_WIDTH, TABLET.DIRECTION_ARROW_BASE_Y);
    context.stroke();
    context.restore();
  });
}

/**
 * Marks each configured kilometre half interval on the road.
 * @param context - Canvas context.
 * @param stage - Current stage.
 * @param progress - Current car progress.
 * @param mode - Current map mode.
 * @param toPoint - World-to-canvas projection.
 * @param isSeen - Whether the road at a distance has been revealed.
 */
function drawDistanceTicks(
  context: CanvasRenderingContext2D,
  stage: SessionView["stage"],
  progress: number,
  mode: TabletMode,
  toPoint: (point: MapWorldPoint) => MapPoint,
  isSeen: (distance: number) => boolean,
): void {
  const firstDistance = mode === "OVERVIEW" ? 0 : progress;
  const first = Math.ceil(Math.max(0, firstDistance) / TABLET.DISTANCE_TICK_METRES) * TABLET.DISTANCE_TICK_METRES;
  context.font = `bold ${TABLET.DISTANCE_LABEL_FONT_SIZE}px ${FONT_FAMILY}`;
  context.fillStyle = PALETTE.gaugeFace;
  for (let distance = first; distance < stage.length; distance += TABLET.DISTANCE_TICK_METRES) {
    if (!isSeen(distance)) continue;
    const pose = poseAt(stage.samples, distance);
    const point = toPoint(sampleWorldPoint({ ...pose, s: distance }));
    context.fillText(
      `${(distance / 1000).toFixed(1)} km`,
      point.x + TABLET.DISTANCE_LABEL_OFFSET_X,
      point.y - TABLET.DISTANCE_LABEL_OFFSET_Y,
    );
  }
}

/**
 * Places numbered severity callouts at corner apexes (only where the road has been seen), with a
 * drawn hairpin curl.
 * @param context - Canvas context.
 * @param corners - Corners of the road being drawn.
 * @param samples - Samples of that road.
 * @param notes - Calls for that road with severity metadata.
 * @param path - The road's reveal path.
 * @param flags - Revealed flags for that road.
 * @param toPoint - World-to-canvas projection.
 */
function drawCornerMarkers(
  context: CanvasRenderingContext2D,
  corners: ReadonlyArray<SessionView["stage"]["corners"][number]>,
  samples: ReadonlyArray<RoadSample>,
  notes: ReadonlyArray<PaceNote>,
  path: Parameters<typeof isRevealedAt>[0],
  flags: Uint8Array,
  toPoint: (point: MapWorldPoint) => MapPoint,
): void {
  const cornerNotes = notes.filter((note) => note.cornerIndex >= 0);
  cornerNotes.forEach((note) => {
    const corner = corners[note.cornerIndex];
    if (!corner || !isRevealedAt(path, flags, corner.apexS)) return;
    const pose = poseAt(samples, corner.apexS);
    const point = toPoint(sampleWorldPoint({ ...pose, s: corner.apexS }));
    if (note.kind === "hairpin") drawHairpinGlyph(context, point, corner.direction);
    else {
      context.fillStyle = severityColor(note.severity);
      context.beginPath();
      context.arc(point.x, point.y, TABLET.CORNER_MARKER_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.dashboard;
      context.font = `bold ${TABLET.CORNER_MARKER_FONT_SIZE}px ${FONT_FAMILY}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(note.severity), point.x, point.y + TABLET.CORNER_MARKER_BASELINE_OFFSET);
      context.textAlign = "left";
    }
  });
}

/**
 * Draws the finish compass: an arrow toward the finish in the current map frame and the
 * straight-line distance. The finish itself stays off the map until the car sees it.
 * @param context - Canvas context.
 * @param stage - Current stage.
 * @param car - Car world point.
 * @param toPoint - World-to-canvas projection.
 * @param mapWidth - Map width, for placing the compass in the top-right corner.
 */
function drawFinishBearing(
  context: CanvasRenderingContext2D,
  stage: SessionView["stage"],
  car: MapWorldPoint,
  toPoint: (point: MapWorldPoint) => MapPoint,
  mapWidth: number,
): void {
  const finish = poseAt(stage.samples, stage.finishS);
  const { distance, far } = finishDirection(car, finish);
  const from = toPoint(car);
  const to = toPoint({ x: far.x, z: far.z, s: 0, heading: 0 });
  const angle = Math.atan2(to.x - from.x, -(to.y - from.y));
  const cx = mapWidth - TABLET.COMPASS_MARGIN;
  const cy = TABLET.HEADER_HEIGHT + TABLET.COMPASS_MARGIN;
  context.save();
  context.fillStyle = PALETTE.dashboard;
  context.strokeStyle = PALETTE.gaugeFace;
  context.lineWidth = TABLET.MARKER_STROKE_WIDTH;
  context.beginPath();
  context.arc(cx, cy, TABLET.COMPASS_RADIUS, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.translate(cx, cy);
  context.rotate(angle);
  context.fillStyle = PALETTE.grass;
  context.beginPath();
  context.moveTo(0, -TABLET.COMPASS_RADIUS + 4);
  context.lineTo(TABLET.COMPASS_RADIUS * 0.45, TABLET.COMPASS_RADIUS * 0.5);
  context.lineTo(0, TABLET.COMPASS_RADIUS * 0.2);
  context.lineTo(-TABLET.COMPASS_RADIUS * 0.45, TABLET.COMPASS_RADIUS * 0.5);
  context.closePath();
  context.fill();
  context.restore();
  context.fillStyle = PALETTE.gaugeFace;
  context.font = `bold ${TABLET.DISTANCE_LABEL_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.fillText(`FINISH ${distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`}`, cx, cy + TABLET.COMPASS_RADIUS + 18);
  context.textAlign = "left";
}

/**
 * Returns a palette token for a numbered corner class.
 * @param severity - Pace-note corner number.
 * @returns Severity color, reinforced by the marker's printed digit.
 */
function severityColor(severity: PaceNote["severity"]): string {
  if (severity <= 1) return PALETTE.grass;
  if (severity === 2) return PALETTE.steeringHub;
  if (severity === 3) return PALETTE.sleeve;
  return PALETTE.carBody;
}

/**
 * Draws a direction-specific curled hairpin mark without relying on font glyphs.
 * @param context - Canvas context.
 * @param point - Projected corner apex.
 * @param direction - 1 for left, -1 for right.
 */
function drawHairpinGlyph(context: CanvasRenderingContext2D, point: MapPoint, direction: number): void {
  context.save();
  context.translate(point.x, point.y);
  context.scale(direction, 1);
  context.strokeStyle = PALETTE.sleeve;
  context.lineWidth = TABLET.HAIRPIN_STROKE_WIDTH;
  context.beginPath();
  context.moveTo(TABLET.HAIRPIN_RADIUS - TABLET.HAIRPIN_ARROW_OFFSET, -TABLET.HAIRPIN_RADIUS);
  context.arc(0, 0, TABLET.HAIRPIN_RADIUS, -Math.PI / 3, Math.PI * 1.65, true);
  context.moveTo(-TABLET.HAIRPIN_ARROW_INSET, -TABLET.HAIRPIN_RADIUS - TABLET.HAIRPIN_ARROW_INSET);
  context.lineTo(
    TABLET.HAIRPIN_RADIUS - TABLET.HAIRPIN_ARROW_OFFSET,
    -TABLET.HAIRPIN_RADIUS - TABLET.HAIRPIN_ARROW_INSET,
  );
  context.lineTo(TABLET.HAIRPIN_RADIUS - TABLET.HAIRPIN_ARROW_OFFSET, -TABLET.HAIRPIN_ARROW_BASE_Y);
  context.stroke();
  context.restore();
}

/**
 * Draws a filled directional car marker from the projected car heading.
 * @param context - Canvas context.
 * @param point - Projected car screen position.
 */
function drawCar(context: CanvasRenderingContext2D, point: MapPoint): void {
  const angle = mapHeadingToCanvasAngle(point.heading);
  context.save();
  context.translate(point.x, point.y);
  context.rotate(angle);
  context.fillStyle = PALETTE.carBody;
  context.beginPath();
  context.moveTo(0, -TABLET.CAR_MARKER_LENGTH);
  context.lineTo(TABLET.CAR_MARKER_HALF_WIDTH, TABLET.CAR_MARKER_LENGTH - TABLET.CAR_MARKER_TAIL_Y_OFFSET);
  context.lineTo(0, TABLET.CAR_MARKER_REAR_INSET);
  context.lineTo(-TABLET.CAR_MARKER_HALF_WIDTH, TABLET.CAR_MARKER_LENGTH - TABLET.CAR_MARKER_TAIL_Y_OFFSET);
  context.closePath();
  context.fill();
  context.strokeStyle = PALETTE.gaugeFace;
  context.lineWidth = TABLET.MARKER_STROKE_WIDTH;
  context.stroke();
  context.restore();
}

/**
 * Draws the larger next call, following call, and remaining distance.
 * @param context - Canvas context.
 * @param width - Canvas width.
 * @param height - Canvas height.
 * @param current - Next call to reach.
 * @param following - Call after the next one.
 * @param distance - Metres until current call.
 */
function drawPaceStrip(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  current: PaceNote,
  following: PaceNote,
  distance: number,
): void {
  const top = height - TABLET.NOTE_STRIP_HEIGHT - TABLET.LEGEND_HEIGHT;
  context.fillStyle = PALETTE.dashboard;
  context.fillRect(0, top, width, TABLET.NOTE_STRIP_HEIGHT);
  context.fillStyle = PALETTE.lever;
  context.font = `bold ${TABLET.NOTE_LABEL_FONT_SIZE}px ${FONT_FAMILY}`;
  context.fillText("NEXT:", TABLET.NOTE_STRIP_PADDING_X, top + TABLET.NOTE_LABEL_BASELINE);
  context.fillStyle = PALETTE.gaugeFace;
  context.font = `bold ${TABLET.NOTE_PRIMARY_FONT_SIZE}px ${FONT_FAMILY}`;
  context.fillText(
    current.text.toUpperCase(),
    TABLET.NOTE_STRIP_PADDING_X,
    top + TABLET.NOTE_PRIMARY_BASELINE,
    width - TABLET.NOTE_DISTANCE_RESERVED_WIDTH,
  );
  context.textAlign = "right";
  context.font = `bold ${TABLET.NOTE_DISTANCE_FONT_SIZE}px ${FONT_FAMILY}`;
  context.fillText(`${Math.round(distance)} m`, width - TABLET.NOTE_STRIP_PADDING_X, top + TABLET.NOTE_DISTANCE_BASELINE);
  context.textAlign = "left";
  context.fillStyle = PALETTE.lever;
  context.font = `${TABLET.NOTE_FOLLOWUP_FONT_SIZE}px ${FONT_FAMILY}`;
  context.fillText(
    `THEN: ${following.text.toUpperCase()}`,
    TABLET.NOTE_STRIP_PADDING_X,
    top + TABLET.NOTE_FOLLOWUP_BASELINE,
    width - TABLET.NOTE_STRIP_PADDING_X * 2,
  );
}

/**
 * Draws the always-visible corner-class key, including a curled hairpin icon.
 * @param context - Canvas context.
 * @param width - Canvas width.
 * @param height - Canvas height.
 */
function drawLegend(context: CanvasRenderingContext2D, width: number, height: number): void {
  const top = height - TABLET.LEGEND_HEIGHT;
  context.fillStyle = PALETTE.dashboard;
  context.fillRect(0, top, width, TABLET.LEGEND_HEIGHT);
  context.font = `bold ${TABLET.LEGEND_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textBaseline = "middle";
  context.fillStyle = PALETTE.gaugeFace;
  context.fillText(
    "1 FAST  ·  2  ·  3  ·  4 TIGHT",
    TABLET.NOTE_STRIP_PADDING_X,
    top + TABLET.LEGEND_HEIGHT / 2,
  );
  drawHairpinGlyph(context, {
    x: width - TABLET.LEGEND_HAIRPIN_X_OFFSET,
    y: top + TABLET.LEGEND_HEIGHT / 2,
    s: 0,
    heading: 0,
  }, 1);
  context.fillText("HAIRPIN", width - TABLET.LEGEND_HAIRPIN_TEXT_OFFSET, top + TABLET.LEGEND_HEIGHT / 2);
  context.textBaseline = "alphabetic";
}
