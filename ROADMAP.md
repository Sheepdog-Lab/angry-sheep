# Angry Sheep — Development Roadmap

Two parallel workstreams that develop independently and integrate at the end.

- **Diane** — Frontend: web app, sheep simulation, game logic, all interactions
- **Partner** — Physical layer: camera tracking, marker detection, microphone, touch sensing

Diane works with **simulated input** (mouse/keyboard or mock data) so she doesn't need the physical setup. The partner builds the tracking pipeline that produces the same data format. They share a simple JSON contract and integrate once both sides work.

---

## Shared Contract

The frontend expects input events in this shape (via WebSocket or function call):

```json
{
  "tools": [
    { "type": "block",    "id": 0, "x": 0.45, "y": 0.30, "angle_deg": 90 },
    { "type": "sheepdog", "id": 6, "x": 0.70, "y": 0.55, "angle_deg": 180 },
    { "type": "grass",    "id": 11, "x": 0.20, "y": 0.80, "angle_deg": 0 }
  ],
  "voice": { "active": false, "sentiment": null },
  "pet":   { "active": false, "x": null, "y": null }
}
```

- Coordinates are **normalized 0–1** (physical layer handles camera-to-projection mapping)
- `type` is derived from marker ID ranges (agreed upon by both sides)
- `voice` and `pet` are optional inputs added later

---

## Track A: Frontend (Diane)

All work uses simulated input — mouse to place tools, click to pet, keyboard to trigger voice.

### A1 — Scene & Rendering Setup

- [ ] Choose rendering engine (p5.js / Pixi.js) and set up the project
- [ ] Render the play area: background, pen (corral) in the center
- [ ] Build a **mock input layer** — mouse clicks place/move virtual blocks, sheepdogs, and grass
- [ ] Display placed tools as icons on the canvas

**Milestone:** A web page shows the play area with a pen and you can place/move tools with the mouse.

### A2 — Sheep Simulation & Tool Interactions

- [ ] Spawn 3–5 sheep at random positions around the pen
- [ ] Idle behavior: gentle wandering with simple flocking/avoidance
- [ ] **Block** interaction — sheep treat blocks as impassable walls
- [ ] **Sheepdog** interaction — sheep flee away from sheepdogs (push/steer)
- [ ] **Grass** interaction — sheep are attracted toward grass objects
- [ ] Pen entry detection — sheep that reach the pen are "captured"
- [ ] Small celebration animation when a sheep enters the pen

**Milestone:** Sheep wander, react to all three tool types, and can be guided into the pen using mouse-placed tools.

### A3 — Crisis Mode & Emotional Mechanics

- [ ] Track per-sheep stress — increment when a sheepdog pushes the same sheep ~3 times in a row
- [ ] Crisis mode visuals: sheep turns red, moves erratically, speeds up
- [ ] Crisis sheep ignore sheepdogs — pushing no longer works
- [ ] De-escalation: grass held near a crisis sheep gradually calms it
- [ ] De-escalation: clicking/holding on a crisis sheep simulates petting
- [ ] De-escalation: keyboard shortcut simulates positive voice input
- [ ] Sheep multiplication — pushing a crisis sheep further causes it to split
- [ ] Continuous emotional state feedback (color gradient, movement speed, expression)

**Milestone:** The full emotional loop works — sheep get stressed, turn angry, and only calming actions resolve it.

### A4 — Session Flow & Guided Experience

- [ ] Session timer (2–4 min) with visual countdown
- [ ] Hint system — unresolved crisis for ~60s triggers a hint bubble (icon-based, no text)
- [ ] Session start: sheep appear with brief visual intro showing the pen goal
- [ ] Session end: big celebration when all sheep are penned, or gentle "time's up"
- [ ] Auto-reset for next session
- [ ] Animations and icons only — no text (target age 6–8)

**Milestone:** A complete play session runs start-to-finish with simulated input.

### A5 — Voice UI (Frontend Side)

- [ ] Display speech bubble on sheep when voice input is active
- [ ] Visual feedback distinguishing positive vs. negative detected speech
- [ ] Connect voice sentiment to sheep calming (same de-escalation path as grass/petting)

**Milestone:** The frontend responds to voice events — visuals and calming logic are ready for real mic input.

---

## Track B: Physical Layer (Partner)

Builds the hardware pipeline that produces the shared contract data.

### B1 — Marker Tracking & Mapping

- [ ] Extend `server.py` to map marker IDs → tool types (block / sheepdog / grass)
- [ ] Implement camera-to-projection coordinate calibration (pixel coords → normalized 0–1)
- [ ] Validate tracking reliability: occlusion handling, markers leaving the table, lighting conditions
- [ ] Stress-test with many markers on the table simultaneously

**Milestone:** Server outputs the shared contract JSON with tool types and normalized coordinates.

### B2 — Touch / Pet Detection

- [ ] Choose detection method (capacitive overlay, IR camera, or CV hand detection)
- [ ] Implement pet detection — identify when/where a hand touches the table surface
- [ ] Output pet events in the shared contract format (`pet.active`, `pet.x`, `pet.y`)

**Milestone:** Hand-on-table events are detected and included in the data stream.

### B3 — Voice Capture & Classification

- [ ] Set up audio capture from table-mounted microphone
- [ ] Integrate speech-to-text (Whisper / Web Speech API)
- [ ] Classify speech as positive/encouraging vs. negative/harsh
- [ ] Output voice events in the shared contract format (`voice.active`, `voice.sentiment`)

**Milestone:** Spoken words are captured, classified, and streamed as events.

### B4 — Physical Tool Fabrication

- [ ] Design and produce physical tools with embedded ArUco markers
- [ ] Use museum-quality, larger-scale materials (not generic plastic)
- [ ] Multi-sensory textures: astroturf for grass, varied block materials
- [ ] Print and test marker sets (DICT_4X4_50)

**Milestone:** A complete set of physical tools that track reliably on the table.

---

## Integration (Both Together)

Only possible once Track A and Track B each have working output independently.

### I1 — Connect Frontend to Live Tracking

- [ ] Replace the mock input layer with a real WebSocket connection to the tracking server
- [ ] Verify tool positions update smoothly in the frontend from live marker data
- [ ] Tune coordinate mapping — ensure projected sheep react correctly to physical tool placement

### I2 — Connect Voice & Touch

- [ ] Wire live voice events into the frontend voice UI
- [ ] Wire live pet detection into the frontend petting mechanic
- [ ] End-to-end test: a crisis sheep calms down from real speech and real touch

### I3 — Playtesting & Tuning

- [ ] Test with children (target age 6–8) at the table
- [ ] Tune sheep speeds, crisis thresholds, timer duration based on observed play
- [ ] Accessibility review: high contrast, no color-only cues, sensory-friendly
- [ ] Handle all edge cases from live environment (occlusion, lighting, multiple kids)

### I4 — Museum Readiness

- [ ] Document physical setup (projector mount, camera placement, table dimensions)
- [ ] Create museum staff guide for daily operation and troubleshooting
- [ ] Auto-recovery from errors (camera disconnect, WebSocket drop, etc.)

**Milestone:** Exhibit is ready for installation at Children's Museum of Pittsburgh.

---

## Architecture

```
Track B (Partner)                          Track A (Diane)
─────────────────                          ───────────────
┌──────────┐                               ┌──────────────────┐
│ USB Cam   │──▶ server.py ──┐             │  Web App          │
└──────────┘   (ArUco+map)   │  WebSocket  │  ┌──────────────┐ │    HDMI
                             ├────────────▶│  │ Input Layer   │ │───▶ Projector
┌──────────┐   voice svc  ──┤  (shared    │  │ (mock or live)│ │
│ Mic       │──▶ classify    │   contract) │  ├──────────────┤ │
└──────────┘                 │             │  │ Sheep Sim     │ │
                             │             │  │ Game Logic    │ │
┌──────────┐   pet detect ──┘             │  │ Crisis Mode   │ │
│ Touch     │──▶ hand CV                   │  │ Session Flow  │ │
└──────────┘                               │  └──────────────┘ │
                                           └──────────────────┘

         ◀─── develop independently ───▶
         ◀──── integrate at the end ───▶
```

## Open Decisions

| Question | Owner | Options | Notes |
|----------|-------|---------|-------|
| Rendering engine | Diane | p5.js / Pixi.js | p5.js fastest to prototype; Pixi.js if richer animation needed |
| Touch/pet detection | Partner | Capacitive / IR / CV hand detection | Depends on table hardware budget |
| Speech classification | Partner | Local Whisper / Cloud API / Web Speech API | Museum may lack reliable internet — lean local |
| Physical tool materials | Partner | 3D-print / Laser-cut wood + markers | Museum feedback: unique, larger-scale materials |
| Normalized coord origin | Both | Top-left vs. center | Agree early so both sides match |
