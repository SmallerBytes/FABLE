# H O L L O W (1988) — Archive Reconstruction

```
PROPERTY OF FABLE DYNAMICS — APPLIED OPTICS DIVISION
PROJECT HOLLOW / BUILD 0.7.2 / TAPE 7 OF 9
RECOVERED 2026 — SITE C SUBLEVEL STORAGE
```

A first-person survival horror prototype played in **total darkness**. The
only light is a LiDAR scanner: every point on screen is a laser return you
fired yourself. The creature hunting you is blind — it comes to the sound of
your scanner. **Seeing and surviving are the same resource, spent against
each other.**

No combat. Recover 3 fuses, power the generator, reach the freight door.

## Run it

No build step, no dependencies, no network. Either:

- **Open `game/index.html` directly in any modern browser**, or
- serve it (`python -m http.server` from the repo root, then visit
  `http://localhost:8000/game/`).

Headphones strongly recommended. Sound is not decoration here — it is the
primary threat-detection system.

## Quest 2 / WebXR

The game now includes an initial standalone Quest WebXR path. It must be
opened from an **HTTPS URL**; opening `index.html` directly or visiting a
computer's plain HTTP LAN address will not allow the headset to start WebXR.

1. Publish this repository to any static HTTPS host (GitHub Pages is enough).
2. In the Quest Browser, open `https://your-host.example/game/`.
3. Continue past the boot screen and choose **ENTER VR (QUEST)**.
4. Approve the headset's immersive-VR prompt.

Quest controls:

| Input | Action |
|---|---|
| Head | Look |
| Left stick | Head-relative movement |
| Right stick left/right | 30-degree snap turn |
| Right trigger | Trickle scan aimed by the controller |
| Right grip | Burst sweep |
| A button | Interact |

The headset path renders native stereo views and intentionally bypasses the
desktop CRT barrel-distortion pass. It uses 80% headset framebuffer scale and
draws at most the newest 300,000 points per eye to target Quest 2 performance.
The desktop controls and presentation remain unchanged.

Current VR prototype limitation: the HTML HUD is visible only in the desktop
mirror, not in the headset. Objective status still works through colors,
interaction sounds, and world state; a world-space wrist display is the next
VR UI milestone.

## Controls

| Input | Action |
|---|---|
| Mouse | Aim |
| Hold LMB | Trickle scan (quiet, narrow) |
| RMB / Space | Burst sweep (paints the whole room — **very loud**) |
| W A S D | Move |
| Shift | Sprint (loud) |
| Ctrl | Crouch (near-silent) |
| E | Interact |

Return colors: green = surfaces · amber = objectives · cyan = documents ·
white = energized exit · **red = it. Red returns are always current. Red
returns move.**

## Repository

| Path | Contents |
|---|---|
| `docs/GDD.md` | Complete game design document (mechanics, AI, level, art, sound, narrative, tech plan) |
| `game/` | The playable reconstruction — vanilla WebGL + WebAudio, zero dependencies |
| `tools/validate_map.js` | Map integrity check (row lengths, marker reachability, A*) |
| `tools/smoke.js` | Headless AI/raycast smoke test |

```
node tools/validate_map.js
node tools/smoke.js
```

## Design pillars (short form)

1. You are the light — nothing renders unless you scanned it.
2. Sound is truth — every audio cue is information, never mood-only.
3. Tension over terror — one earned jump scare: yours.
4. Diegetic everything — the whole game is a 1988 instrument panel.
5. No combat — the verbs are scan, move, listen, hold still.

See `docs/GDD.md` for the full specification.
