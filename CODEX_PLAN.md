# CODEX_PLAN.md — Cooperative Rally Game: step-by-step build plan

> Audience: Codex (or any coding agent). Read this whole file, then `cooperative_rally_game_codex_spec.md`, then `AGENTS.md`, before touching code.
> This file is the **execution contract**. The spec says *what* the game is; this file says *exactly how* to build the rest, in order.
> If this file and the spec disagree, **this file wins** (it records the resolved decisions, section 2).

---

## 0. How to use this document

1. Work **one step at a time, in order**. Never start step N+1 before step N's **Done when** checklist is fully true.
2. Every step has: **Goal → Files → Exact work → Constants → Done when → Do not**. Follow all six.
3. After **every** step run the gate commands (section 1.4). If any fails, fix it before moving on.
4. If something is unclear, blocked, or needs a decision not listed in section 2: **stop and write the question at the bottom of this file under `## Open questions`**, then continue with the next unblocked step. Never guess, never hack around it.
5. Do not refactor Phase 1 code unless a step explicitly says so. Extend it; do not rewrite it.
6. The user said: **no security-audit, UI/UX-review or code-review passes** for this project. Do not spawn or simulate them. Still follow every rule in section 1; the rules are not optional just because nobody reviews.
7. Keep your progress notes terse: after each step append one line to `## Progress log` at the bottom (step id, date, one sentence).

---

## 1. Hard rules (apply to every file you write)

### 1.1 Code rules
- **Line 1 of every file is a comment with its repo-relative path**, e.g. `// lib/game/foo.ts` (CSS: `/* app/globals.css */`, Markdown exempt).
- **JSDoc on every function/method/class/hook/component**: purpose, `@param` per parameter, `@returns` (omit `@returns` only for void). Comments explain *why*, never *what*.
- **No `any`** (use `unknown` + narrowing, generics, or `zod` parsing). No `as` casts to silence errors; allowed only for branded types or after a runtime check.
- **`const` by default**, `let` only for reassignment. **Never `var`.**
- **No magic numbers.** Every tunable goes in a named constant in `lib/game/constants.ts` (or a new `lib/game/<domain>Constants.ts` re-exported from it if the file would exceed ~500 lines). Layout-only geometry goes in `lib/game/cockpitLayout.ts`. Colours go in `lib/game/palette.ts` (3D) or `@theme` tokens in `app/globals.css` (DOM/Tailwind). Net/protocol numbers go in `lib/net/netConstants.ts`.
- **No inline styles** (`style={{}}`) in DOM components: use Tailwind classes with theme tokens. (R3F props like `position`/`rotation` on 3D objects are fine — they are not DOM styles.) For truly dynamic DOM values (a progress bar width) use a CSS custom property set via a ref + a Tailwind arbitrary value, or `<progress>`/`<meter>`; do not use the `style` prop.
- **No hardcoded secrets.** All config via `process.env` read in one module (`server/env.ts`), validated with zod, with `.env.example` documenting every variable. Never commit `.env`.
- **No TODO/FIXME comments.** Do it or log it in `## Open questions`.
- **Full files only** when creating/rewriting. When editing, make surgical edits; never leave a file half-finished.
- **No new dependency unless listed in this plan** (each is listed with a reason in the step that needs it). Anything else → stop, `## Open questions`.
- **Never use Supabase.**

### 1.2 Next.js 16 warning (important)
`AGENTS.md` in the repo root says: *"This is NOT the Next.js you know."* The installed version is **Next 16.3.8, React 19.2, Tailwind v4**. Before writing **any** Next-specific code (routes, layouts, route handlers, metadata, `redirect`, `searchParams`, caching, `next.config.ts`) read the relevant file in `node_modules/next/dist/docs/`. Known-good facts already in the repo:
- `searchParams` is a **Promise** (`await searchParams`), typed `PageProps<"/">`.
- `error.tsx` receives a `retry` prop (not `reset`).
- Tailwind v4: tokens live in `@theme` inside `app/globals.css`; there is no `tailwind.config.js`.
- Client-only 3D code is behind `components/game/RallyGameLoader.tsx` (dynamic, no SSR). Keep it that way: anything touching `window`, `document`, `three` rendering, or Rapier WASM must never run on the server render path.

### 1.3 Conventions already established in the repo (match them)
| Topic | Convention |
|---|---|
| Units | metres, seconds, kilograms, newtons, radians. Speeds stored in m/s; km/h only for display via `UNITS.MS_TO_KMH`. |
| Car-local axes | `x = left`, `y = up`, `z = forward`, origin at chassis centre. **Left-hand drive: driver sits at +x (`COCKPIT.DRIVER_X = 0.37`), passenger at −x (`COCKPIT.PASSENGER_X = -0.37`).** |
| World road heading | tangent = `(sin h, 0, cos h)`; **increasing heading turns LEFT**. `CornerInfo.direction`: `1 = left`, `-1 = right`. |
| Camera | Three cameras look down **−z**; the car faces **+z**, so cockpit camera adds `FACE_FORWARD_YAW = Math.PI` (see `components/game/car/CameraRig.tsx`). |
| Frame order | `FRAME_PRIORITY` in `components/game/scene/framePriority.ts`: `SIMULATION −3` → `CAR −2` → `CAMERA −1`. New per-frame systems must pick a priority that preserves this order (e.g. interaction raycast at `0`, after camera). |
| Simulation | `GameSession` (`lib/game/session.ts`) owns Rapier world + `Vehicle` + `RaceTracker`; fixed 120 Hz step (`SIMULATION.FIXED_TIMESTEP`), render-interpolated pose in `session.renderPosition` / `session.renderQuaternion`. React never steps physics. |
| UI state | `useGameStore` (`lib/game/store.ts`, zustand) holds **only** UI-facing data, published at `SIMULATION.HUD_PUBLISH_INTERVAL` (20 Hz). 120 Hz data stays in plain class fields, never in React state. |
| Models | Kenney GLBs normalised by `lib/game/three/models.ts` (`extractModelParts`, `ModelFit`). Paths in `lib/game/assets.ts`. Only GLBs actually used live in `public/assets/**`. |
| Seeds | `?seed=847291`; deterministic RNG in `lib/game/random.ts` (`createRng`, `deriveSeed(seed, salt)`, `parseSeed`, `randomSeed`). **Any new random decision must derive its own stream with `deriveSeed(stage.seed, <unique salt constant>)`** so adding features never changes existing stages. Register every salt in `SEED_SALTS` in `constants.ts`. |
| Stage data | `StageData` (`lib/game/stage/types.ts`) is **pure data, no engine types**. Keep it serialisable (typed arrays allowed; no class instances). It is generated identically on every client and the server from the seed. |
| Corner classes | `CORNER_CLASSES` ids: `hairpin`, `tight`, `medium`, `fast`. Radii (m): hairpin 12–16, tight 22–40, medium 45–90, fast 100–220. |

### 1.4 Gate commands (run after every step)
```bash
npx tsc --noEmit            # must print nothing
npx eslint .                # must print nothing
npm run build               # must succeed
npm test                    # (once vitest is added in step 2.0) must pass
```
For server code (from step 3.1 on) also: `npx tsc --noEmit -p server/tsconfig.json`.
A step is **not done** if any gate fails, even for unrelated-looking reasons you introduced.

### 1.5 Verifying visually
Headless Chrome in this environment renders ~3 fps (software GL), so frame rate and "feel" **cannot** be verified by you. What you *can* verify: it loads, no console errors, state transitions, geometry placement (screenshots), logic via unit tests and headless scripts. Never claim "feels good" or "runs at 60 fps". Report what you checked and what only a human on real hardware can check.

---

## 2. Resolved decisions (do not reopen)

| # | Topic | Decision | Why |
|---|---|---|---|
| D1 | Voice | **Discord only** (spec §32). No WebRTC in the game. Spec §15/§23 mention WebRTC as a fallback — ignore that. | Spec §32 "finalized decisions" replaces earlier text. |
| D2 | Networking library | **Socket.IO** (server `socket.io`, client `socket.io-client`) over an **Express** HTTP server. | Rooms, acks, reconnection built in; matches the Express stack. |
| D3 | Repo layout | Keep Next.js app at repo root. Add `server/` (Node + Express + Socket.IO, own `tsconfig`), and `lib/net/` (protocol + constants shared by client and server). Server imports pure code from `lib/game/**` by relative path. **No monorepo/workspaces.** | Smallest change; shared deterministic stage code. |
| D4 | Authority model | **Server owns**: room/team/role state, race clock, checkpoints & finish, penalties, fuel, engine health, engine temperature, damage, weather, wipers state, repair/pit state machines, results. **Driver's client owns**: the car's rigid-body physics (Rapier runs in the browser). Server **validates** every pose report (speed, displacement, on-road projection, checkpoint order) and rejects/corrects implausible ones. | Server-side Rapier for N cars at 120 Hz is out of scope for the MVP; validation keeps competitive results honest enough. Upgrade path is noted in step 3.9. |
| D5 | Other teams | Other teams' cars are **visual ghosts only** (no car-to-car collision). Rendered with the Kenney car, interpolated. | Avoids collision netcode; keeps the "same stage, race for time" model. |
| D6 | Pace-note scale | Corner severity **1 = fastest/gentlest … 4 = tightest**, plus the separate call `HAIRPIN`. Bands by radius in step 2.1. A legend is printed on the tablet. | Spec lists `Left 1..4` + `Hairpin` but not the direction of the scale; we pick one and show it. |
| D7 | Wipers | Boolean `wipers: boolean` (spec §26), a physical 2-position switch on the **co-driver's** side of the dash. | Matches spec state shape. |
| D8 | Results visibility | A team sees its **own** result immediately on finish/DNF. The **room ranking** is revealed when every team has finished or DNF'd, or `RESULTS_TIMEOUT_AFTER_FIRST_FINISH` seconds after the first finish, whichever is first. | Spec §20 hidden-information note. |
| D9 | Total time formula | `total = rawTime + penaltySeconds + pitSeconds`. `rawTime` = time from go until finish, **excluding** pit-stop duration. Matches the spec §20 example (08:42.31 + 00:18.00 + 00:42.15 = 09:42.46). | Spec example. |
| D10 | Roles & seats | Driver = left-hand seat (+x). Co-driver = passenger seat (−x). Role is chosen in the lobby; host is not forced to drive. Role swap between stages is **out of MVP**. | Spec §14. |
| D11 | Persistence | None in MVP. Rooms live in server memory. | Spec §23. |
| D12 | One-computer test mode | A dev-only route `/?seed=…&role=driver|codriver&solo=1` lets one browser tab simulate either role locally (no server) with a **Tab-hold** key that swaps the active role view. Used through phase 2 and for later debugging. | Spec Phase 2 goal. |

---

## 3. Snapshot of the existing code (Phase 1, done)

Do not re-derive this; read these files when a step references them.

```
app/                       page.tsx (seed in URL, redirect to random), layout, loading, error, globals.css (@theme tokens)
components/game/
  RallyGame.tsx            Canvas + overlays + key/mouse wiring + start/restart flow
  RallyGameLoader.tsx      dynamic, client-only wrapper
  useGameSession.ts        generateStage(seed) → road/terrain mesh data → GameSession (after Rapier WASM loads)
  scene/                   GameScene, SimulationDriver (calls session.advance + publishes HUD at 20 Hz), GroundMesh,
                           StageProps (instanced trees/rocks/grass/barriers), Cones (physics-driven), Gates, Lighting,
                           InstancedModel, useModelParts, framePriority
  car/                     CarRig (exterior pose), CarExterior (Kenney hatchback), Cockpit, CockpitShell, Gauges,
                           SteeringWheel, Levers (gear lever + handbrake), CameraRig (cockpit sway / chase), Beam
  hud/                     Hud, Speedometer, StageTimer
  overlays/                StartOverlay, FinishOverlay, LoadingScreen, ControlsList
lib/game/
  constants.ts             ALL tunables (SIMULATION, SEED, ROAD, CORNER_CLASSES, TERRAIN, PROPS, GATES, SURFACES,
                           VEHICLE, TIRE, DRIVETRAIN, STEERING, CAMERA, RENDER, UNITS)
  cockpitLayout.ts         COCKPIT geometry (dash, gauges, steering, hands, seat, console, gear lever, handbrake…)
  palette.ts / color.ts    3D colour tokens (PALETTE, paletteLinear, mixRgb)
  random.ts noise.ts math.ts format.ts   PRNG, value noise, clamp/lerp/moveTowards/smoothstep/wrapAngle, formatStageTime
  assets.ts                MODEL_PATHS, TREE/ROCK/BARRIER_MODEL_PATHS, CAR_WHEEL_NODE_NAMES, CAR_MODEL_SCALE…
  session.ts               GameSession (see 1.3)
  store.ts                 useGameStore: telemetry{speedKmh,rpm,gear,surface}, race: RaceSnapshot, viewMode, pointerLocked
  input/                   KeyboardControls (held keys + one-shot actions), MouseLook (pointer lock, yaw/pitch, recentre)
  physics/                 createWorld, vehicle (Vehicle, DriverControls, WheelState), drivetrain, rapier loader, collisionGroups
  race/raceTracker.ts      RaceTracker: phases ready|countdown|running|finished, ordered checkpoints by arc length, splits
  stage/                   generateStage (seed → StageData), roadLayout, roadIndex (RoadIndex, poseAt, leftVector),
                           terrain, props, meshData, types (StageData, CornerInfo, RoadSample, PropPlacement…)
public/assets/             17 Kenney GLBs + License files + LICENSES.md (CC0, credit Kenney)
```

Current controls: W/S/A/D, Space handbrake, R reset to road, C chase/cockpit toggle, Enter restart after finish, mouse look (pointer lock), E captured but unused.
Known gaps: banner towers/checker flags have no colliders; some seeds have no hairpins; console warning "THREE.Clock deprecated" comes from `@react-three/fiber` internals (ignore).

---

# PHASE 1.5 — Stabilise and tune the driving prototype

## Step 1.5.0 — Add the test runner
**Goal:** pure-logic unit tests available for every later step.
**Dependencies to add (dev):** `vitest` (test runner; works with TS, no config needed beyond path alias).
**Files:** `package.json` (script `"test": "vitest run"`), `vitest.config.ts` (alias `@` → repo root, `environment: "node"`).
**Exact work:**
1. `npm i -D vitest`.
2. `vitest.config.ts` (full file, path comment on line 1): `defineConfig({ test: { environment: "node", include: ["lib/**/*.test.ts", "server/**/*.test.ts"] }, resolve: { alias: { "@": path.resolve(__dirname, ".") } } })`.
3. Add `lib/game/stage/generateStage.test.ts` with: (a) same seed twice ⇒ deep-equal `samples`, `checkpointS`, `corners`; (b) 200 seeds (1..200) each generate without throwing and `finishS > startS`, `checkpointS` strictly increasing and inside `(startS, finishS)`; (c) different seeds ⇒ different `samples[100]`.
**Done when:** `npm test` passes and runs the three tests.
**Do not:** add jsdom, testing-library or any other test dependency.

## Step 1.5.1 — Guarantee corner variety and expose it for pace notes
**Goal:** every stage has at least 1 hairpin-or-tight corner and at least 8 corners total, deterministically; this is required so cones/notes exist on every seed.
**Files:** `lib/game/stage/roadLayout.ts`, `lib/game/constants.ts` (`ROAD.MIN_CORNERS`, `ROAD.MIN_SEVERE_CORNERS`), `generateStage.test.ts`.
**Exact work:** read `roadLayout.ts` fully first. The generator already retries with `deriveSeed(seed, attempt * ATTEMPT_SALT)`. Add a validation predicate: reject an attempt when `corners.length < MIN_CORNERS` or the count of corners with `classId` in `{hairpin, tight}` is `< MIN_SEVERE_CORNERS`. Defaults: `MIN_CORNERS = 8`, `MIN_SEVERE_CORNERS = 1`. Keep the maximum retry cap and make failure after the cap throw with the seed in the message (never loop forever).
**Done when:** test over seeds 1..200 asserts both minimums; build passes.
**Do not:** change any existing constant of `CORNER_CLASSES`.

## Step 1.5.2 — Colliders for gate dressing
**Goal:** driving into banner towers / checkered flags next to gates hurts like any solid object.
**Files:** `lib/game/physics/createWorld.ts`, `components/game/scene/Gates.tsx`, `lib/game/constants.ts` (`GATES`).
**Exact work:** `gateArcPositions(stage)` already lists gate arc positions. For each gate add two fixed cuboid colliders matching the visual tower footprint (`GATES.TOWER_HALF_EXTENTS`, new constant measured from the GLB bounding box after normalisation) at left/right of the road at `ROAD.WIDTH / 2 + GATES.TOWER_OFFSET`, using the same collision group/mask as tree colliders (`GROUPS` in `collisionGroups.ts`). Flags stay non-solid (visual only).
**Done when:** a headless script (see step 1.5.4) driving straight into a tower reduces speed to < 5 m/s within 1 s.

## Step 1.5.3 — Surface-aware tuning pass (data only)
**Goal:** make handling tunable by a human without code changes.
**Exact work:** add a dev-only tuning overlay `components/game/hud/TuningPanel.tsx` shown when URL has `&tune=1`. It lists every field of `VEHICLE`, `TIRE`, `DRIVETRAIN`, `STEERING` with number inputs; changes write to a mutable **copy** (`lib/game/tuning.ts` exports `tuning` object initialised by `structuredClone` of the constants) which `Vehicle` reads each step. Production behaviour (no `tune=1`) must read the original frozen constants. Add a "Copy as JSON" button.
**Done when:** with `&tune=1` changing `TIRE` grip visibly changes behaviour in a headless autopilot lap time; without it, lap time for seed 847291 is unchanged from baseline (record baseline in the progress log).
**Do not:** use `any`; do not mutate the exported `as const` objects.

## Step 1.5.4 — Headless autopilot regression script
**Goal:** a repeatable check that the stage is completable and physics is stable.
**Files:** `scripts/autopilot.ts` (run with `npx tsx scripts/autopilot.ts`), dev dep `tsx` (runs TS scripts; also needed for the server in phase 3).
**Exact work:** headless: `loadRapier()`, `generateStage(seed)`, build mesh data, create `GameSession`, call `beginCountdown()`, step with a simple pure-pursuit controller steering toward `poseAt(samples, progressS + lookahead)` with throttle by corner radius, until `race.currentPhase === "finished"` or sim time > 600 s. Print: seed, finish time, checkpoints, max speed, max |roll|. Exit code 1 on failure to finish. Run for seeds 1..20.
**Done when:** all 20 seeds finish; record the table in the progress log.

---

# PHASE 2 — Co-driver station (one computer, two roles)

Goal (spec §30): *one computer can simulate the two different roles.* No networking yet.

## Step 2.0 — Role model and solo test mode
**Goal:** a `Role` concept that every later system uses.
**Files:** `lib/game/roles.ts`, `lib/game/store.ts` (add `role: Role`, `soloActiveRole: Role`), `app/page.tsx` (read `role`, `solo`), `components/game/RallyGame.tsx`.
**Exact work:**
1. `lib/game/roles.ts`: `export type Role = "driver" | "codriver"; export const ROLES = ["driver","codriver"] as const;` and `seatOf(role)` returning `{ x: COCKPIT.DRIVER_X | COCKPIT.PASSENGER_X }`.
2. Parse `role` in `page.tsx` via a zod-free narrow function in `lib/game/roles.ts` (`parseRole(raw: string | string[] | undefined): Role | null`), default `"driver"`.
3. Solo mode (`solo=1`): holding **Tab** swaps the active camera/controls role (release returns). `KeyboardControls` gets a new one-shot action `swapRole`, and in solo mode the keyboard must map `driver` controls only when active role is driver. Prevent default on Tab. In non-solo mode, Tab does nothing.
**Done when:** `/?seed=847291&role=codriver&solo=1` loads with passenger camera (step 2.2) and Tab-hold shows driver view; with `role` omitted behaviour is exactly Phase 1.

## Step 2.1 — Pace-note generation (pure, tested)
**Goal:** deterministic pace notes from `StageData`. This is the heart of the co-driver gameplay; build and test it **before** any UI.
**Files:** `lib/game/stage/paceNotes.ts`, `lib/game/stage/paceNotes.test.ts`, `lib/game/constants.ts` (`PACE_NOTES`), `lib/game/stage/types.ts` (types).
**Types (add to `types.ts`):**
```ts
export type PaceCallKind = "corner" | "hairpin" | "straight" | "jump" | "caution" | "finish";
export type PaceModifier = "tightens" | "opens" | "long" | "caution";
export interface PaceNote {
  /** Arc length (m) where the driver should hear this call. */
  atS: number;
  kind: PaceCallKind;
  /** 1 = left, -1 = right; 0 for non-directional calls. */
  direction: 1 | -1 | 0;
  /** 1 (fast) … 4 (tight); 0 when not applicable. */
  severity: 0 | 1 | 2 | 3 | 4;
  modifiers: PaceModifier[];
  /** Metres from this corner's entry to the next note's entry, rounded to PACE_NOTES.DISTANCE_STEP. */
  distanceToNext: number;
  /** Final spoken text, e.g. "Right 3, tightens, 100". */
  text: string;
  /** Index into StageData.corners, or -1. */
  cornerIndex: number;
}
```
**Exact work (algorithm — implement exactly):**
1. **Severity by radius** (constants in `PACE_NOTES.SEVERITY_BANDS`, descending radius): `r ≥ 140 → 1`, `80 ≤ r < 140 → 2`, `40 ≤ r < 80 → 3`, `r < 40 → 4`. Corners with `classId === "hairpin"` get `kind: "hairpin"`, `severity: 0`, text `"Hairpin left"` / `"Hairpin right"`.
2. **Direction** from `CornerInfo.direction` (1 → "Left", −1 → "Right").
3. **Modifiers:** `long` if arc length `radius * angle ≥ PACE_NOTES.LONG_ARC_METRES (80)`. `tightens` if the **next** corner within `PACE_NOTES.LINK_DISTANCE (35 m)` has the same direction and a **higher** severity — then merge: the first corner gets `tightens` and the second is still emitted as its own note. `opens` symmetric (next same-direction corner within link distance with lower severity). `caution` if a corner is `tight`/`hairpin` and the preceding straight is longer than `PACE_NOTES.CAUTION_STRAIGHT_METRES (250)` (fast approach).
4. **Call position:** `atS = corner.startS - PACE_NOTES.CALL_LEAD_METRES` where `CALL_LEAD_METRES = 0`; notes are anchored at corner entry. Sort by `atS`.
5. **Distance:** `distanceToNext = round((nextNote.atS - note.atS) / DISTANCE_STEP) * DISTANCE_STEP`, `DISTANCE_STEP = 10`, minimum 10, **cap the *spoken* value at `PACE_NOTES.MAX_SPOKEN_DISTANCE = 500`** (say "500" or "straight 500"). Distances < `PACE_NOTES.MIN_SPOKEN_DISTANCE (30)` are spoken as `"into"` (e.g. "Right 3 into Left 4").
6. **Text template:** `"{Dir} {sev}{, mods}{, distance|into}"` — always lowercase modifiers; e.g. `"Right 3, tightens, 100"`, `"Hairpin left, 50"`, `"Left 2, long, caution, 200"`. The last note's text ends with `"finish"` instead of a distance and has `kind: "finish"`.
7. A leading note at `atS = startS` of kind `"straight"` with text `"Straight, {distance}"` describing the run from start to the first corner.
8. Jumps are **not** generated yet (no jumps in terrain). Leave `"jump"` in the union but never emit it; do not invent jump terrain in this phase.
**Tests (all required):** determinism; every corner appears exactly once as a corner/hairpin note; `atS` strictly increasing; `distanceToNext` multiple of 10; last note is `finish`; severity bands boundary values (139.99 → 2, 140 → 1, 79.99 → 3, 80 → 2, 39.99 → 4, 40 → 3); `tightens` merge case on a hand-built `StageData`-like fixture.
**Done when:** tests pass for seeds 1..200 and a printed note list for seed 847291 reads like real pace notes (put the printed list in the progress log).
**Do not:** use random numbers in this module (pure function of `StageData`).

## Step 2.2 — Passenger camera and co-driver cockpit side
**Goal:** the co-driver sees a believable passenger seat, dash, window and their hands.
**Files:** `components/game/car/CameraRig.tsx` (generalise eye by role), `components/game/car/Cockpit.tsx`, new `components/game/car/PassengerSide.tsx`, `lib/game/cockpitLayout.ts`, `lib/game/constants.ts` (`CAMERA.PASSENGER_EYE`).
**Exact work:**
1. `CAMERA.PASSENGER_EYE = { x: COCKPIT.PASSENGER_X, y: 0.5, z: -0.28 }` (mirror of `DRIVER_EYE` using the same y/z; add constant, don't recompute inline).
2. `CameraRig` selects the eye from the active role (store `soloActiveRole` in solo mode, `role` otherwise). Mouse-look limits for co-driver: `MAX_YAW` unchanged, but **allow looking down further** (`CAMERA.PASSENGER_MAX_PITCH_DOWN = 75°`) so the tablet on the lap is readable.
3. Co-driver does **not** get head sway cancelled: keep the same sway (felt g-forces matter more for the passenger).
4. In `Cockpit.tsx`, render driver-only parts (steering wheel, gauges, hands on wheel, gear lever, handbrake) always (they are physically in the car and visible from the passenger side), and render `PassengerSide` always. `PassengerSide` contains: passenger dash pad, glovebox (closed box), **wiper switch (step 2.5)**, tablet mount (step 2.3), co-driver's hands (reuse the glove/forearm primitives from `Levers.tsx`/`SteeringWheel.tsx`; hands rest on lap at `COCKPIT.PASSENGER_HANDS.REST`, new layout constants).
5. Hands follow the interaction system (step 2.4): when interacting, the active hand glove moves to the interact point with a damped spring (`INTERACTION.HAND_RESPONSE`).
**Done when:** screenshot from `?role=codriver&solo=1` shows passenger dash, tablet mount, own hands, side window, the driver silhouette (wheel). No z-fighting between window and door.
**Do not:** add textures; stay low-poly flat-shaded colours from `PALETTE` (add new palette keys as needed).

## Step 2.3 — Navigation tablet (physical object + live map)
**Goal:** a physical-looking tablet showing a readable rally map and the next calls.
**Files:** `components/game/car/Tablet.tsx`, `lib/game/map/mapRenderer.ts`, `lib/game/map/mapRenderer.test.ts` (pure geometry only), `lib/game/constants.ts` (`TABLET`), `lib/game/cockpitLayout.ts`.
**Exact work:**
1. **Texture:** an offscreen `HTMLCanvasElement` (`TABLET.CANVAS_SIZE = { width: 1024, height: 640 }`) drawn with the 2D API, wrapped in a `THREE.CanvasTexture`, `colorSpace = SRGBColorSpace`, `needsUpdate = true` only when content changes (**redraw at ≤ `TABLET.REDRAW_HZ = 10`**; never every frame).
2. **Map content (spec §5.1, §25 "intentionally readable"):**
   - Road polyline of the whole stage fitted into the map viewport with margin `TABLET.MAP_MARGIN`; thick line (`TABLET.ROAD_LINE_WIDTH`), start marker (green), finish marker (checker), checkpoints (small ticks), **car marker (arrow) at current position and heading** (progress from `RoadIndex` projection of the interpolated car pose — compute in the redraw tick, not per frame).
   - Direction arrows along the road every `TABLET.ARROW_SPACING_METRES = 150`.
   - Corner severity numbers drawn at each corner apex, coloured by severity (use `PALETTE`/new tokens, **not** only colour: also show the digit, shapes help colour-blind players), hairpins drawn as a distinct ⟲/⟳ glyph drawn with paths (no emoji fonts).
   - Distance ticks every `TABLET.DISTANCE_TICK_METRES = 500` labelled in km text.
3. **Zoom/pan (physical):** two tablet modes toggled by tapping a mounted button on the tablet bezel: `OVERVIEW` (whole stage) and `NEXT` (a window of the next `TABLET.NEXT_WINDOW_METRES = 600` m rotated so the road ahead points up). Default `NEXT`. Tapping uses the interaction system (step 2.4); button is a 3D box on the bezel, not DOM.
4. **Pace-note panel** (bottom strip of the canvas): `NEXT:` current note text large, `THEN:` the following note smaller, and `DISTANCE:` metres until `atS` of the current note (from progress). Source: `paceNotes(stage)` computed once per stage (`useMemo`).
5. **Legend** (always visible, small): `1 fast · 2 · 3 · 4 tight · ⟲ hairpin` (draw glyphs with canvas paths).
6. **Physical object:** rounded-box tablet body (use `RoundedBox` from drei **only if it is already a dependency** — it is: `@react-three/drei`), slight tilt toward the passenger, mount arm to the dash. Screen is an emissive `MeshBasicMaterial` with the canvas texture (`toneMapped: false`).
7. **Co-driver must be able to read it from the passenger camera pose without moving the mouse much.** Verify by a screenshot at default look direction; the NEXT strip text must be legible at 1280×720.
**Pure-geometry tests:** the world→map transform (`fitRoadToViewport(samples, viewport, margin)`) returns points all inside the viewport; rotation for `NEXT` mode puts the point `windowMetres` ahead above the car marker.
**Done when:** screenshot shows a readable map, car marker, next-call text; unit tests pass.
**Do not:** use DOM overlays for the tablet; use `drei` `<Html>`; call `canvas.toDataURL` per frame.

## Step 2.4 — Interaction system (reusable, physical)
**Goal:** one generic way to touch things in the world: look at an object, press/drag with the mouse. **Everything physical in later phases uses this.**
**Files:** `lib/game/interaction/interactionSystem.ts`, `lib/game/interaction/interactionSystem.test.ts` (logic only), `components/game/interaction/InteractionDriver.tsx`, `components/game/interaction/Interactable.tsx`, `components/game/hud/Crosshair.tsx`, `lib/game/input/mouseLook.ts` (add hooks), `lib/game/constants.ts` (`INTERACTION`).
**Design (implement exactly):**
```ts
export type InteractionKind = "press" | "toggle" | "drag" | "hold";
export interface InteractableSpec {
  id: string;                       // unique, stable, used in net messages later
  kind: InteractionKind;
  /** Roles allowed to use it. */
  roles: readonly Role[];
  /** Enabled predicate evaluated each hit-test (cheap, no allocation). */
  isEnabled: () => boolean;
  /** Label shown near the crosshair when looked at, e.g. "Wipers". */
  label: string;
  /** Meshes (or groups) to raycast against. */
  getObjects: () => readonly Object3D[];
  onPress?: () => void;
  onRelease?: () => void;
  /** Drag: delta in screen pixels since last frame, plus accumulated. */
  onDrag?: (dx: number, dy: number, totalDx: number, totalDy: number) => void;
  /** Hold: called each frame while held with seconds held. */
  onHold?: (seconds: number) => void;
}
```
1. `InteractionSystem` class holds a `Map<string, InteractableSpec>`, a `Raycaster` (`far = INTERACTION.REACH_METRES = 1.6`), registers/unregisters, and each frame casts a ray from the **camera centre** (NDC `(0,0)`, because the pointer is locked) against the *enabled, role-allowed* interactables; picks the nearest hit; exposes `hovered: InteractableSpec | null`.
2. **Input:** mouse button 0 down/up and **E** both act as "primary" (so the spec's "E interact" and "mouse" both work). Mouse button down on a `drag`/`hold`/`press`/`toggle` target starts it. While a `drag` is active, **mouse look is suspended** (new `MouseLook.setSuspended(boolean)` + `MouseLook.consumeDelta(): {dx, dy}` returning raw `movementX/Y` accumulated since last call). Releasing ends the drag.
3. `InteractionDriver` is an R3F component with `useFrame(..., 0)` (priority 0 → after camera); it updates the system and publishes `hoveredLabel` to the store at ≤ 20 Hz (only when it changes).
4. `Interactable.tsx`: a declarative wrapper: `<Interactable spec={...}>{children}</Interactable>` registers `getObjects: () => [groupRef.current]` on mount, unregisters on unmount.
5. `Crosshair.tsx`: DOM crosshair (Tailwind), grows and shows `label` when `hoveredLabel` is non-null.
6. Hands: system publishes the world-space hit point; `PassengerSide`/driver hand rigs read it to move the active glove (damped).
**Tests:** a pure `pickNearest(hits, specs, role)` helper returns the nearest enabled, role-allowed interactable; disabled and wrong-role ones are skipped.
**Done when:** a placeholder `Interactable` cube toggles colour when pressed by mouse or E, label appears, drag suspends mouse look.
**Do not:** use R3F's built-in pointer events (they don't work under pointer lock); do not allocate objects per frame (reuse `Vector2`, arrays).

## Step 2.5 — Wiper switch, rain, windshield visibility
**Goal:** spec §6.1 end-to-end on one computer.
**Files:** `lib/game/weather/weather.ts` (+ `.test.ts`), `components/game/car/WiperSwitch.tsx`, `components/game/car/Wipers.tsx` (the physical wiper blades), `components/game/car/WindshieldGlass.tsx`, `components/game/scene/Rain.tsx`, `lib/game/constants.ts` (`WEATHER`, `WIPERS`), `lib/game/store.ts`.
**Pure model (`weather.ts`) — implement exactly, it will be reused unchanged by the server:**
```ts
export type WeatherKind = "clear" | "rain";   // fog/snow are future; keep union extensible
export interface WeatherState { kind: WeatherKind; intensity: number /* 0..1 */; }
export interface WindshieldState { dirt: number /* 0 clear .. 1 opaque */; }
/** dirt' = clamp(dirt + rainRate - wipeRate, 0, 1) integrated over dt. */
export function stepWindshield(w: WindshieldState, weather: WeatherState, wipersOn: boolean, speedMs: number, dt: number): WindshieldState
export function visibility(w: WindshieldState): number  // 1 - smoothstep(WEATHER.DIRT_VISIBLE_START, 1, dirt)
```
Constants: `WEATHER.DIRT_RATE_PER_SECOND_AT_FULL_INTENSITY = 0.045` (≈22 s from clear to opaque), `WEATHER.SPEED_DIRT_BONUS_PER_MS = 0.0006` (faster ⇒ more drops), `WIPERS.WIPE_RATE_PER_SECOND = 0.35`, `WEATHER.DIRT_VISIBLE_START = 0.2`, `WEATHER.MIN_VISIBILITY = 0.08` (never fully black).
**Rain trigger (stage 1 tutorial = daylight, none):** weather is chosen per stage by a `StageData`-independent `weatherPlan(seed, stageIndex)` using `deriveSeed(seed, SEED_SALTS.WEATHER)`: stage 0 ⇒ `clear` always (spec §12); later stages (future) rain starts at a seeded time. For testing add URL param `&rain=1` forcing rain from t = 10 s. **Wiper tutorial prompt** shows only for the co-driver HUD: none — the *driver* shouts (voice). No text hint to the co-driver other than the driver's voice; but a small windshield-dirt effect is visible from both seats (both look through the same glass).
**Physical switch (`WiperSwitch.tsx`):** a stalk/rocker on the passenger-side dash (position in `COCKPIT.WIPER_SWITCH`, new layout constant, within `INTERACTION.REACH_METRES` of the passenger eye, **outside the driver's reach** — spec says co-driver finds it). `Interactable` kind `toggle`, roles `["codriver"]` (in solo mode role = active role). Animated rotation with damping. **Must be physically findable but not obvious: label appears only when looked at.**
**Visuals:** `Rain.tsx`: `THREE.Points` (≤ `WEATHER.MAX_RAIN_PARTICLES = 1500`) around the car, falling, wrapped around the camera box; opacity by intensity; fog colour/near/far lerp toward grey with intensity. `WindshieldGlass.tsx`: the existing glass plane gets a `MeshPhysicalMaterial` replaced by a custom `ShaderMaterial` (or `onBeforeCompile` patch on `MeshStandardMaterial`) that adds a droplet noise mask scaled by `dirt` and blurs/darkens the background by `1 - visibility`. Wipers (`Wipers.tsx`): two blades rotating on pivots with a sweep angle (`WIPERS.SWEEP_ANGLE`) driven by a phase that advances only while `wipersOn`; when a blade passes, dirt is reduced by the model (`stepWindshield`), visuals just decorate.
**HUD:** a thin `VISIBILITY` bar for debugging only when `&debug=1`.
**Done when:** with `&rain=1&solo=1`, driver view gets progressively harder to see through in ~20 s; Tab-hold to co-driver, press the switch, blades sweep, visibility recovers in ~3 s; unit tests for `stepWindshield` (monotonic, bounded, wipers reduce) pass.
**Do not:** make dirt depend on frame rate (always use `dt`), put `window` in `weather.ts`.

## Step 2.6 — Phase 2 acceptance
Manual script (human): open `?seed=847291&solo=1&rain=1`, drive, Tab-hold to co-driver, read the note off the tablet aloud, toggle wipers, Tab back. Record anything that felt wrong in `## Open questions`. Automated: all gates, plus tests for `paceNotes`, `weather`, `interactionSystem`, `mapRenderer`.

---

# PHASE 3 — Multiplayer rooms, teams, roles, synchronisation, leaderboard

Goal (spec §30, §22): *multiple teams race in the same web room.* The car mechanics (fuel/engine/etc.) come in phase 4; here the server gets the authoritative **race, team and pose** layer.

**New dependencies (all justified):**
- `express` — HTTP server for health check + Socket.IO host (user stack).
- `socket.io` — server transport/rooms/acks (D2).
- `socket.io-client` — browser client.
- `zod` — runtime validation of **every** inbound message (no `any`, no trusting clients).
- dev: `tsx` (already from 1.5.4), `@types/express`, `concurrently` (run Next + server together in one `npm run dev:all`).
- `cors` — **not added**: configure CORS through Socket.IO's own `cors` option.

## Step 3.1 — Server skeleton
**Files:** `server/index.ts`, `server/env.ts`, `server/tsconfig.json`, `server/health.ts`, `.env.example`, `package.json` scripts.
**Exact work:**
1. `server/tsconfig.json`: `extends` root, `module: "NodeNext"`/`moduleResolution: "NodeNext"` as required for tsx, `paths: { "@/*": ["../*"] }`, `include: ["./**/*.ts", "../lib/**/*.ts"]`, `noEmit: true`. The server must be able to import `../lib/game/stage/generateStage`, `../lib/game/stage/roadIndex`, `../lib/game/stage/paceNotes`, `../lib/game/weather/weather`, `../lib/game/random`, `../lib/game/constants`. **First verify these modules import no DOM/React/three-rendering code** (`grep -R "window\|document\|react" lib/game/stage lib/game/weather lib/game/random.ts lib/game/constants.ts lib/game/math.ts`). `three` itself is allowed (only `Vector3/Quaternion` maths are used by `session.ts`; the server must **not** import `session.ts` or `physics/**` in this phase).
2. `server/env.ts`: zod-parse `process.env`: `PORT` (default 4000), `CLIENT_ORIGIN` (default `http://localhost:3000`), `NODE_ENV`. Export a frozen `env`.
3. `server/index.ts`: Express app, `GET /health → { ok: true }`, `http.createServer`, `new Server(httpServer, { cors: { origin: env.CLIENT_ORIGIN } })`, graceful shutdown on SIGINT/SIGTERM.
4. Scripts: `"server": "tsx watch server/index.ts"`, `"dev:all": "concurrently -n web,server \"npm:dev\" \"npm:server\""`.
5. `.env.example` with every variable; client env `NEXT_PUBLIC_SERVER_URL=http://localhost:4000`.
**Done when:** `npm run dev:all` starts both; `curl localhost:4000/health` returns `{"ok":true}`; server tsc passes.

## Step 3.2 — Protocol (single source of truth)
**Files:** `lib/net/protocol.ts`, `lib/net/netConstants.ts`, `lib/net/protocol.test.ts`.
**Rules:** every message has a zod schema; TS types are `z.infer`'d from them. Client→server messages are **intents/inputs**, never state. Every client→server event uses a Socket.IO **ack** returning `{ ok: true, ... } | { ok: false, error: ErrorCode }`.
```ts
// netConstants.ts (named constants — no magic numbers)
export const NET = {
  ROOM_CODE_LENGTH: 6,
  ROOM_CODE_ALPHABET: "ABCDEFGHJKMNPQRSTUVWXYZ23456789", // no 0/O/1/I/L
  MAX_TEAMS_DEFAULT: 6, MAX_TEAMS_LIMIT: 12,
  PLAYER_NAME_MAX: 20,
  SNAPSHOT_HZ: 20, POSE_HZ: 20,
  INTERPOLATION_DELAY_MS: 100,
  COUNTDOWN_SECONDS: 5,
  RESULTS_TIMEOUT_AFTER_FIRST_FINISH_S: 120,
  RECONNECT_GRACE_S: 30,
  PING_SAMPLES: 8,
} as const;
```
**Events (names are exact; implement all schemas in `protocol.ts`):**

| Direction | Event | Payload | Ack |
|---|---|---|---|
| C→S | `room:create` | `{ name, maxTeams? }` | `{ roomCode, playerId, resumeToken }` |
| C→S | `room:join` | `{ roomCode, name }` | `{ playerId, resumeToken, room: RoomView }` |
| C→S | `room:resume` | `{ roomCode, playerId, resumeToken }` | `{ room: RoomView }` |
| C→S | `team:create` | `{}` | `{ teamId }` |
| C→S | `team:join` | `{ teamId, role }` | `{}` (fails if role/team full) |
| C→S | `team:leave` | `{}` | `{}` |
| C→S | `player:ready` | `{ ready: boolean }` | `{}` |
| C→S | `room:start` | `{}` (host only) | `{}` |
| C→S | `car:pose` | `PoseReport` (driver only, 20 Hz, **no ack**, volatile) | — |
| C→S | `car:inputs` | `{ throttle01, brake01, steer, handbrake, rpm }` (driver only, 20 Hz, volatile) | — |
| C→S | `codriver:wipers` | `{ on: boolean }` | `{}` |
| C→S | `clock:ping` | `{ t0 }` | `{ t0, serverNow }` |
| S→C | `room:state` | `RoomView` (lobby/ready/results changes only; not per frame) | — |
| S→C | `race:countdown` | `{ goAtServerMs }` | — |
| S→C | `race:snapshot` | `WorldSnapshot` (20 Hz, volatile) | — |
| S→C | `race:event` | `{ teamId, kind, atServerMs, data }` (checkpoint, penalty, dnf, finish, weather…) | — |
| S→C | `race:results` | `RoomResults` | — |

Core types (put in `protocol.ts`):
```ts
type RoomPhase = "lobby" | "ready" | "countdown" | "racing" | "pit_stop" | "finished" | "results"; // spec §25 state machine
interface RoomView { code: string; hostId: string; phase: RoomPhase; seed: number; stageIndex: number; maxTeams: number;
  teams: { id: string; name: string; driver: PlayerView | null; codriver: PlayerView | null }[];
  players: PlayerView[] }  // players without a team seat appear in "spectators/unassigned"
interface PlayerView { id: string; name: string; ready: boolean; connected: boolean; role: Role | null; teamId: string | null }
interface PoseReport { seq: number; clientTimeMs: number; p: [number, number, number]; q: [number, number, number, number];
  v: [number, number, number]; steer: number; wheelSpin: number; susp: [number, number, number, number] }
interface TeamSnapshot { teamId: string; seq: number; p: [...]; q: [...]; v: [...]; steer: number; wheelSpin: number;
  // phase-4 fields reserved but optional now:
  fuel?: number; engineHealth?: number; temperature?: number; damage?: number; wipers: boolean; visibility: number;
  checkpoint: number; progress01: number; status: "racing" | "pit" | "disabled" | "dnf" | "finished" }
interface WorldSnapshot { serverNowMs: number; raceElapsedMs: number; weather: WeatherState; teams: TeamSnapshot[] }
```
Use quantised, small numbers; send positions as `number[]` (Socket.IO JSON). Do not send per-frame data that did not change (spec §24); `race:snapshot` carries only active teams.
**Done when:** schemas have round-trip tests (valid passes, extra/invalid fields rejected, NaN/Infinity rejected via `z.number().finite()`, strings length-bounded, arrays fixed length).

## Step 3.3 — Room manager (pure state machine, tested)
**Files:** `server/rooms/roomManager.ts`, `server/rooms/room.ts`, `server/rooms/roomCode.ts`, `server/rooms/*.test.ts`.
**Rules (implement as pure, injectable-clock classes so they're unit-testable without sockets):**
1. `roomCode`: crypto-random (`node:crypto` `randomInt`) from `NET.ROOM_CODE_ALPHABET`, length `NET.ROOM_CODE_LENGTH`; retry on collision.
2. Create room ⇒ creator is host and a player; `seed = randomSeed()` (client may later send a chosen seed only if host and room is in `lobby`; not in this step).
3. Teams: max `maxTeams`; a team has exactly one `driver` seat and one `codriver` seat; a player occupies at most one seat; `team:join` with a taken role ⇒ `{ ok:false, error:"role_taken" }`.
4. Phases (spec §25): `lobby` → (all seated players `ready` and ≥ 1 team **fully seated**) → `ready` → host `room:start` → `countdown` → `racing` → (team-level `pit_stop` is per team, the room stays `racing`) → `finished` (all teams finished/DNF) → `results`. **Only fully seated teams race.** Unseated players spectate.
5. Names: trim, strip control chars, 1–`NET.PLAYER_NAME_MAX`, HTML is never rendered raw on the client (React escapes; do not use `dangerouslySetInnerHTML`).
6. Disconnect: mark `connected=false`; keep seat for `NET.RECONNECT_GRACE_S`; `room:resume` with `resumeToken` (random 128-bit hex, stored hashed with `crypto.createHash("sha256")`) restores. If the **driver** is gone for > grace during `racing`, the team is `dnf` with reason `"driver_left"`. Rooms with zero connected players for 10 min are deleted (injectable clock; test it).
7. Rate limiting: per-socket token bucket per event type (`NET.RATE_LIMITS`) — drop (don't crash) excess; `car:pose` max 30/s.
**Tests:** seat rules, readiness gating, phase transitions, reconnect, empty-room cleanup, room code uniqueness/alphabet.
**Done when:** `npm test` passes these.

## Step 3.4 — Socket gateway
**Files:** `server/net/gateway.ts`, `server/net/validate.ts`.
**Exact work:** register handlers; every handler: (1) zod `safeParse` payload → on failure ack `{ok:false,error:"bad_request"}`; (2) look up player by `socket.data.playerId`; (3) authorise (role, host, phase); (4) call `RoomManager`; (5) ack; (6) broadcast `room:state` to `socket.to(roomCode)`. Join the Socket.IO room named by the room code. Volatile emits for snapshots (`socket.volatile.emit`). Never throw out of a handler (wrap, log with `console.error` including event name but **never payload contents with tokens**).
**Done when:** a scripted two-client integration test (`server/net/gateway.test.ts` using `socket.io-client` against an ephemeral port) can create, join, seat, ready, start.

## Step 3.5 — Client networking layer
**Files:** `lib/net/client.ts`, `lib/net/useRoom.ts`, `lib/net/clockSync.ts`, `lib/net/snapshotBuffer.ts` (+ tests for `clockSync` and `snapshotBuffer`), `lib/game/store.ts` (net slice).
**Exact work:**
1. `client.ts`: one `io(NEXT_PUBLIC_SERVER_URL, { autoConnect: false, transports: ["websocket"] })`; typed event map from `protocol.ts`; helper `request<E>(event, payload): Promise<Ack>` with a timeout (`NET.ACK_TIMEOUT_MS = 5000`). Persist `{roomCode, playerId, resumeToken}` in `sessionStorage` (try/catch) for auto-resume after refresh.
2. `clockSync.ts`: send `clock:ping` `NET.PING_SAMPLES` times at start then every 10 s; offset = median of `(serverNow - (t0 + rtt/2))` over lowest-RTT half of samples. Export `serverNowMs()`.
3. `snapshotBuffer.ts`: per-team ring buffer (≤ 1 s) of `TeamSnapshot`; `sample(teamId, renderTimeMs)` returns an interpolated pose using `renderTimeMs = serverNowMs() - NET.INTERPOLATION_DELAY_MS` (lerp positions, slerp quaternions, clamp extrapolation to 250 ms using velocity).
4. `useRoom.ts`: React hook exposing `room`, `me`, actions (`createRoom`, `joinRoom`, `createTeam`, `joinTeam`, `setReady`, `startRace`), connection status.
**Done when:** unit tests for median/offset and for interpolation midpoint/extrapolation clamp pass.

## Step 3.6 — Lobby UI
**Files:** `app/page.tsx` (menu: **CREATE RALLY** / **JOIN RALLY**), `app/rally/[code]/page.tsx` (lobby + game switch), `components/lobby/*` (`MainMenu`, `JoinForm`, `TeamList`, `TeamCard`, `RoleButton`, `ReadyButton`, `ShareCode`), Tailwind with the existing `@theme` tokens (extend tokens, don't hardcode colours).
**Flow (spec §13, §14):** menu → create (enter name) → room code shown with Copy → players join with code → teams appear; each player clicks a role slot to take it; **host not forced to drive**; ready toggles; host `START RALLY` enabled when all seated players ready and ≥ 1 full team. Countdown overlay uses server-synced time.
**Accessibility:** all controls are real `<button>`/`<input>` with labels; focus order sensible; room code uses `aria-live="polite"` for updates; no motion-only feedback.
**The old Phase-1 single-player route stays available at `/?seed=…`** (it must keep working untouched; it's the solo/dev mode).
**Done when:** two browser tabs can create/join/seat/ready/start (verify with the claude-in-chrome tools or two Playwright pages if available; otherwise unit-test the hook and document manual steps).

## Step 3.7 — Wire the race to the server
**Files:** `components/game/RallyGame.tsx` (accept `mode: "solo" | "online"`), `lib/net/useNetRace.ts`, `components/game/scene/GhostCars.tsx`, `components/game/scene/NetDriver.tsx`, `server/race/raceController.ts` (+ tests), `server/race/poseValidator.ts` (+ tests).
**Server race controller (authoritative):**
1. On `room:start`: build `stage = generateStage(room.seed)`, a `RoadIndex`, per-team `TeamRaceState { raceStartMs, nextCheckpoint, splits, penaltySeconds, pitSeconds, status, lastPose, progressS, distanceOffRoad }`. Emit `race:countdown { goAtServerMs: now + NET.COUNTDOWN_SECONDS*1000 }`. All teams go at the same instant. Room phase → `countdown` → `racing`.
2. 20 Hz tick (`setInterval`, drift-corrected using `performance.now()`): build `WorldSnapshot` from the **latest validated pose per team**, send `race:snapshot` to the room (volatile).
3. **Pose validation (`poseValidator.ts`, pure, tested):** reject (ignore and increment a violation counter) when: any component non-finite; `|v| > NET.MAX_SPEED_MS (70)`; displacement since last accepted pose > `|v_prev| * dt + NET.POSE_SLACK_METRES (6)`; `seq` not strictly increasing; or `RoadIndex.project()` says the car is farther than `NET.MAX_OFF_ROAD_METRES (80)` from the road. After `NET.MAX_VIOLATIONS_PER_10S = 25` violations the team is flagged `suspicious` in server logs (no auto-kick in MVP). **Progress** is computed **server-side** from the validated position via `RoadIndex`, with the same ordered-checkpoint logic as `RaceTracker` (extract the pure arc-length checkpoint logic into `lib/game/race/checkpointLogic.ts` shared by `RaceTracker` and the server; add tests; **do not change `RaceTracker` behaviour**, only refactor internals; the Phase-1 autopilot script must give identical times after the refactor).
4. Finish when the server-computed progress passes `stage.finishS` after all checkpoints; record `rawMs = now - goAtServerMs - pitMs`.
5. Server emits `race:event` for checkpoint (split), finish, dnf.
**Client:**
- Driver client: runs `GameSession` exactly as in Phase 1 but (a) the **race clock shown comes from the server** (`WorldSnapshot.raceElapsedMs`), (b) car starts held until `goAtServerMs` (map to the existing `RaceTracker` countdown by setting phase from the server event — add `RaceTracker.beginCountdownAt(serverMs)`; keep `beginCountdown()`), (c) sends `car:pose` and `car:inputs` at `NET.POSE_HZ` from `NetDriver` (a `useFrame` accumulator, not `setInterval`).
- Co-driver client: **does not run physics**. It renders the cockpit with the car pose taken from the interpolated `snapshotBuffer` for its own team (so the world scrolls past the window), and renders the tablet using the progress from snapshots. It never creates a Rapier world (skip the WASM load for co-driver — saves startup time).
- `GhostCars.tsx`: renders other teams' cars (Kenney hatchback, each with a distinct body colour from a palette array `PALETTE.TEAM_COLORS`) at interpolated poses; name tag via drei `Billboard` + `Text`? **Do not add text rendering dependencies**; use a small canvas-texture label sprite (reuse the tablet canvas helper).
- Wiper toggle in online mode sends `codriver:wipers`; the server owns `wipers` and echoes it in snapshots; the **visual switch position and wiper blades follow the snapshot value**, not the local click (optimistic update allowed, reconcile on next snapshot).
**Done when:** two tabs (driver + co-driver) of one team plus two tabs of a second team complete a seed together; both teams finish with server-authoritative times; a deliberately forged pose (teleport 500 m) is rejected in the validator test.

## Step 3.8 — Results and leaderboard
**Files:** `server/race/results.ts` (+ tests), `components/results/RoomResults.tsx`, `components/results/TeamResultCard.tsx`.
**Exact work:** on finish/DNF compute `TeamResult { teamId, name, status: "finished"|"dnf", dnfReason?, rawMs, penaltyMs, pitMs, totalMs, damage01, fuel01, navErrors, crashes }` (D9: `total = raw + penalty + pit`). DNF teams sort below all finishers, by progress descending. Send each team its own result immediately (`race:event kind:"team_result"`); broadcast `race:results` (full ranking) per D8. Format with `formatStageTime` extended to `mm:ss.cc` + `+mm:ss.cc` for penalties (add `formatPenalty` with tests).
**Done when:** the spec §20 example numbers (08:42.31 / +00:18.00 / 00:42.15 → 09:42.46) are a unit test.

## Step 3.9 — Phase 3 acceptance
Gates + manual: two teams race. Document in the progress log the **known upgrade path**: if cheating becomes a concern, port `GameSession` to the server (Rapier runs under Node via `@dimforge/rapier3d-compat`; `session.ts` imports only `three` math) and make clients send inputs only — do **not** build this now.

---

# PHASE 4 — Cooperative mechanics: fuel, engine, damage, repairs, pit stops, navigation penalties

Goal (spec §4, §7, §8, §9, §10, §19): both players must actively cooperate to finish. **Everything here is server-authoritative state with physical client interactions through the step-2.4 interaction system.**

## Step 4.0 — Vehicle mechanical model (pure, shared, tested)
**Files:** `lib/game/vehicle/mechanics.ts`, `lib/game/vehicle/mechanics.test.ts`, `lib/game/constants.ts` (`MECHANICS`).
**State:**
```ts
export interface MechanicalState { fuel01: number; engineHealth01: number; temperature01: number; damage01: number; tireWear01: number;
  engineStatus: "ok" | "overheating" | "failed"; brokenPart: BrokenPart | null; }
export type BrokenPart = "radiator_hose" | "spark_plug" | "drive_belt";
export interface MechanicalInputs { throttle01: number; rpm01: number; speedMs: number; surface: SurfaceKind | null; impactImpulse: number; ambientTemp01: number; hoodOpen: boolean; dt: number; }
export function stepMechanics(s: MechanicalState, i: MechanicalInputs): MechanicalState   // pure, no randomness
export function powerFactor(s: MechanicalState): number   // 1 normal; <1 when overheating/damaged; 0 when failed
```
**Rules (constants in `MECHANICS`; implement exactly):**
- **Fuel:** `fuel' = fuel - dt * (FUEL_IDLE + FUEL_PER_LOAD * throttle01 * rpm01) / TANK_CAPACITY_UNITS`. Tuned so a full tank covers `FUEL_RANGE_MULTIPLIER (1.35) ×` the longest allowed stage when driven at moderate load (document the calc in a comment). Fuel 0 ⇒ `powerFactor = 0` ("out of fuel", not an engine failure).
- **Temperature:** `T' = T + dt * (HEAT_PER_LOAD * throttle01 * rpm01 + HEAT_DAMAGE * damage01 - COOL_BASE - COOL_PER_SPEED * speedMs/MAX_SPEED_MS - (hoodOpen ? COOL_HOOD_OPEN : 0) - COOL_PER_AMBIENT*(1-ambient))`, clamped 0..1. `T ≥ OVERHEAT_WARN (0.85)` ⇒ `overheating`; `T ≥ OVERHEAT_FAIL (1.0)` held for `OVERHEAT_FAIL_SECONDS (6)` ⇒ `failed` with `brokenPart = "radiator_hose"`.
- **Engine health:** decreases at `HEALTH_LOSS_OVERHEAT_PER_S` while `overheating`; and by impacts. `engineHealth ≤ 0` ⇒ `failed`.
- **Damage:** `damage' = damage + clamp(impactImpulse - IMPACT_FREE_THRESHOLD, 0, ∞) * DAMAGE_PER_IMPULSE`. Crash ≥ `CRASH_IMPULSE (large)` counts as a **crash** (increments `crashes`, +`PENALTY.CRASH_SECONDS`, and with probability `P_BREAK_ON_CRASH` seeded by `deriveSeed(stage.seed, SEED_SALTS.FAILURES) ⊕ eventIndex` picks `brokenPart` and sets `failed`). All randomness for failures **must** use the seeded stream so a replay of the same seed + same inputs is identical.
- **`powerFactor`:** `1` ok; linearly to `OVERHEAT_POWER_FLOOR (0.55)` between warn and fail; `0` failed/out of fuel. The **driver client** multiplies engine torque by `powerFactor` (add a `powerFactor` field to `DriverControls`, default 1, applied in `Drivetrain`; the Phase-1 behaviour with `powerFactor = 1` must be bit-identical — covered by the autopilot regression).
**Tests:** monotonic fuel burn; overheating reaches fail only after the hold time; hood-open cools faster; `powerFactor` boundaries; seeded failure choice deterministic.

## Step 4.1 — Server integrates mechanics + penalty ledger
**Files:** `server/race/teamMechanics.ts`, `server/race/penalties.ts` (+ tests), `lib/net/protocol.ts` (add events).
**Events added:** C→S `car:impact { impulse }` (driver, rate-limited, clamped to `NET.MAX_IMPACT_IMPULSE`); S→C `mech:state` is part of `TeamSnapshot` (`fuel`, `engineHealth`, `temperature`, `damage`, `status`, `engineStatus`) — **already reserved in step 3.2**.
**Penalty ledger (spec §10), in `lib/game/race/penalties.ts` constants:** `SMALL_MISTAKE_SECONDS = 2`, `NAV_MISTAKE_SECONDS = { min: 5, max: 15 }` (scale by how much time/progress was lost off-road: `5 + 10 * clamp(offRoadSeconds / 8, 0, 1)`), `CRASH_SECONDS = 4`, `IGNORED_ENGINE_WARNING` ⇒ engine failure (no extra penalty, the stopped time is the penalty). Navigation mistake detection (server): car leaves the road corridor (`> ROAD.WIDTH/2 + ROAD.SHOULDER_WIDTH` from the centreline) for more than `NAV_OFFROAD_GRACE_S = 2` while a corner exists within `NAV_CORNER_LOOKAHEAD_M` ⇒ `navError++` and penalty once per `NAV_COOLDOWN_S = 20`. Cone/barrier hits: small mistake each, once per object (client reports `car:impact` with a coarse category `{ kind: "cone" | "solid", impulse }`).
**DNF (spec §10):** `engineStatus === "failed"` **and** no repair progress for `DNF_AFTER_FAILED_SECONDS = 180`, or `damage01 ≥ 1`, or the driver is gone ⇒ `DNF`.
**Done when:** unit tests simulate a scripted team: overheating warning → failure → DNF path and a clean path; penalties sum into `totalMs` per D9.

## Step 4.2 — Driver HUD and dashboard instruments
**Files:** `components/game/car/Gauges.tsx` (add temperature + fuel gauges and warning lamps), `components/game/hud/*`.
**Exact work:** gauges read mechanical values from the store (published ≤ 20 Hz). Spec §16 minimal HUD: `SPEED`, `ENGINE`, `DAMAGE`, `FUEL` bars (small, bottom-left, DOM, tokens `hud-*`). Dashboard warning lamps: `OVERHEAT` (amber ≥ warn, red blinking ≥ fail) and `ENGINE` red; add a **buzzer sound** hook (step 6.x) via an event bus (`lib/game/events.ts`, tiny typed emitter, no dependency).
**Done when:** forcing `?debug=1&overheat=1` makes temp climb and lamps fire.

## Step 4.3 — On-foot controller (leave the car, walk around it)
**Goal:** spec §22 "Exit vehicle / Walk around vehicle" (driver) and pit-stop work (both roles).
**Files:** `lib/game/onfoot/onFootController.ts` (+ tests of the pure movement helpers), `components/game/onfoot/OnFootRig.tsx`, `components/game/onfoot/PlayerBodies.tsx` (what *others* see), `lib/game/constants.ts` (`ON_FOOT`), `lib/net/protocol.ts`.
**Rules:**
1. **Exit conditions** (server-validated): the car's speed `< ON_FOOT.EXIT_MAX_SPEED_MS = 0.6` **and** pressing **F** (new one-shot action `toggleSeat`). Room/team state `occupancy: { driver: "seat" | "foot", codriver: "seat" | "foot" }`. While the **driver is out**, `powerFactor` forced to 0 and the handbrake is applied by the client (`DriverControls.handbrake = true`).
2. **Movement:** Rapier `KinematicCharacterController` on a capsule (`ON_FOOT.CAPSULE_RADIUS/HALF_HEIGHT`), WASD, **Shift** sprint (`ON_FOOT.SPRINT_MULTIPLIER`), gravity, step height `ON_FOOT.STEP_HEIGHT`; collides with ground, car chassis (solid), trees. Camera at eye height `ON_FOOT.EYE_HEIGHT` with the same `MouseLook` (full 360° yaw, ±85° pitch for on-foot: add `ON_FOOT.MAX_YAW = Math.PI`, unlimited wrap).
3. **Who simulates:** each client simulates **its own** on-foot player locally (driver client already has Rapier; the **co-driver client now also needs a minimal Rapier world** only while on foot — load WASM lazily at first exit; the world contains terrain + the car as a **kinematic** body following snapshots).
4. **Sync:** `foot:pose { seq, p, yaw }` volatile at `NET.POSE_HZ` while on foot (server validates: speed ≤ `ON_FOOT.MAX_SPEED_MS * 1.5`, within `ON_FOOT.MAX_DISTANCE_FROM_CAR_M = 60`). Snapshots carry `onFoot: { teamId, role, p, yaw }[]` for rendering teammates and other teams' people as simple low-poly characters (capsule body + head, flat colours from `PALETTE.TEAM_COLORS`; no new assets).
5. **Re-enter:** within `ON_FOOT.ENTER_RADIUS_M = 2.2` of the correct door, press **F** (server validates distance). Camera blends to the seat eye position over `ON_FOOT.ENTER_BLEND_S`.
**Done when:** headless/script test of the pure movement helpers (slope, step height) passes; manual: driver stops, exits, walks around the car, re-enters; the co-driver sees the driver outside the window (ghost body).

## Step 4.4 — Hood, engine bay, and the repair mini-game (driver)
**Goal:** spec §4.2, §19 "OPEN HOOD → GRAB TOOL → REMOVE COMPONENT → REPLACE → RESTART".
**Files:** `lib/game/repair/repairMachine.ts` (+ tests), `components/game/repair/EngineBay.tsx`, `components/game/repair/Toolbox.tsx`, `components/game/repair/RepairParts.tsx`, `lib/net/protocol.ts`.
**Repair state machine (pure; **identical on server and client**; the server is authoritative, the client reflects):**
```
idle ──(engine failed|overheating & driver on foot near front)──► hood_closed
hood_closed ──[OPEN_HOOD]──► hood_open
hood_open  ──[INSPECT part X]──► diagnosed(X)           // brokenPart revealed by smoke/glow; wrong guesses cost REPAIR.WRONG_GUESS_SECONDS
diagnosed(X) ──[GRAB_TOOL]──► tool_in_hand
tool_in_hand ──[REMOVE_PART X]──► part_removed(X)       // physical drag, see below
part_removed(X) ──[INSTALL_NEW X]──► part_installed(X)  // drag new part from toolbox into slot
part_installed(X) ──[CLOSE_HOOD]──► hood_closed_repaired
hood_closed_repaired ──[ENTER_CAR & IGNITION]──► restarted   // sets engineStatus ok, engineHealth ≥ REPAIR.RESTORED_HEALTH, brokenPart null
```
- **Transitions are intents**: client sends `repair:step { step, partId? }`; server accepts **only** the legal next step from the current state (and a legal part id) and returns the new state; out-of-order steps are rejected (ack `error: "illegal_step"`) and **never advance**. Tests enumerate every legal and 3 illegal transitions per state.
- **Cooling path (overheating, not failed):** `hood_open` + `cap_cool`: unscrew radiator cap (drag rotate `REPAIR.CAP_TURNS = 1.5`), hold a water bottle over it (`hold` 3 s), re-screw; or just wait with hood open (cools faster via `hoodOpen`). Overheat cleared when `T < OVERHEAT_RECOVER (0.6)`.
**Physical interactions (each is an `Interactable` from step 2.4, none are buttons):**
- Hood latch at the car's front (hold-E `REPAIR.HOOD_HOLD_S = 0.8`), hood rotates up on a hinge.
- Engine parts are separate meshes (radiator hose = cylinder + clamps, spark plugs = small cylinders, drive belt = torus), brokenPart shows **smoke particles + a red tint**; inspecting means looking + pressing on a part (`press`).
- Remove: `drag` the part out by `REPAIR.REMOVE_DRAG_PX = 120` pixels; it follows the cursor then drops in a bin.
- Install: pick the matching replacement from the toolbox (3 slots, each labelled by shape + colour; **only the matching one works**, wrong pick shakes and costs `REPAIR.WRONG_PART_SECONDS`), `drag` into the slot with `drag` threshold, snaps with a clunk.
- Ignition: sitting in the seat, a physical key/starter button on the dash.
**Penalty/time:** the repair time itself is the penalty (clock keeps running, spec §4.2). Add a **par time** shown nowhere; track `repairDurationMs` for results.
**Done when:** state-machine tests green; manual script walks the full repair on one machine in solo mode (set `&debug=1&fail=drive_belt` to force a failure).
**Do not:** add a "Repair" button anywhere; do not let the client advance the state without the server ack in online mode (in solo mode run the same machine locally).

## Step 4.5 — Pit stop (stage structure, refuel, simultaneous work)
**Goal:** spec §7, §8.
**Files:** `lib/game/stage/pitStop.ts` (+ tests), `lib/game/stage/types.ts` (add `pit: PitInfo | null` to `StageData`), `components/game/pit/PitArea.tsx`, `components/game/pit/FuelPump.tsx`, `lib/game/refuel/refuelMachine.ts` (+ tests), `server/race/pitController.ts`.
**Placement (pure, seeded `SEED_SALTS.PIT`, never changes existing stage geometry):** `pitS` = a straight section between `0.45*L` and `0.65*L` of stage length `L`, at least `PIT.MIN_STRAIGHT_METRES = 120` long and ≥ `PIT.MIN_CLEARANCE_FROM_CORNER_M = 60` from any corner; if none, pick the longest straight in that band (generator already retries until valid; add `pit !== null` to the validity predicate). The pit box is a rectangle beside the road (`PIT.BOX_SIZE`) on the **right** side of the direction of travel, so the co-driver's door (passenger, −x) faces the pump; document this choice in a comment. Use the Kenney `pitsGarage`/`pitsOffice` GLBs as scenery (already in the racing kit; copy only what you use into `public/assets/racing/` and update `LICENSES.md`).
**Flow (server `pitController`, per team, room stays `racing`):** car enters the **pit box** (server checks pose in the box and `speed < PIT.MAX_ENTRY_SPEED_MS = 2`) ⇒ team `status = "pit"`; **raw clock pauses for that team, `pitMs` clock runs** (D9); both players may exit (step 4.3). Team leaves pit when: `fuel01 ≥ PIT.MIN_FUEL_TO_RELEASE` (or players choose to release anyway), engine not failed, hood closed, both players seated, fuel hose disconnected ⇒ `pit:release` (server computes; client just shows "GO!"); the pit timer stops when the car moves out of the box again.
**Refuel machine (co-driver, spec §7, physical):**
```
idle → [GRAB_HOSE] → hose_held → [CONNECT at car's fuel flap] → connected → [START] → fueling → [STOP] → connected → [DISCONNECT] → hose_held → [RETURN_HOSE] → idle
```
- Fuel flap: `press` to open. Hose: `drag`/hold-follow from the pump (a rope drawn as a catmull-rom tube between pump and hand/flap; max length `REFUEL.HOSE_LENGTH_M`; if the player walks farther the hose snaps back and the machine returns to `idle` with `REFUEL.TANGLE_PENALTY_S`).
- Start/stop: a pump **lever** (`toggle`) and a **physical gauge** on the pump; fueling speed `REFUEL.LITRES_PER_SECOND`; **overfill** past `REFUEL.OVERFLOW_AT (1.0)` spills (puddle decal, `REFUEL.SPILL_PENALTY_S` once, spec "poor execution costs time"). Server integrates fuel at the pump rate only while the machine state is `fueling` **and** the co-driver is within `REFUEL.MAX_DISTANCE_M` of the car flap.
- Simultaneous work: the driver performs engine checks/repairs (step 4.4) on his side while the co-driver fuels; nothing blocks either flow.
**Tests:** placement validity over seeds 1..200 (always found, always on a straight, never overlaps road geometry/trees — remove props inside the pit box in `props.ts` with a pure `isInsidePitBox` filter and test it); refuel machine legal/illegal transitions; D9 time accounting with a scripted pit.
**Done when:** a scripted server-side test goes `racing → pit → refuel → release → racing` with correct `pitMs`.

## Step 4.6 — Phase 4 acceptance
Manual: team drives, rain starts (use `&rain=1`), co-driver uses wipers, engine overheats (use `&debug=1&overheat=1`), driver stops, exits, repairs; pit stop with simultaneous refuel and repair; finish; results show raw/pen/pit/total/damage/fuel/nav errors/crashes. Automated: all gates plus every state-machine and mechanics test.

---

# PHASE 5 — Procedural generation hardening

(Seeded generation, terrain, checkpoints and notes already exist from phases 1–2. This phase makes them **provably fair** per spec §25.)

## Step 5.1 — Validation suite
**Files:** `lib/game/stage/validateStage.ts` (+ tests), call from `generateStage` (extend the existing validity predicate; keep the retry cap).
**Checks (each a named function returning `{ ok: boolean; reason?: string }`):**
1. `startFinishConnected`: samples continuous (max gap ≤ `ROAD.SAMPLE_SPACING * 1.5`).
2. `noImpossibleTurns`: no corner radius below `ROAD.MIN_RADIUS` (≥ 12), no two corners overlapping in arc length (`endS_i ≤ startS_{i+1}`), minimum straight between consecutive corners `ROAD.MIN_STRAIGHT_BETWEEN` (≥ 20 m) except deliberate `tightens` links (those are 12 m min).
3. `noOverlap`: distant road sections stay `≥ ROAD.MIN_SEPARATION` apart (already partly present; expose and test).
4. `checkpointsReachable`: strictly increasing, spacing between `CHECKPOINT.MIN_SPACING (300)` and `MAX_SPACING (900)` m, each at least 20 m from a hairpin apex.
5. `readableFromNotes`: every corner has exactly one note; **no note text longer than `PACE_NOTES.MAX_TEXT_LENGTH (28)` chars**; at most `PACE_NOTES.MAX_NOTES_PER_100M = 3` notes per 100 m (else corners are too dense to read aloud).
6. `fairDifficulty`: score = `Σ corner.severityWeight`, must lie within `DIFFICULTY.STAGE[stageIndex].min..max` (stage 0 low; add the table in constants). Reject stages that are too easy or too hard; stage-0 forbids two hairpins within `300 m`.
7. `pitFits` (phase 4.5).
**Done when:** 1000 seeds (tests run 1..1000) either validate on the first attempt or after ≤ `ROAD.MAX_ATTEMPTS`; none throw; a summary (attempt histogram) is printed by `scripts/stageStats.ts`.

## Step 5.2 — Daily/shared seed plumbing
**Files:** `lib/game/stage/dailySeed.ts` (+ test). `dailySeed(dateUtc: Date): number` = stable 32-bit hash (FNV-1a over `YYYY-MM-DD`) mod `SEED.MAX_RANDOM_SEED`. Room creation gets an optional `useDailySeed` (host toggle in lobby UI). No leaderboard storage (D11).

## Step 5.3 — Terrain/props polish required by gameplay
Pit-box clearing (done in 4.5), **at least `PROPS.MIN_CLEAR_RADIUS_START` clear around start/finish**, guaranteed visible **distance markers** (reuse cones? No — add low-poly km posts: small box + number plate drawn with a canvas texture, placed every 500 m at the road edge, **non-solid**), and checkpoint gates visible from `GATES.VISIBLE_DISTANCE_M`.

---

# PHASE 6 — Discord bot, audio, weather polish, effects

## Step 6.1 — Discord integration (optional at runtime; game must work without it)
**Dependencies:** `discord.js` — official Discord API library (voice-channel management, slash commands). **Human prerequisite (Codex cannot do this):** the user creates a Discord application + bot, enables the *Server Members* and *Voice States* intents, invites the bot with permissions `Manage Channels`, `Move Members`, `View Channels`, `Connect`, and gives you `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_CATEGORY_ID` via `.env`. If these are missing the bot **must not start** and the game logs `discord: disabled` once. **Do not ask the user to paste a token into chat; read from `.env` only.**
**Files:** `server/discord/discordService.ts` (interface + `NoopDiscordService`), `server/discord/discordBot.ts` (real implementation), `server/discord/linking.ts` (+ tests of linking logic with a fake client), `server/env.ts` (optional vars), `components/lobby/DiscordLink.tsx`.
**Interface:**
```ts
export interface DiscordService {
  readonly enabled: boolean;
  /** Creates a temp voice channel per fully-seated team under the category; returns channel ids. */
  createTeamChannels(roomCode: string, teams: TeamForVoice[]): Promise<Record<string /*teamId*/, string /*channelId*/>>;
  /** Moves linked users who are already in any voice channel; reports who could not be moved. */
  moveToTeamChannels(roomCode: string, assignments: { discordUserId: string; channelId: string }[]): Promise<{ moved: string[]; notInVoice: string[] }>;
  /** Deletes the temp channels (idempotent; also run on a timer and on server shutdown). */
  cleanup(roomCode: string): Promise<void>;
}
```
**Linking flow (the Discord API cannot move users who aren't connected to voice):** player runs `/rally link code:<ROOMCODE> name:<playerName>` (a guild slash command) — the bot verifies the room exists and the name matches a player, stores `discordUserId ↔ playerId` in memory, and replies ephemerally "Linked. Join any voice channel; I'll move you when the rally starts." The lobby shows per-player "Discord linked ✓". On `room:start` (not before): create channels `🔊 Rally {code} · Team {n} — {driver} & {codriver}` (sanitise names: strip non-printables, max 90 chars total), move linked users who are in voice; those not in voice get an ephemeral DM-free hint via the lobby UI ("join a voice channel, then click *Move me*"; a `discord:moveMe` ack event moves them on demand). On `results` + `RESULTS_TIMEOUT` or room deletion: `cleanup` deletes channels. Rate-limit and error handling: every Discord call in try/catch, errors logged without secrets, failures never throw into gameplay.
**Done when:** with no env vars, the server boots and everything works with `NoopDiscordService`; with fake-client tests the link/move/cleanup logic passes. A real-Discord manual test is **human-run**; write the exact steps in `docs/DISCORD_SETUP.md` (create it; Markdown, no path-comment required).

## Step 6.2 — Audio (no new assets, no new deps)
**Files:** `lib/game/audio/audioEngine.ts`, `lib/game/audio/engineSound.ts`, `lib/game/audio/surfaceSound.ts`, `lib/game/audio/events.ts`.
**Design:** Web Audio API only. `AudioContext` created/resumed on the first user gesture (the start button). Engine: 2 detuned `OscillatorNode`s (sawtooth + square) through a `BiquadFilter` low-pass, frequency = `ENGINE_SOUND.BASE_HZ + rpm * ENGINE_SOUND.HZ_PER_RPM`, gain follows throttle; add a noise-driven "rumble". Gravel: filtered noise whose gain follows `slipSpeed` (read from `WheelState`; add a public `Vehicle.slipSpeed` getter). Collision thud: short noise burst on `car:impact`. Warning buzzer/beeps from `events.ts`. Rain: filtered noise loop, gain by intensity (dampened inside the car: low-pass). Wipers: periodic soft thunk synced to blade phase. Co-driver hears the same ambient mix (engine from snapshot rpm via `car:inputs`).
**Volume:** master gain + a mute toggle (key **M**), saved to `localStorage` in try/catch.
**Done when:** unit tests of pure mapping functions (`rpmToHz`, `slipToGain`) pass; manual listen test noted for the human.

## Step 6.3 — Effects and look
Dust trail particles behind tyres on gravel (`THREE.Points`, ≤ `FX.MAX_DUST_PARTICLES = 600`, pooled, no per-frame allocation), skid marks (instanced decal quads, ring buffer `FX.MAX_SKID_SEGMENTS = 400`), brake lights/headlights (night stage later), cone knock-over already physics-driven, **screen shake on impact** scaled by impulse (camera rig adds a damped offset; respect a `reducedMotion` setting read from `prefers-reduced-motion` via `matchMedia`, in try/catch; shake off when set), smoke from hood when engine hot (`overheating` ⇒ white, `failed` ⇒ black).

## Step 6.4 — Stages 2 and 3 (after MVP loop is fun)
Only after the human confirms phase-4 acceptance: stage list `STAGES = [forest_day, mountain_rain, forest_night]` in `lib/game/stage/stageList.ts`; per-stage config (`weatherPlan`, `timeOfDay`, difficulty band, fog colours, light intensity, headlights needed). Night: sun off, `RENDER.NIGHT_AMBIENT`, car headlight `SpotLight`s (shadows off, perf!). Inter-stage flow: `finished` → short results → pit stop → next stage (room `stageIndex++`, seed derived `deriveSeed(room.seed, stageIndex)`). **Do not start this without explicit approval in `## Open questions`/the user's message.**

---

# Appendix A — File-creation checklist for every new file
- [ ] Line 1 path comment.
- [ ] JSDoc on every exported + internal function/class/hook/component.
- [ ] No `any`, no `var`, no inline styles, no magic numbers, no TODO.
- [ ] Constants added to the right constants module; salts registered in `SEED_SALTS`.
- [ ] Pure logic separated from React/Three and **unit-tested**.
- [ ] Any message crossing the network has a zod schema in `lib/net/protocol.ts`.
- [ ] No per-frame allocation in hot paths (`useFrame`, physics step, snapshot handlers).
- [ ] Browser-only code is client-only; server-importable modules import no DOM.
- [ ] Gates pass (section 1.4).

# Appendix B — Pitfalls specific to this codebase (read before each phase)
1. **Pointer lock vs R3F events:** R3F pointer events don't work while pointer-locked → always use the step-2.4 interaction system, never `onClick` on meshes.
2. **Rapier WASM init:** `loadRapier()` is async; never construct `Vehicle`/`World` before it resolves. The co-driver client must not load Rapier at all until step 4.3.
3. **Determinism:** never call `Math.random()` in `lib/game/**`. Use `createRng`/`deriveSeed`. Adding a feature must not change the road for an existing seed (new salts only).
4. **Handedness/heading:** increasing heading turns **left**; `direction: 1` = left. Pace-note text must use "Left" for `direction === 1`. A wrong sign here makes the co-driver send the driver off the road — keep a unit test on a hand-built left corner.
5. **Camera yaw:** the cockpit camera looks down −z while the car faces +z (`FACE_FORWARD_YAW = π`). Passenger camera reuses the same convention.
6. **Store spam:** never call `useGameStore.setState` at render rate. Publish at 20 Hz max (see `SimulationDriver`).
7. **Interpolation:** snapshot rendering uses a **delayed** render time (`INTERPOLATION_DELAY_MS`); never render the latest snapshot directly.
8. **Server must never import** `physics/**`, `session.ts`, `input/**`, `components/**` in phases 3–6 (they use DOM/Rapier/React).
9. **Next 16:** `searchParams` is a Promise; `redirect()` in a Server Component; client-only game code stays behind the dynamic loader.
10. **Headless limits:** you cannot judge frame rate or feel. Don't claim to.
11. **CC0 assets:** only copy GLBs you actually use and keep `public/assets/LICENSES.md` current.
12. **The spec file contradicts itself in places** (voice, architecture duplicates). Section 2 resolves it; follow section 2.

# Appendix C — Definition of "MVP done" (spec §22 success criterion)
All must be true and demonstrated:
1. Two teams join the same web room with a code; each has a Driver and a Co-driver (roles chosen).
2. Driver drives a procedural stage; co-driver reads the physical tablet map and calls notes.
3. Co-driver operates the wipers physically; windshield visibility responds.
4. Driver can stop, leave the car, open the hood, and perform the physical repair; engine restarts.
5. Both players perform a pit stop simultaneously (refuel + repair).
6. Penalties/damage/fuel/crashes tracked server-side; DNF possible.
7. All teams get a final ranking with the spec §20 breakdown.
8. Discord linking/channel creation works **or** is cleanly disabled; the game works either way.

---

## Open questions
_(Codex: append questions here instead of guessing. Format: `- [step id] question — what you did meanwhile`.)_
- [Step 3.1] The server import list includes `lib/game/weather/weather.ts`, but Step 2.5 (which creates it) is deferred. Should the pure weather model be pulled forward before later server weather imports? Server skeleton can proceed without importing it meanwhile.

## Progress log
_(Codex: one line per finished step. Format: `- [step id] YYYY-MM-DD — what was done; baseline numbers if asked.)_
- [Phase 1] 2026-10-01 — driving prototype built; `tsc`, `eslint`, `npm run build` pass; seed 847291 autopilot finish ≈110.3 s, ≈0.22 ms/physics step (headless).
- [Step 1.5.0] 2026-10-01 — added Vitest and three deterministic stage-generation tests; seeds 1–200 pass.
- [Step 1.5.1] 2026-10-01 — stage retries now enforce at least 8 corners and 1 hairpin-or-tight; seeds 1–200 and all gates pass.
- [Step 1.5.2] 2026-10-01 — added normalized gate-tower colliders and a headless one-second impact check; speed falls below 5 m/s and all gates pass.
- [Step 2.0] 2026-10-01 — added validated role selection, solo Tab-hold role/camera swapping and driver-input gating; all gates pass (10 tests).
- [Plan order] 2026-10-01 — per user direction, continued to Phase 2; Steps 1.5.3 and 1.5.4 remain deferred and unfinished.
- [Step 2.1] 2026-10-01 — added deterministic pace-note generation and boundary/linking coverage; 14 tests and all gates pass; seed 847291: Straight, 30; Hairpin left, 130; Right 1, long, 220; Right 3, 90; Right 1, 70; Left 4, 50; Right 3, long, 160; Right 4, 140; Left 4, opens, 40; Left 3, 50; Right 2, long, 130; Left 3, 90; Right 1, long, 120; Left 2, 60; Right 3, 140; Left 2, long, 170; Left 3, 50; Right 3, 150; Left 4, 100; Right 2, opens, 80; Right 1, long, 240; Right 1, long, tightens, 110; Right 4, opens, 70; Right 2, 240; finish.
- [Step 2.2] 2026-10-01 — added the passenger camera side and cockpit hardware placeholders; route renders with the passenger eye and all gates pass; hands stay static until Step 2.4.
- [Step 2.3] 2026-10-01 — added the physical navigation tablet with live map, pace calls, mode toggle seam and projection tests; 18 tests and all gates pass; verified readable labels at 1280×720.
- [Step 2.4] 2026-10-01 — added reusable role-aware ray interactions, mouse/E input, drag camera suspension, crosshair, toggle demo, tablet mode button, and damped hand reach; 20 tests and all gates pass (full tests required a longer timeout under CPU load); verified tablet appears only for the co-driver.
- [Plan order] 2026-10-01 — per user direction, jumped to Phase 3; Steps 2.5 and 2.6 remain deferred and unfinished.
- [Step 3.1] 2026-10-01 — added Express/Socket.IO server, validated env, health endpoint and dev:all scripts; server/root TypeScript, ESLint, build, tests (20) and `/health` pass; existing port 3000 server prevented a second Next dev process from holding the lock.
