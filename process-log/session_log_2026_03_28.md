# Build Session — 2026-03-28

## What was built

Starting from zero frontend code, built the entire web app through A4 in one session:

**A1 — Scene & Rendering Setup**
- Created `web/` directory with Vite + p5.js (instance mode, ES modules)
- Circular play area with black mask outside (only the table circle is lit — ready for projection)
- Circular pen in the center with configurable gap openings
- Fixed set of tools pre-placed on the table (3 blocks, 2 border collies, 2 grass) — no click-to-create, drag-only
- Mock input layer (`input.js`) that produces the shared contract format — designed to be swapped for WebSocket in integration phase

**A2 — Sheep Simulation**
- 5 sheep with wool-puff bodies, dark faces, eyes that follow movement direction
- Wandering + flocking + separation behavior
- Tool reactions: flee from sheepdogs, attract to grass, bounce off blocks
- Smooth facing via angular lerp (fixed jitter when stuck between blocks)
- Wander angle deflection near blocks so sheep steer around instead of into them
- Damping when boxed in by multiple blocks
- Pen capture with green progress ring animation
- Captured sheep wander gently inside the pen

**A3 — Crisis Mode**
- Stress system: sheepdogs raise stress, continuous color gradient white → orange → red
- Crisis behavior: erratic fast movement, shaking, red eyes, angry eyebrows, ignores sheepdogs
- De-escalation: grass calming, petting (hold-click near sheep, shows heart), voice (hold V key)
- Sheep multiplication when a crisis sheep is pushed further
- Crisis sheep can't be captured in the pen

**A4 — Session Flow**
- State machine: intro → playing → win/timeout → reset → intro
- Intro: fade from black, animated arrows pointing to pen, sheep silhouette goal indicator
- 3-minute countdown timer with arc + digits (turns red in last 30s)
- Hint bubbles on crisis sheep after ~3s: alternating grass/hand icons
- Win celebration: green glow, expanding sparkles and stars
- Timeout: hourglass icon, circular "try again" arrow
- Auto-reset with fade to black

**Usability Test Plan**
- Full test plan written for Round 1 (screen-based, pre-physical-integration)
- 12 participants (8 solo + 2 paired), 8 task scenarios, facilitation guide, observation template

## Process notes

**How:** The roadmap was divided into two parallel tracks first (Diane = frontend, partner = physical layer). Then built A1–A4 sequentially, one phase at a time. Each phase: read the spec, implement, build-verify, then move on.

**Why:** Diane can't connect to physical hardware yet, so the entire frontend uses a mock input layer (`input.js`) that produces the same JSON contract the partner's server will eventually produce. Swapping mock for real is just replacing one file.

**Next steps:** Continue from A5 (voice UI frontend) or jump to polish/tuning. The usability test plan should drive what to tune next.
