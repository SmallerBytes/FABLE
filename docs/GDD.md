# H O L L O W
### Game Design Document — Archive Reconstruction Edition

```
PROJECT HOLLOW — RD-9 BLACKOUT OPERATIONS
PROJECT HOLLOW / BUILD 0.9.3 / BLACKOUT LOADOUT
CLASSIFICATION: INTERNAL — DO NOT DUPLICATE
```

> **Note:** This document specifies *Project HOLLOW*, an RD-9 LiDAR
> cyber-infiltration prototype. The demo stresses the point-cloud display
> under adversarial operator panic. The accompanying build is playable.

---

## 1. High Concept

**HOLLOW** is a first-person survival horror game played in **total darkness**.
The world has no light, no textures, no rendered geometry. The only way to see
is to **scan**: the player carries a prototype LiDAR unit that fires pulses of
laser light and paints the returns as a phosphor-green point cloud on a CRT
display. Every point you see, you put there.

The catch is the core tension loop: **the thing that lets you see is the thing
that gets you killed.** The scanner makes noise. The creature that haunts the
facility is blind, but it hears everything. Scanning reveals the world — and
reveals *you* to it. The creature itself is invisible except as a cluster of
**red returns** when your pulses strike its body.

There is no combat. You cannot fight. You can only see, listen, move, and hide
in the dark you yourself refuse to illuminate.

- **Genre:** First-person survival horror / sensory deprivation
- **Player count:** 1
- **Session length:** 15–35 minutes per run; designed for repeat attempts
- **Platform (reconstruction):** Any modern browser, keyboard + mouse,
  zero external dependencies (single HTML file + scripts, vanilla WebGL/WebAudio)
- **Fictional platform (1988):** HOLLOW RD-9 "ranging display" workstation,
  monochrome long-persistence phosphor CRT

### Design Pillars (in priority order)

1. **You are the light.** Nothing is visible unless the player chose to make it
   visible. Sight is a verb, a resource, and a risk.
2. **Sound is truth.** Audio is never decorative. Every sound is information:
   the creature's position, your own loudness, the state of the world.
3. **Tension over terror.** Dread comes from anticipation and self-betrayal
   (the urge to scan), not from frequent jump scares. The single jump scare —
   death — is earned.
4. **Diegetic everything.** UI, narrative, and feedback live inside the
   fiction of a 1988 prototype instrument panel. No health bars, no minimap.
5. **No combat.** The verbs are SCAN, SWEEP, MOVE, CROUCH, HOLD STILL,
   INTERACT. Power comes only from knowledge and restraint.

---

## 2. Narrative

### 2.1 Premise

October 1988. Project HOLLOW Site C — a subterranean applied-optics research
facility — went dark eleven days ago after a containment failure in the
specimen wing. You are **Operator Wren Halse**, a field calibration technician
sent down alone because you are the only person left who knows how to run the
RD-9 ranging unit, and because nobody important was willing to go.

The facility's power grid is down. The dark below is absolute — no emergency
lighting survived. Your task as written: restore generator power by recovering
**three fuses** scattered through the facility, re-energize the freight exit,
and leave. Your task as it unfolds: understand what Site C was actually
listening to, and avoid the thing the staff began calling **the Custodian** —
a specimen that echolocates, that learned the facility by sound, and that has
had eleven silent days to learn that anything which clicks in the dark is food.

### 2.2 Story delivery

All narrative is environmental and diegetic. There are no cutscenes.

- **Boot sequence:** the game opens as the RD-9 powering on — self-test text,
  a mission directive from HOLLOW dispatch. This is the entire
  explicit setup.
- **Memo pickups (4):** scattered paper logs from Site C staff, painted as
  **cyan returns**. Walking over one displays its text on the CRT for a few
  seconds. They tell the story of the incident in fragments (see §2.3) and
  double as soft tutorialization (memo 2 explicitly warns: *"it comes to the
  clicking"*).
- **The ending:** reaching the energized exit rolls a terse epilogue:
  Wren surfaces; Project HOLLOW seals Site C; the final line implies the
  Custodian was never the only specimen. Cut to the archive framing.
- **Death:** the screen floods with red returns and static; the RD-9 "loses
  carrier" and reboots to the title. Death text varies slightly by how loud
  the player was when caught (a quiet death reads differently than a sprint).

### 2.3 The four memos (full text)

1. **DR. OKONKWO, ACOUSTICS** — *"It doesn't have eyes. It never had eyes.
   The sockets are vestigial. Marchetti says it sees the room the way our
   rangefinder does — pulse and return. It liked the RD-9 tests. It would
   stand at the glass during every calibration run. Listening."*
2. **MARCHETTI, CONTAINMENT** — *"Day 3 without power. We move when it moves,
   freeze when it stops. DO NOT use the ranging unit indoors. I watched it
   take Beck mid-sweep. It comes to the clicking. It comes FAST."*
3. **UNSIGNED, MESS HALL** — *"Generator fuses pulled and hidden. If you're
   reading this we did it on purpose. The exit door held it in. If you power
   the door you are opening the door. Decide if going home is worth that."*
4. **DR. OKONKWO, FINAL** — *"It isn't hunting us. I understand now. It's
   calibrating. Every scream is a return pulse. It is building a map of us,
   the way we built a map of it. When the map is finished it will not need
   to listen anymore. Be nothing. Be nowhere. Be quiet."*

### 2.4 Tone references

*Alien* (1979) motion-tracker dread, *The Descent* (cave blindness),
Thief's audio-led stealth, and the real-world aesthetic of 1980s
oscilloscope/radar phosphor displays. The horror is procedural and cold:
laboratory typography, calibration numbers, a creature treated by the fiction
as an instrument problem.

---

## 3. Core Gameplay

### 3.1 The player verb set

| Verb | Input | Effect | Noise emitted |
|---|---|---|---|
| Look | Mouse | Aim head/scanner | none |
| Walk | W A S D | 3.2 m/s movement | low (per footstep) |
| Sprint | Shift + move | 5.6 m/s | **high** (per footstep) |
| Crouch-walk | Ctrl + move | 1.6 m/s | near-silent |
| Hold still | (release keys) | No noise; heartbeat audible when Custodian near | none |
| **Trickle scan** | Hold **LMB** | Continuous narrow-cone spray of returns | low, continuous |
| **Burst sweep** | **RMB** or **Space** | 1.4 s full-FOV horizontal sweep, dense returns; 6 s recharge | **very high** |
| Interact | **E** | Pick up fuse / seat fuse in generator / open exit | medium (clunk) |

### 3.2 The LiDAR scanner (the heart of the game)

The RD-9 fires ray pulses from the camera. Each pulse that strikes a surface
deposits a **persistent point** at the hit location. Points are the *only*
rendered geometry in the game.

**Trickle scan (LMB held):**
- ~220 rays/frame in a randomized cone of ~14° half-angle around the aim
  direction.
- Quiet enough to use carefully near the Custodian, but continuous use
  accumulates noise (see §3.4).
- The "flashlight" of the game: cheap, directional, weak.

**Burst sweep (RMB / Space):**
- A vertical fan of rays sweeps left→right across ~150° horizontal over 1.4 s,
  ~26 vertical samples per column — the classic LiDAR sheet-of-light reveal.
- Paints an entire room in one pass. Emits a loud rising chirp.
- 6-second recharge (capacitor whine plays while charging; the HUD CHG bar
  reflects it).
- This is the devil's bargain: total knowledge, maximum exposure.

**Point persistence and decay (memory as fiction):**
- The point buffer is a **ring buffer of 700,000 points**. New returns
  overwrite the oldest. The world literally *forgets itself* as you scan —
  rooms you mapped ten minutes ago erode into darkness.
- Additionally, every point fades over a **90-second lifetime** (shader-side),
  going from full phosphor brightness to nothing. Fresh scans glow hot;
  old scans linger as ghosts.
- Design intent: the map is a perishable resource. Players must choose between
  re-scanning (noise) and navigating from decayed memory (risk).

**Return color semantics (fixed, never explained except in the boot text):**

| Return color | Meaning |
|---|---|
| Phosphor green | Inert surface (wall, floor, ceiling) |
| Dim blue-green | Floor returns (subtle, aids spatial reading) |
| **Amber** | Objective: fuse, generator socket |
| **Cyan** | Memo / narrative pickup |
| **White, pulsing** | The exit door (only once powered) |
| **Red** | The Custodian's body. Red returns fade in ~2.5 s — far faster than the world — so a red blotch is always *current* information, always moving, never a stale ghost. |

### 3.3 The Custodian (threat overview — full AI in §5)

- Completely invisible except as red returns when struck by pulses.
- **Blind. Hears everything.** Navigates by its own echolocation clicks, which
  the player can hear, spatialized — the creature is audible long before it
  is visible.
- Cannot be fought, stunned, or outrun in open corridor (chase speed slightly
  exceeds player sprint). Survival = breaking line-of-noise: go quiet, change
  direction while it commits to your last heard position.
- Touching the player kills instantly. One life. Run restarts.

### 3.4 The noise model (the resource economy)

The game's "resource" is **silence**. Every action adds to an invisible,
positional noise event list the Custodian samples:

| Source | Loudness (radius of guaranteed hearing) |
|---|---|
| Crouch step | 2 m |
| Walk step | 7 m |
| Sprint step | 16 m |
| Trickle scan (per second) | 9 m |
| Burst sweep | **34 m** (most of the map) |
| Interact (fuse/generator/door) | 12 m |
| Generator coming online | global, scripted (see §6 finale) |

Heard noises raise the Custodian's **agitation** and give it an investigate
target. Loudness over distance falls off linearly; walls attenuate by 40% per
intervening wall cell (cheap occlusion via the nav grid).

**Player-facing feedback is diegetic only:** the HUD has a small **AUX**
needle showing the player's own emitted loudness in the last second, and the
creature's audible clicks/heartbeat layer communicate proximity. No "alert
state" icons.

### 3.5 The core loop

```
 LISTEN (where is it?) 
   → SCAN (what's here? — spends silence)
     → NAVIGATE decayed point-memory (spends safety)
       → OBJECTIVE (fuse: spends noise to grab)
         → EVADE (it heard; go quiet, reroute)
           → LISTEN ...
```

Fear comes from the loop's self-defeating structure: every answer to "where
am I?" worsens "does it know where I am?".

### 3.6 Failure & difficulty

- One-hit death, full restart. Runs are short by design; mastery is map and
  audio literacy, which persists across deaths (roguelike-style knowledge
  progression, fixed map).
- No difficulty settings in fiction (it's a 1988 prototype); the reconstruction
  honors that. Pacing is tuned by the agitation decay curve instead (§5.4).

---

## 4. Level Design

### 4.1 Structure

A single contiguous map — **Site C, Sublevel 2** — defined as an ASCII grid
(48 × 36 cells, 3 m per cell, 4 m ceilings). Authoritative layout lives in
`game/src/map.js` and is reproduced here verbatim; `#` and space are solid,
`.` is floor, letters are spawn markers:

```
################################################
#......#..........#...........#......#.........#
#......#..........#.....2.....#......#....3....#
#..m...#..........#...........#..##..#.........#
#......#..#####...#..##...##..#..##..#..####...#
#...#..#..#...#...#..##...##..#......#..#..#...#
#...#.....#...#......##...##.....##.....#..#...#
#...#..#..#####...#...........#..##..#..#..#...#
#...#..#..........#...........#......#..#..#...#
#...#..#..........#...........#......#..#..#...#
###.#############.#####...########.######.####.#
#......#...........#.........#.................#
#......#...........#.........#..##..##..##.....#
#..1...#..##..##............m...##..##..##..#..#
#......#..##..##....#.........#..............#.#
#...#..#............#.........#..##..##..##..#.#
#...#..#..##..##....#.........#..##..##..##....#
#...#......##..##...#....#######...............#
#...#..#............#....#.....#..############.#
#...#..#############.....#.....#...............#
#......#............#....#.....#..#########....#
#......#............#....#.....#..#.......#....#
#..##..#............#....#.....#..#.......#....#
#..##.....P.........#....#..............G.#....#
#......#............#....#.....#..#.......#....#
#......#............#....#.....#..#########....#
######.##....########....##..###...............#
#....#.......#..........................####...#
#....#..######..######....######..#####....#...#
#....#..#.....................m#..#...#....#...#
#.X..#..#..######..######..#...#..#...#....#...#
#....#..#..#....#..#....#..#...#......#.C..#...#
#....#..#..#....#..#....#..#...#..#...#....#...#
#....#......m...........#..#......#...#....#...#
#......................................####....#
################################################
```

Markers: `P` player spawn (Atrium) · `C` Custodian lair (southeast block) ·
`1 2 3` fuses (Storage / Lab B / northeast room) · `G` generator socket ·
`X` exit freight door (interact to win once powered) · `m` ×4 memos.
Zone labels (Atrium, Storage, Labs, Cells, Generator) are descriptive only;
the grid above is the literal collision data.

### 4.2 Zones and beat design

| Zone | Role | Designed beat |
|---|---|---|
| **Atrium** (spawn) | Safe-ish tutorial space | First scans; player learns trickle vs. burst with the Custodian far away. Memo trail leads out. |
| **Storage maze** | Fuse 1 | Tight aisles, shelving stubs. Teaches that decayed points = getting lost. Custodian patrols its edge. |
| **Lab B** | Fuse 2 | Mid-map, multiple entrances — the player must pick an escape route *before* grabbing the fuse (interaction noise draws investigation). |
| **East cell block** | Fuse 3 | Deep in the Custodian's home territory; longest quiet-crawl in the game. Memo 3 just outside warns about the bargain. |
| **Generator room** | Power restore | A committed, noisy, three-stage interaction (§6). The set-piece. |
| **Southwest exit** | Finale | Long straight corridor — built for a final chase. |

### 4.3 Spatial rules

- No doors anywhere except the (initially dead) exit: nothing between the
  player and the Custodian but distance, geometry, and silence.
- Corridors are 1–2 cells wide; rooms up to 7 cells. Wide rooms favor the
  player (lateral evasion); corridors favor the Custodian (speed).
- Multiple loops: from every objective there are ≥2 exits. No dead end is
  more than 4 cells deep except inside the storage shelving (deliberate trap
  texture).
- Landmarking under point-decay: each zone has a distinct *silhouette motif*
  (shelving stubs in Storage, bench rows in Labs, cell partitions in the
  block) so a half-faded scan remains identifiable.

---

## 5. Enemy AI — The Custodian

### 5.1 Senses

- **Hearing (primary):** consumes the noise event list (§3.4). Each event's
  *perceived loudness* = loudness − distance − wall attenuation. Above
  threshold 0 → becomes the new investigate target with confidence
  proportional to perceived loudness.
- **Touch-range certainty:** within 3.5 m of the player it "feels" them
  (air displacement) regardless of silence — holding still inside hug range
  is not safe. This prevents degenerate freeze-camping.
- **It cannot see.** Player scans pointed at it do not alert it directly —
  but the *sound* of scanning does. (Critically: painting it red is "free"
  only if you were already making that noise.)

### 5.2 State machine

```
            quiet too long                    heard something
   ┌────────────────────────► PATROL ◄──────────────────┐
   │                            │                        │
DORMANT ── first loud noise ──► │ heard (conf < 0.75)    │ lost target & calm
 (lair,                         ▼                        │
 pre-agitation)            INVESTIGATE ─ heard (conf ≥ 0.75)
                                │        or player ≤ 6 m & noisy
                                ▼                        
                              CHASE ── lost contact 6 s ──► (drops to INVESTIGATE
                                │                            at last known pos)
                                ▼
                          player ≤ 1.3 m → KILL
```

| State | Speed | Behavior | Audio tell |
|---|---|---|---|
| DORMANT | 0 | Waits in lair until cumulative agitation > threshold. Guarantees a calm opening 1–3 min. | Distant, slow clicks |
| PATROL | 2.0 m/s | A* between weighted waypoints (room centers; objective rooms weighted higher as fuses are taken — the map *constricts*). | Steady clicks every ~2.2 s |
| INVESTIGATE | 3.4 m/s | A* to last heard position; on arrival, dwell 4–8 s doing a "listening sweep" (tight circling). | Click rate doubles; wet breathing layer |
| CHASE | **6.0 m/s** | Re-paths to player's actual position every 0.4 s — but only while fed by noise; a silent player updates it only via the 3.5 m touch sense. | Continuous shriek-clicks, heavy footfalls, music sting |
| KILL | — | Scripted death: red flood, carrier loss, reboot. | Scream + static |

### 5.3 Movement

- A* on the walkable grid, string-pulled to waypoints, capsule radius 0.5 m.
- The Custodian never "teleports" and never cheats position — players who
  track its clicks can always reason about where it is. **Fairness is the
  foundation of the fear.**

### 5.4 Agitation (global pacing director)

A scalar 0–100. Noise events add (scaled by perceived loudness); it decays at
1.2/s. It drives:
- DORMANT → PATROL transition (> 12)
- Patrol waypoint pick bias toward player's half of the map (> 40)
- Click-rate and breathing intensity (continuous; the *whole soundscape*
  tightens as the player gets sloppy)
- Each fuse collected adds +15 permanently to the decay floor — the endgame is
  structurally tenser than the opening, no scripting needed.

### 5.5 Anti-frustration rules

- After a CHASE the Custodian must pass through INVESTIGATE (no instant
  re-chase), giving a survivable beat.
- Spawn room (Atrium) is excluded from PATROL waypoints until the first fuse
  is taken.
- KILL range generous-to-the-player (1.3 m, strictly distance-checked, no
  lunge hitbox).

---

## 6. The Finale (scripted sequence)

1. **Seating the 3rd fuse** at the generator: three E-presses, each a loud
   clunk (12 m), each with a 1.5 s lockout — a forced noise ritual while the
   player listens to the clicks getting closer.
2. **Power-on:** global scripted noise. The generator roars; the exit door
   (far southwest) begins **pulsing white returns** — visible through the
   decay system as the only self-refreshing points in the game, a beacon.
   The Custodian transitions to CHASE on the generator's position.
3. **The run:** ~70 m from generator to exit. The corridor layout gives one
   clean route and one risky shortcut. Sprinting feeds it your position;
   the intended solution is a sprint-burst, then a silent corner-break, then
   sprint again — using everything taught.
4. **Exit:** E at the door → 0.8 s "door grind" (it is right behind you;
   the audio mix makes sure you believe that) → cut to epilogue text.

---

## 7. UI / UX

### 7.1 Diegetic frame

The entire game is presented as the RD-9's CRT: barrel distortion, scanlines,
phosphor bloom, vignette, faint hum, and per-frame analog noise grain. All UI
is monospaced uppercase instrument text in phosphor green.

### 7.2 HUD (all corners, all diegetic)

| Element | Content |
|---|---|
| Top-left | `RD-9 RANGING ACTIVE` + run timer (`T+MM:SS`) |
| Top-right | `PTS NNNNNN / 700000` (live ring-buffer usage — memory pressure as UI) |
| Bottom-left | `CHG ▮▮▮▮▮▯▯▯` burst capacitor bar |
| Bottom-right | `FUSE 1/3` objective counter; flips to `EXIT ENERGIZED` |
| Bottom-center | **AUX needle** — player's own emitted loudness, last 1 s |
| Center | 3-pixel reticle dot |
| Event line | Single-line messages (`RETURN ANOMALY — RED`, `FUSE SEATED 2/3`, memo text) typed out character-by-character with teletype blips |

### 7.3 Screens

- **BOOT:** ROM self-test → dispatch directive → `PRESS ENTER`. Skippable
  after first run (any key).
- **CONTROLS CARD:** one static screen, instrument-manual styling.
- **DEATH:** `CARRIER LOST` + variant epitaph + `SIGNAL? [ENTER]`.
- **WIN:** epilogue → archive-recovery framing card → credits as a
  "personnel manifest."

### 7.4 Accessibility (reconstruction additions, outside 1988 fiction)

- Mouse sensitivity and master/SFX volume on the boot screen.
- "Reduced flash" toggle: caps the death-flood strobe.
- All critical audio cues have a minimal visual twin (e.g., Custodian clicks
  within 12 m nudge the AUX panel with a direction tick) — playable deaf,
  difficult by design but not impossible.

---

## 8. Art Direction

### 8.1 The one rule

**If the player didn't scan it, it does not exist on screen.** No ambient
geometry, no skybox, no fog silhouettes. The framebuffer between points is
pure black (plus CRT grain). Violating this once destroys the game.

### 8.2 Point rendering

- Round, additive-blended points, size attenuated by distance (2.2 px–5 px).
- Phosphor lifecycle per point: spawn at 130% brightness ("hot write"),
  settle to 100% in 0.4 s, linear fade to 0 over 90 s.
- Subtle per-point jitter at spawn (±2 cm) — sensor noise, makes surfaces
  feel *measured*, not modeled.
- Palette is exactly the six colors in §3.2 plus black. Nothing else, ever.

### 8.3 CRT post

Single post pass: barrel distortion (k≈0.12), scanline mask (2 px period,
12% depth), slot-mask RGB shadow tint at 4%, bloom approximation via radial
4-tap blur on bright pixels, vignette, animated grain (LCG noise, 3%),
occasional single-frame horizontal tear when agitation > 70 (the instrument
itself gets scared).

### 8.4 Typography

System monospace, uppercase, letter-spaced. Green #7CFF9B on black. Amber
#FFB347 reserved for objective text, red #FF4444 for threat text only.

---

## 9. Sound Design

All audio is **procedurally synthesized at runtime** (WebAudio) — no samples.
This is both archivally apt (the 1988 build used an FM chip) and keeps the
reconstruction dependency-free.

### 9.1 Layers

| Layer | Synthesis | Behavior |
|---|---|---|
| Room tone | 2 detuned low sines (38/57 Hz) + band-passed noise | Constant; gains +2 dB per 25 agitation |
| Trickle scan | 1.1 kHz filtered tick bursts, ~28/s | While LMB held |
| Burst sweep | Rising 300→2400 Hz chirp + dense tick shower panned with the sweep | On burst |
| Capacitor | 4 kHz whine, pitch tracks charge level | While recharging |
| Footsteps | Brown-noise thumps, low-passed; sharper + louder when sprinting | Player + Custodian (its steps are heavier, slower, slightly flanged) |
| **Custodian clicks** | Twin short square-wave clicks (the "double-click" signature), fully 3D-panned & distance-attenuated | Rate by state: 0.45 Hz dormant → 2.5 Hz chase |
| Breathing | Slow amplitude-modulated filtered noise | Audible < 14 m |
| Heartbeat | 55 Hz thump pair | Player-side; fades in < 10 m proximity, tempo tracks distance |
| Chase sting | Detuned saw cluster, minor 2nd | CHASE enter/exit |
| Death | White-noise scream with pitch dive + carrier-loss tone | KILL |
| UI | 1.8 kHz teletype blips, generator roar, door grind, fuse chime (amber-tinted: major 6th dyad) | Events |

### 9.2 Mixing rules

- The Custodian's click layer is **never** ducked. It is the truth channel.
- Player noise (own footsteps/scans) sits louder than comfortable — the
  player should *feel* loud.
- Silence is allowed to be silent: when still and calm, the mix drops to
  room tone + faint CRT hum. The game trusts dead air.

---

## 10. Technical Implementation Plan

### 10.1 Architecture (as built in this repository)

```
game/
  index.html          Shell: canvas, HUD DOM, screens, CSS (CRT frame), script tags
  src/
    math.js           vec3 ops, mat4 perspective/view builders
    map.js            ASCII map → grid; wall raycast (2D DDA + floor/ceiling
                      analytic); A* pathfinding; line-of-noise wall counting
    render.js         Raw WebGL1: point ring buffer (interleaved VBO,
                      bufferSubData batches), point shader (birth-time fade),
                      offscreen framebuffer, CRT post shader
    audio.js          Procedural WebAudio engine; all layers in §9
    enemy.js          Custodian state machine, agitation, hearing, A* steering
    game.js           Boot/menu/play/death/win states, player controller,
                      scanner (trickle + sweep), items, finale script, HUD
```

Plain script tags, shared `window.HOLLOW` namespace, **no build step, no
network, no dependencies**. Open `game/index.html` and play.

### 10.2 Key technical decisions

1. **Custom analytic raycast, not mesh raycasting.** Because the level is a
   grid, a pulse is resolved by (a) 2D DDA through wall cells, (b) analytic
   floor/ceiling plane hits, (c) ray–sphere tests vs. the Custodian capsule
   and item pickups — nearest t wins. Thousands of rays/frame at trivial cost;
   no BVH, no physics engine.
2. **Point storage:** one interleaved `Float32Array` ring buffer
   (`x y z r g b birth` × 700k) mirrored in a VBO; scan batches upload via a
   single `bufferSubData` per frame. Fading is computed in the vertex shader
   from `uNow - aBirth` — zero per-point CPU work after write.
3. **Red returns decay fast in-shader** via a flag channel (enemy points get
   a shortened lifetime), guaranteeing the "red = live data" rule with no
   bookkeeping.
4. **AI on the same grid** as rendering raycasts: A* over walkable cells,
   recomputed at most every 0.4 s (chase) / on-event otherwise. Wall
   attenuation for hearing = walls crossed on the Bresenham line between
   emitter and listener.
5. **Determinism-friendly randomness:** one LCG; a seeded run reproduces scan
   spray and patrol choices (useful for the archive fiction *and* debugging).
6. **Performance budget:** 700k point vertices is comfortably within
   integrated-GPU limits (~19 MB VBO); CPU cost dominated by ~220 DDA
   raycasts/frame ≈ negligible. Target 60 fps on 2015-era hardware.

### 10.3 Tuning constants (single source of truth, top of each module)

All §3–§6 numbers (speeds, radii, loudness table, lifetimes, agitation rates)
are named constants — the document and the code are kept 1:1.

### 10.4 Test plan

- `node --check` on every script (syntax gate).
- Headless smoke test: boot the page, assert GL context, shaders compile,
  map parses, A* returns a path lair→spawn.
- Manual playtest script: (1) full quiet run, (2) max-noise speedrun,
  (3) stand-still-forever (verify touch-sense prevents camping),
  (4) finale chase on both routes.

---

## 11. Out of scope / cut content (for the record)

Per the recovered binder, the 1988 team cut: a second creature ("the
Surveyor"), scanner battery depletion (tested, deemed frustrating — recharge
on the burst only), and a photo-mode "plot to printer." The reconstruction
honors the cuts.

---

*End of document. — F.D. Applied Optics, Bldg 4. "We measure, therefore it is."*
