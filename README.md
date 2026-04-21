# Angry Sheep

Tabletop museum exhibit: children collaborate to guide digital sheep into a pen using physical tools. Built for the Children's Museum of Pittsburgh, targeting ages 6–8.

A circular table displays a projected scene with digital sheep. Children place physical blocks, sheepdogs, and grass on the table to herd the sheep — but rough handling triggers crisis mode, and only calming actions (feeding, petting, kind words) can help.

## Repo layout

| Path | Purpose |
|------|---------|
| `web/` | Frontend web app (p5.js + Vite 6, **Node 18+**) — runs on its own |
| `dev/web-node14/` | Optional: same UI via Vite 2 if you must use Node 14 (see its README) |
| `server/` | Python ArUco marker tracking server (WebSocket) |
| `markers/` | Printable ArUco marker assets (see `markers/README.md`) |
| *(root)* | Docs, design concept, roadmap, session logs |

## Web app (frontend)

```bash
cd web
npm install
npm run dev
```

Opens at **http://localhost:5173/** (Vite’s default). **Tools** still use mock mouse/keyboard. **Printed ArUco markers** appear as colored dots when **`python server/server.py`** is running (WebSocket `ws://127.0.0.1:8765`). In physical mode, press **X** / **Y** to flip marker left-right or top-bottom if they feel reversed vs the table. If `npm install` / `vite` fails on an old Node, use **`dev/web-node14/`** (see `dev/web-node14/README.md`).

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
- **Crisis mode** — Stress builds from sheepdogs, sheep turn red/angry, ignore pushing, can multiply. Mad sheep stay mad until a player intervenes — no passive decay.
- **De-escalation** — Grass calming (mad sheep seek grass for comfort), petting (heart animation), voice input
- **Grazing** — Calm sheep are briefly attracted to grass but fill up quickly and wander away. Mad sheep stay hungry and are always drawn to grass.
- **Session flow** — Intro animation → 3-min timer → win celebration or timeout → auto-reset
- **Hints** — Icon-based hint bubbles appear on unresolved crisis sheep
- **Tuning panel** — Click "Tune" (top-right) to adjust simulation parameters at runtime, organized by category (Sheep, Grass, Tools). Save/load named presets (persisted in localStorage).

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

Flow: **OpenCV (camera) → ArUco (markers) → WebSocket (JSON).** Full setup (camera permissions, printing markers, test client) is in **[server/README.md](server/README.md)**.

```bash
cd /path/to/angry-sheep
python3 -m venv venv
source venv/bin/activate
pip install -r server/requirements.txt
python server/server.py
```

Serves **ws://127.0.0.1:8765**. Quick test: second terminal, `python server/marker_client.py`.

## Team

- Diane Hu, Cameron, Nevil
- CMU MDes/MPS Studio

## Docs

- [Design concept](angry_sheep_design_concept.md) — Research foundation, design principles, emotional mechanics
- [Roadmap](ROADMAP.md) — Two-track development plan (frontend + physical layer)
- [Usability test plan](usability_test_plan.md) — Round 1 testing protocol for the digital prototype
- [Session log — 2026-03-28](process-log/session_log_2026_03_28.md) — Build progress: A1–A4 (scene, sim, crisis, session flow)
- [Session log — 2026-03-28 #2](process-log/session_log_2026_03_28_b.md) — Tuning panel, grazing behavior, grass mechanics rework
