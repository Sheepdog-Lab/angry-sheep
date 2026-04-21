# Session Log — 2026-04-01 (afternoon)

## Focus: Physical marker system, camera-driven mode, gameplay polish

### Physical marker calibration & controls (fdc2e53, 1671ba0, da5ee80)

- **ArUco marker mode** — digital/physical mode toggle driven by marker IDs (0–3 sheepdogs, 4–5 grass, 6–11 blocks)
- **Calibration pipeline** — persistent offset, scale, flip (X/Y), and rotation controls for marker alignment; 4-point homography capture (C key, top→right→bottom→left)
- **Calibration UI** — on-screen calibration key overlay, target dots, "Calibration complete" confirmation, recalibrate buttons (windowed + fullscreen)
- **Camera integration** — browser camera selector + JPEG frame pump to Python OpenCV server via WebSocket; lazy OpenCV fallback so browser keeps webcam access
- **Marker debug** — marker rendering over black overscan area, ID labels, flip state display

### Audio improvements (d4d0913, afb324a)

- **Kids background music** — new track at 5% default volume
- **Audio fade-out fix** — background tracks stay playing at volume 0 instead of pausing (avoids browser autoplay policy blocking replay after reset)
- **Farm ambience boost** — routed through Web Audio GainNode for 2× volume
- **Victory SFX swap** — replaced mission-complete with trumpet + kids laughing combo
- **Removed timer/timeout** — game runs indefinitely until all sheep captured; removed game-over/lose SFX
- **Reset button** — manual reset during play (replaced countdown)

### Directional physical markers (990ceb8)

- Marker rotation applied to physical tools with visual heading arrow
- Sheepdog influence limited to sheep in front of its marker-driven facing direction

### Crisis sheep escape improvements (19eafc4)

- Mad sheep now steer toward the nearest pen opening instead of pushing outward radially
- If a tool blocks the nearest gap, the sheep picks the next available one

### Pen capture & tool clamp (d493ce7)

- Sheep below 70% stress calm down and stay captured; at or above 70% they escape through nearest unblocked gap
- Stress resets to 0 on capture so penned sheep are immediately calm
- Tool drag positions clamped to table circle so they stay visible
- Background music autoplay retry on first user gesture

### Camera-driven game mode (5d81392)

- **Removed manual mode toggle** — mode now follows camera state: camera on → physical, camera off → digital
- **Camera on/off button** — replaces the old "Mode: Digital/Physical" toggle, sits in camera panel header alongside Hide/Show
- **Auto-collapse** — camera panel collapses when camera turns off, Hide/Show button hidden; expands when camera turns on
- **markerOverlay fix** — marker overlay now correctly shows in physical mode (was counter-intuitively shown in digital mode)
- **Camera disconnect handling** — track `ended` event auto-falls back to digital mode
- **Persistence** — camera on/off preference saved to localStorage; respected on reload
- **gameMode.js simplified** — stripped to pure reactive store, no more localStorage or button binding
- **Reset button restyled** — moved to top bar next to Sound button, red background, renamed "Reset the Game"
