# Angry Sheep

Tabletop museum exhibit: children collaborate to guide digital sheep into a pen using physical tools. Built for the Children's Museum of Pittsburgh, targeting ages 6–8.

A circular table displays a projected scene with digital sheep. Children place physical blocks, sheepdogs, and grass on the table to herd the sheep — but rough handling triggers crisis mode, and only calming actions (feeding, petting, kind words) can help.

## Repo layout

| Path | Purpose |
|------|---------|
| `web/` | Frontend web app (p5.js + Vite) — sheep simulation, game logic, session flow |
| `server/` | Python ArUco marker tracking server (WebSocket) |
| `markers/` | Printable ArUco marker assets (see `markers/README.md`) |
| *(root)* | Docs, design concept, roadmap, session logs |

## Web app (frontend)

```bash
cd web
npm install
npm run dev
```

Opens at **http://localhost:5173/**. The app runs entirely with mock input (mouse/keyboard) — no physical hardware needed.

### Controls (mock input)

| Action | How |
|--------|-----|
| Move a tool | Drag it |
| Rotate a tool | Scroll wheel while hovering |
| Pet a sheep | Hold left-click near a sheep |
| Speak kindly | Hold **V** key |

### What's implemented

- **Scene** — Circular play area with black mask (projection-ready), circular pen with openings
- **Sheep** — Wandering, flocking, tool reactions (flee dogs, attract to grass, bounce off blocks)
- **Crisis mode** — Stress builds from sheepdogs, sheep turn red/angry, ignore pushing, can multiply
- **De-escalation** — Grass calming, petting (heart animation), voice input
- **Session flow** — Intro animation → 3-min timer → win celebration or timeout → auto-reset
- **Hints** — Icon-based hint bubbles appear on unresolved crisis sheep

### Architecture

The frontend consumes a shared JSON contract:

```json
{
  "tools": [{ "type": "block", "id": 0, "x": 0.45, "y": 0.30, "angle_deg": 90 }],
  "voice": { "active": false, "sentiment": null },
  "pet":   { "active": false, "x": null, "y": null }
}
```

Currently produced by `web/src/input.js` (mock). In production, a WebSocket connection to `server.py` replaces it — the rest of the app doesn't change.

## Python server (tracking layer)

```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python server.py
```

Uses the default camera and serves WebSocket on **ws://127.0.0.1:8765**. Streams ArUco marker positions as JSON.

## Team

- Diane Hu, Cameron, Nevil
- CMU MDes/MPS Studio

## Docs

- [Design concept](angry_sheep_design_concept.md) — Research foundation, design principles, emotional mechanics
- [Roadmap](ROADMAP.md) — Two-track development plan (frontend + physical layer)
- [Usability test plan](usability_test_plan.md) — Round 1 testing protocol for the digital prototype
- [Session log](session_log_2026_03_28.md) — Build progress from 2026-03-28
