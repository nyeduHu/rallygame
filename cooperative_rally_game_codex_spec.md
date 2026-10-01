# Cooperative Rally Game — Codex Specification

## 1. Game Overview

A **2-player cooperative browser-based rally game**.

Two players share the same rally car but have completely different responsibilities:

- **Driver** — drives the car and handles mechanical problems.
- **Co-driver** — navigates using a rally map and handles additional tasks such as windshield wipers and refueling.

The central gameplay idea is:

> **Both players have important jobs. If one player makes a mistake, the other player has to deal with the consequences.**

The game should feel fast, chaotic, cooperative and funny, while still having enough skill and pressure to make successful rally runs satisfying.

---

## 2. Visual Direction

Use a **stylized low-poly 3D visual style**.

Reference characteristics:

- Low-poly environment
- Chunky/simple geometric trees
- Bright, saturated environmental colors
- Simplified rally car interior
- First-person cockpit view
- Visible player hands
- Physical-looking dashboard controls
- Exaggerated interactive objects
- Arcade-like presentation
- Slightly chaotic/comedic feel
- Not photorealistic

The visual style should feel similar to the supplied reference screenshots: a playful low-poly rally game viewed from inside the car.

The car cockpit should contain:

- Steering wheel
- Dashboard
- Gear lever
- Handbrake
- Windshield
- Wiper controls
- Passenger/co-driver area
- Co-driver tablet/map
- Physical-looking interior elements

---

# 3. Core Gameplay

The game is built around **competitive cooperative rallying**.

Multiple two-player teams can occupy the same rally room and race on the same/procedurally generated stage.

Example:

```text
RALLY ROOM: FOREST RALLY #1842

TEAM 1
Driver: Alex
Co-driver: Sam

TEAM 2
Driver: Mike
Co-driver: John

TEAM 3
Driver: Emma
Co-driver: Chris

[START RALLY]
```

Each team has exactly:

- 1 Driver
- 1 Co-driver

The room can contain multiple teams.

The primary competitive metric is the team's **total rally time**, including penalties and pit-stop performance.


A rally stage consists of a road through a 3D environment.

The Driver controls:

- Steering
- Throttle
- Braking
- Gear shifting if manual transmission is implemented
- Handbrake
- Mechanical repairs

The Co-driver controls:

- Rally navigation
- Navigation instructions
- Windshield wipers
- Refueling during pit stops
- Additional support tasks

The objective is:

> **Complete the stage as quickly as possible while keeping the car functional.**

---

# 4. Driver Gameplay

## 4.1 Driving

The driver has a first-person cockpit view.

The road should require active driving.

The driver needs to:

- Follow corners
- Avoid obstacles
- React to jumps
- Control speed
- Avoid crashes
- Follow the co-driver's instructions

Driving should be **arcade/semi-realistic**, not a hardcore simulation.

The car should be easy enough to control for casual players but difficult enough that high-speed driving requires skill.

---

## 4.2 Mechanical Problems

The driver is responsible for mechanical problems.

Initial MVP failures:

### Engine overheating

The engine temperature gradually increases depending on:

- Speed
- Engine load
- Environmental conditions
- Damage

If the engine overheats:

- Warning appears
- Performance decreases
- Eventually the engine can fail

The driver must perform a repair/cooling interaction.

### Engine failure

If the engine reaches critical damage:

- Car loses power
- Driver must perform a repair sequence
- Stage time continues to run

Repairs should be interactive mini-games rather than a simple "Repair" button.

Example:

```text
ENGINE FAILURE

[OPEN ENGINE]
      ↓
[FIND BROKEN COMPONENT]
      ↓
[REPLACE / REPAIR]
      ↓
[RESTART ENGINE]
```

---

# 5. Co-driver Gameplay

The co-driver is NOT simply a passenger.

The co-driver has their own active gameplay station.

## 5.1 Navigation Tablet

The co-driver has a physical-looking navigation tablet.

The tablet displays a rally route.

Example:

```text
┌──────────────────────┐
│                      │
│       RALLY MAP      │
│                      │
│       ─────╮         │
│            │         │
│            ╰────     │
│                 ▲    │
│                      │
└──────────────────────┘

NEXT:
RIGHT 4
150m
```

The co-driver must interpret the map and communicate the route to the driver.

---

## 5.2 Rally Pace Notes

The route should contain instructions such as:

- Left 1
- Left 2
- Left 3
- Left 4
- Right 1
- Right 2
- Right 3
- Right 4
- Hairpin
- Jump
- Caution
- Tightens
- Long
- 50m
- 100m
- 150m

Example:

> "Right 3, 100."

Then:

> "Left 4, tightens."

The driver must react to these instructions.

The co-driver can make mistakes.

A wrong instruction can cause:

- Missed corner
- Off-road driving
- Crash
- Time penalty
- Vehicle damage

---

# 6. Co-driver Distractions

A major gameplay mechanic is that the co-driver cannot simply stare at the map.

Other tasks appear during the rally.

This forces the co-driver to prioritize.

---

## 6.1 Windshield Wipers

Rain can begin during a stage.

The driver says:

> "Wipers!"

The co-driver must find and activate the wipers.

If the wipers are not activated:

- Windshield becomes progressively harder to see through
- Driver visibility decreases
- Driving becomes more difficult

Eventually:

```text
VISIBILITY
██████████
```

If the co-driver activates the wipers:

- Windshield clears
- Visibility returns

The wiper control should be a physical interaction in the co-driver area.

---

# 7. Refueling

Some rally stages contain pit stops.

At the pit stop, the co-driver is responsible for refueling.

The refueling interaction can involve:

1. Grab fuel hose
2. Connect hose
3. Start fueling
4. Monitor fuel level
5. Stop fueling
6. Disconnect hose

Poor execution costs time.

Example:

```text
PIT STOP

FUEL
██████░░░░ 60%

[CONNECT]
[START]
[STOP]
[DISCONNECT]
```

The goal is to make this physical and interactive rather than a menu.

---

# 8. Pit Stops

A rally can contain:

```text
STAGE
   ↓
PIT STOP
   ↓
REFUEL
   ↓
REPAIR
   ↓
CONTINUE
```

The driver and co-driver can have separate jobs during the pit stop.

### Co-driver

- Refuels

### Driver

- Repairs vehicle
- Checks engine
- Performs mechanical maintenance

Both players should be able to work simultaneously.

A well-coordinated pit stop should save time.

---

# 9. Vehicle State

The game should maintain shared vehicle state.

Example:

```text
SPEED       126 km/h
FUEL        42%
ENGINE      67%
DAMAGE      24%
TEMPERATURE 81%
```

Important state variables:

- Position
- Rotation
- Velocity
- Speed
- Fuel
- Engine health
- Engine temperature
- Overall damage
- Tire condition
- Visibility
- Current stage
- Checkpoint
- Pit stop state

The server should be authoritative for important shared game state.

---

# 10. Failure Philosophy

Do not make every mistake an instant game over.

Most mistakes should accumulate consequences.

Examples:

### Small mistake

- +2 seconds

### Navigation mistake

- +5–15 seconds
- Possible damage

### Crash

- Major damage
- Possible mechanical failure

### Ignored engine warning

- Engine failure
- Significant time loss

### Bad pit stop

- Additional time

Eventually the vehicle can become too damaged to continue:

```text
DID NOT FINISH

ENGINE FAILURE
```

---

# 11. Rally Stages

The game should consist of multiple stages.

Example:

```text
RALLY
│
├── Stage 1
│   └── Forest
│
├── Pit Stop
│
├── Stage 2
│   └── Mountain
│
├── Pit Stop
│
└── Stage 3
    └── Night Forest
```

Initial MVP can contain only **one stage**.

Additional stages should be added later.

---

# 12. Difficulty Progression

## Stage 1 — Tutorial

- Daylight
- Simple road
- Simple navigation
- Few hazards
- No serious mechanical failures
- Introduces controls

## Stage 2

- More difficult navigation
- Rain
- Windshield wipers
- More corners
- More obstacles

## Stage 3

- Night
- Poor visibility
- More mechanical failures
- More difficult navigation
- More demanding route

Future environments:

- Snow
- Mud
- Fog
- Heavy rain
- Mountain roads
- Desert
- Coastal roads

---

# 13. Multiplayer

The game is designed around **multiple two-player teams racing in the same room**.

A room is not limited to one pair.

Each team consists of exactly:

- 1 Driver
- 1 Co-driver

Example:

```text
RALLY ROOM

TEAM 1
Player A — DRIVER
Player B — CO-DRIVER

TEAM 2
Player C — DRIVER
Player D — CO-DRIVER

TEAM 3
Player E — DRIVER
Player F — CO-DRIVER
```

The room should support a configurable number of teams.

The server must keep each team's state separate while synchronizing the shared race/stage environment.

Recommended initial multiplayer flow:

```text
MAIN MENU

[CREATE RALLY]

Room created:
ABCD12

Share this code with your friend.
```

The second player enters:

```text
[JOIN RALLY]

ROOM CODE:
[ ABCD12 ]

[JOIN]
```

Once both players are connected:

```text
PLAYER 1
DRIVER

PLAYER 2
CO-DRIVER

[START RALLY]
```

For the MVP, private room codes are preferred over public matchmaking.

---

# 14. Role Selection

Players should be able to choose:

```text
CHOOSE ROLE

[ DRIVER ]

[ CO-DRIVER ]
```

The host should not be forced to be the driver.

Later, the game can support role swapping between stages.

---

# 15. Voice Communication

The game should **not implement its own voice-chat system initially**.

Players should use **Discord for voice communication**.

A Discord bot should manage the communication experience.

Recommended concept:

```text
GAME ROOM
   ↓
DISCORD BOT
   ↓
PRIVATE TEAM VOICE CHANNELS
```

When a rally room is created, the Discord bot can create/manage temporary voice channels for teams.

Example:

```text
RALLY #1842

🔊 Team 1 — Alex & Sam
🔊 Team 2 — Mike & John
🔊 Team 3 — Emma & Chris
```

Players in the same team should be placed into their team's voice channel.

The bot should ideally be able to:

- Create temporary team voice channels
- Assign/move players where supported
- Name channels after team/player names
- Clean up channels after the rally
- Associate a game room/team with a Discord channel

The web game should not depend on Discord for gameplay synchronization. Discord is only the external communication layer.

If Discord integration is unavailable, the core game should still function.

Example communication:

Driver:

> "What's next?"

Co-driver:

> "Right 3, 100!"

Driver:

> "WIPERS!"

Co-driver:

> "I'm doing it!"

The chaotic verbal communication is an important part of the game's identity.


Driver:

> "What's next?"

Co-driver:

> "Right 3, 100!"

Driver:

> "Wipers!"

Co-driver:

> "Doing it!"

For the MVP, a simple WebRTC-based voice chat can be used.

If voice chat increases implementation complexity too much, it can be temporarily disabled while the core multiplayer gameplay is built.

---

# 16. Different Player Interfaces

The two players should NOT see the same interface.

This is fundamental to the game design.

## Driver Screen

Main focus:

**THE ROAD**

Minimal HUD:

```text
              ROAD
       🌲              🌲
          ─────────
             🚗

SPEED
126 km/h

ENGINE
████████░░

DAMAGE
██░░░░░░░░

FUEL
██████░░░░
```

The driver should spend most of their time looking at the road.

---

## Co-driver Screen

Main focus:

**THE NAVIGATION STATION**

```text
┌──────────────────────┐
│                      │
│       RALLY MAP      │
│                      │
│       ───╮           │
│          ╰────       │
│               ▲      │
│                      │
└──────────────────────┘

NEXT:
RIGHT 3

DISTANCE:
100m

[ WIPERS ]

[ FUEL ]

[ OTHER ]
```

The co-driver constantly switches attention between:

- Map
- Route
- Driver communication
- Wipers
- Refueling
- Other tasks

---

# 17. Game Camera

## Driver

First-person cockpit camera.

The player sees:

- Steering wheel
- Dashboard
- Hands
- Windshield
- Road
- Car interior

## Co-driver

First-person passenger-seat camera.

The player sees:

- Dashboard
- Navigation tablet
- Hands
- Side window
- Wiper controls
- Other interactive objects

The co-driver should be able to look around the cockpit.

---

# 18. Controls

## Driver — PC

Recommended:

```text
W        Throttle
S        Brake / Reverse
A        Steer left
D        Steer right

SPACE    Handbrake

E        Interact

MOUSE    Look around
```

Optional:

```text
SHIFT    Gear up
CTRL     Gear down
```

Manual transmission can be added later.

---

## Co-driver — PC

```text
WASD / MOUSE    Look around

E               Interact

MOUSE           Grab/use objects
```

The co-driver should primarily use mouse interaction with physical objects.

---

# 19. Interactive Object Philosophy

Whenever possible, interactions should be physical.

Avoid:

```text
CLICK "REPAIR"
```

Prefer:

```text
OPEN HOOD
     ↓
GRAB TOOL
     ↓
REMOVE COMPONENT
     ↓
REPLACE COMPONENT
     ↓
RESTART
```

Likewise, avoid:

```text
CLICK "ENABLE WIPERS"
```

Prefer:

```text
FIND WIPER SWITCH
     ↓
MOVE SWITCH
     ↓
WIPERS START
```

This is an important part of the game's identity.

---

# 20. Scoring

The game is **competitive**.

Multiple teams in the same room compete for the fastest total time.

At the end of a stage:

```text
RALLY RESULTS

1. TEAM 3     08:42.31
2. TEAM 1     08:57.84
3. TEAM 2     09:14.20
```

Do not show a ranking until the relevant race/stage has finished if the design requires hidden information.

Each team's score should account for:

- Raw driving time
- Time penalties
- Pit-stop time
- Navigation penalties
- Major mistakes
- DNF status

Example individual team result:

```text
TEAM 1

RAW TIME
08:42.31

TIME PENALTY
+00:18.00

PIT STOP
00:42.15

TOTAL
09:42.46

DAMAGE
37%

FUEL
12%

NAVIGATION ERRORS
2

CRASHES
1
```

Competitive systems can later include:

- Room leaderboard
- Friends leaderboard
- Global leaderboard
- Personal best
- Daily rally
- Weekly championship
- Ranked seasons


At the end of a stage:

```text
STAGE COMPLETE

RAW TIME
08:42.31

TIME PENALTY
+00:18.00

TOTAL
09:00.31

DAMAGE
37%

FUEL
12%

NAVIGATION ERRORS
2

CRASHES
1
```

The main competitive metric is:

**Total stage time.**

---

# 21. Replayability

Replayability should come primarily from **procedurally generated rally stages**.

Every rally should be capable of producing a new route while remaining fair and understandable.

Possible future features:

- Personal best
- Friends leaderboard
- Global leaderboard
- Different weather
- Procedural route variations
- Random mechanical failures
- Random events
- Different cars
- Car upgrades
- Unlockable stages
- Daily rally seed
- Weekly competition


Players should want to replay stages.

Possible future features:

- Personal best
- Friends leaderboard
- Global leaderboard
- Different weather
- Different route
- Random mechanical failures
- Random events
- Different cars
- Car upgrades
- Unlockable stages

---

# 22. Recommended MVP

The MVP should prove the complete cooperative/competitive loop without attempting to build the full game.

## Multiplayer

- Create room
- Join room using code
- Multiple teams per room
- Two players per team
- Driver/co-driver role selection
- Team lobby
- Real-time synchronization
- Race countdown
- Room leaderboard

## Driver

- First-person cockpit
- Semi-realistic arcade driving
- Steering
- Throttle
- Brake
- Basic collision
- Speed
- Fuel
- Engine health
- Engine temperature
- Basic engine failure
- Exit vehicle
- Walk around vehicle
- Basic physical engine repair

## Co-driver

- First-person passenger view
- Physical navigation tablet
- Easy-to-read procedural map
- Basic route interpretation
- Navigation instructions
- Physical wiper interaction
- Basic pit-stop refueling

## Procedural Environment

- One low-poly forest biome
- Procedurally generated road network
- Procedural corners
- Procedural rally notes
- Start
- Finish
- Checkpoints
- Basic obstacles

## Race Systems

- Shared race timer
- Team timing
- Penalties
- Damage
- Fuel
- Pit stop
- Finish state
- DNF state
- Results/leaderboard

## Discord

For the MVP, the Discord bot can initially be limited to:

- Linking a game room to Discord
- Creating/organizing team voice channels
- Cleaning up temporary channels

## MVP success criterion

The first meaningful milestone is:

> **At least two teams can join the same web room, each team has a Driver and Co-driver, the Driver drives a procedural rally stage, the Co-driver reads a physical map and gives directions, the co-driver can operate the wipers, the driver can leave the car and repair it, both players can perform a pit stop, and all teams receive a final competitive ranking.**

# 23. Suggested Technical Architecture

The game should be built as a modern **PC-first web application**.

Mobile is not an initial target.

A reasonable technology direction:

### Frontend

- TypeScript
- React for menus/UI
- Three.js or React Three Fiber for 3D

### Multiplayer

- WebSocket-based real-time communication
- Server-authoritative important game state

Potentially:

- Node.js
- WebSocket / Socket.IO

### Voice / Communication

- Discord
- Discord bot
- Discord API for room/team communication management

The game itself should not require WebRTC voice chat for the MVP.

### Backend

- Node.js + TypeScript

### Storage

For the MVP, persistent database storage is not essential.

Room/race state can initially exist in memory.

Later add:

- PostgreSQL
- Redis if needed for scaling


The game should be built as a modern web application.

A reasonable technology direction:

### Frontend

- TypeScript
- React for menus/UI
- Three.js or React Three Fiber for 3D

### Multiplayer

- WebSocket-based real-time communication
- Server-authoritative important game state

Potentially:

- Node.js
- WebSocket / Socket.IO

### Voice

- WebRTC

### Backend

- Node.js + TypeScript

### Storage

For the MVP, persistent database storage is not essential.

Room state can initially exist in memory.

Later add:

- PostgreSQL
- Redis if needed for scaling

---

# 24. Multiplayer Synchronization

The server should maintain authoritative shared state.

Important synchronized state:

```text
room
players
roles
car.position
car.rotation
car.velocity
car.speed
car.fuel
car.engineHealth
car.temperature
car.damage
stage
checkpoint
weather
wipers
pitStop
navigationState
timer
```

The client should send player inputs.

The server validates and broadcasts relevant state.

Do not send unnecessary data every frame.

Use interpolation on clients for smooth movement.

---

# 25. Procedural Rally Stage Generation

Procedural generation is a core feature, not a later optional feature.

The generator should create rally stages that are:

- Different between races
- Deterministic from a seed
- Navigable
- Fair
- Understandable
- Capable of generating interesting corners
- Suitable for rally pace notes

## Seeded generation

Each rally should have a seed:

```text
RALLY SEED
847291
```

The same seed should generate the same stage for all players in the room.

For competitive modes, a shared daily/weekly seed can later be used.

## Generation pipeline

Conceptually:

```text
SEED
 ↓
GENERATE ROAD PATH
 ↓
VALIDATE ROAD
 ↓
GENERATE TERRAIN
 ↓
PLACE TREES / OBJECTS
 ↓
GENERATE CHECKPOINTS
 ↓
GENERATE RALLY NOTES
 ↓
GENERATE PIT STOP
 ↓
START RACE
```

The generator must validate that:

- Start and finish are connected
- There are no impossible turns
- Road segments do not overlap in invalid ways
- Checkpoints are reachable
- The route has enough visual readability
- Pace notes can describe every important turn
- The stage is not unfairly difficult

## Navigation difficulty

The co-driver should be required to actually interpret the map.

However, the map should be intentionally readable.

Avoid tiny, ambiguous or overly complex navigation symbols.

Use clear:

- Direction arrows
- Road lines
- Corner shapes
- Distance markers
- Simple numbered corner difficulty

Example:

```text
                 ┌───────
                 │
START ───────────┘
                  \
                   \───── FINISH
```

The challenge comes from:

- Speed
- Pressure
- Looking away from the map
- Wiper problems
- Pit stops
- Communication
- Mistakes

It should NOT primarily come from trying to decipher an intentionally confusing map.

# 25. Game State Machine

Recommended game states:

```text
LOBBY
  ↓
ROLE_SELECTION
  ↓
READY
  ↓
COUNTDOWN
  ↓
RACING
  ↓
PIT_STOP
  ↓
RACING
  ↓
FINISHED
  ↓
RESULTS
```

Potential failure state:

```text
RACING
  ↓
VEHICLE_DISABLED
  ↓
DNF
```

---

# 26. Room State

Example:

```typescript
interface RallyRoom {
  id: string;

  players: {
    id: string;
    role: "driver" | "codriver";
    ready: boolean;
  }[];

  stage: number;

  gameState:
    | "lobby"
    | "role_selection"
    | "ready"
    | "countdown"
    | "racing"
    | "pit_stop"
    | "finished"
    | "dnf";

  timer: number;

  car: {
    position: Vector3;
    rotation: Vector3;
    velocity: Vector3;
    speed: number;
    fuel: number;
    engineHealth: number;
    temperature: number;
    damage: number;
  };

  weather: "clear" | "rain" | "fog" | "snow";

  wipers: boolean;

  checkpoint: number;
}
```

This is conceptual and can be adjusted to the actual networking implementation.

---

# 27. Game Feel

The most important design principle:

> **The game should create pressure through cooperation, not through complicated controls.**

The player should constantly think:

Driver:

> "Where is the next corner?"

Co-driver:

> "RIGHT 3!"

Driver:

> "How far?!"

Co-driver:

> "100!"

Rain starts.

Driver:

> "WIPERS!"

Engine warning appears.

Driver:

> "ENGINE!"

Co-driver:

> "I'm navigating!"

Driver:

> "I'M TRYING TO DRIVE!"

This chaotic communication should be part of the fun.

---

# 28. Humor and Social Gameplay

The game should allow funny failures.

Examples:

- Co-driver forgets the wipers
- Driver misses a corner
- Co-driver gives a bad call
- Driver crashes because they trusted a bad call
- Co-driver is trying to refuel while the driver is yelling
- Engine fails at the worst possible moment

These situations should be visually exaggerated but not overly scripted.

The game should naturally generate moments that players want to clip and share.

---

# 29. Future Features

After the MVP works, consider:

### Vehicles

- Different rally cars
- Different handling
- Different reliability

### Environments

- Forest
- Mountain
- Snow
- Desert
- Night
- Rain
- Mud

### Advanced failures

- Tire puncture
- Brake failure
- Suspension damage
- Battery failure
- Radiator failure
- Transmission problems
- Headlight failure

### Advanced co-driver tasks

- Radio
- Tire pressure
- Route switching
- Map folding
- Emergency repair assistance
- Headlights
- Hazard warnings

### Competitive

- Leaderboards
- Daily rally
- Weekly championship
- Ghost runs
- Friends competitions

---

# 30. Development Strategy for Codex

Build the project incrementally.

## Phase 1 — Driving prototype

Build:

- 3D environment
- Rally road
- Car
- First-person driver camera
- Basic driving physics
- Collision
- Finish line

Goal:

> Driving around a procedural rally stage feels good.

---

## Phase 2 — Co-driver station

Add:

- Passenger camera
- Navigation tablet
- Map
- Interactive controls
- Wiper

Goal:

> One computer can simulate the two different roles.

---

## Phase 3 — Multiplayer rooms

Add:

- Room creation
- Room joining
- Multiple teams
- Two players per team
- Role assignment
- Real-time synchronization
- Competitive leaderboard

Goal:

> Multiple teams can race in the same web room.

---

## Phase 4 — Cooperative mechanics

Add:

- Navigation instructions
- Wiper system
- Engine failures
- Repairs
- Fuel
- Pit stops

Goal:

> Both players must actively cooperate to finish.

---

## Phase 5 — Procedural rally generation

Add:

- Seeded procedural road generation
- Terrain generation
- Checkpoints
- Pace-note generation
- Procedural pit-stop placement
- Stage validation
- Shared rally seed

Goal:

> Every rally can produce a fresh but fair stage.

---

## Phase 6 — Polish

Add:

- Better low-poly models
- Animations
- Sound
- Engine sounds
- Tire sounds
- Rain
- UI
- Effects
- Improved physics
- Results screen

---

# 31. Important Scope Rule

Do not attempt to create a massive rally simulator immediately.

The first milestone is:

> **Two people join a room, one drives, one navigates, the co-driver can activate the wipers, the car can crash, and both players can successfully finish a short rally stage together.**

If that is fun, expand the game.

---

# 32. Finalized Design Decisions

The following decisions are now confirmed:

1. **Room structure:** Players join a room, and multiple two-player teams can occupy the same room and race against each other.
2. **Roles:** Players choose whether they are Driver or Co-driver.
3. **Voice communication:** Use Discord for external communication, managed through a Discord bot rather than building voice chat into the game.
4. **Driving model:** Between arcade and semi-realistic, leaning toward semi-realistic.
5. **Stages:** Procedurally generated rally stages.
6. **Navigation:** The co-driver must read the map and figure out the route. The map should be deliberately easy enough to understand so the challenge comes from pressure, multitasking and communication rather than obscure navigation.
7. **Tablet:** The co-driver physically interacts with the navigation tablet.
8. **Leaving the car:** The driver can leave the car and perform physical repairs/interactions outside the vehicle.
9. **Pit stops:** Real pit stops are a core gameplay mechanic.
10. **Platform:** PC-first, web-based.
11. **Competition:** Competitive multiplayer with team rankings and leaderboards.
12. **Tone:** Funny, chaotic and highly social.

These decisions replace any earlier conflicting options in this document.

