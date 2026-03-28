# Session Log — 2026-03-28 (afternoon)

## Focus: Tuning panel + sheep behavior refinements

### Tuning panel (`web/src/tuning.js`)

Built a runtime parameter adjustment UI accessible via a "Tune" button in the top-right corner.

**Categorized sliders:**
- **Sheep** — Count, Speed, Size, Anger per push, Crisis speed
- **Grass** — Size
- **Tools** — Block count

**Presets:**
- "Save current as preset" snapshots all slider values under a user-chosen name
- Click a preset to restore all values; **x** to delete
- Presets persist across sessions via localStorage

### Grazing behavior (new mechanic)

Reworked how sheep interact with grass based on their emotional state:

- **Calm sheep** are briefly attracted to grass, fill up quickly (`grazeFillRate`), then lose interest and wander away. They don't linger.
- **Mad sheep** are always hungry — grass attracts them and calms them down. Grass is now a deliberate de-escalation tool, not just a passive lure.
- **Digestion** — fullness decays over time when away from grass (`grazeDigestRate`), so calm sheep eventually become interested again.

### Stress system changes

- **Removed passive stress decay** — angry sheep stay angry until a player actively intervenes (grass, petting, or voice). This makes crisis mode a real problem that requires collaboration to solve.
- **Removed `maxSpeed`** — speed cap now derives from `speed × crisisSpeedMult` directly, one fewer knob.

### Dynamic tool counts

Added `setToolCount()` to `input.js` — the tuning panel can add/remove blocks (and other tool types) at runtime. New tools spawn at random positions inside the play area.

### Files changed

| File | What |
|------|------|
| `web/src/tuning.js` | New — full tuning panel with categories and presets |
| `web/src/config.js` | Added grazing params, removed `maxSpeed`, `stressDecay`, `grazeFullThreshold` |
| `web/src/sheep.js` | Grazing fullness mechanic, state-dependent grass attraction, removed passive stress decay |
| `web/src/input.js` | Added `setToolCount()` for dynamic tool management |
| `web/src/main.js` | Import and init tuning panel |
