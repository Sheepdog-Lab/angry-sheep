# Session Log — 2026-03-31 / 2026-04-01

## Focus: Sheep micro-interactions, fullscreen mode, and sound system

### Sheep micro-interactions (825f05b, Mar 31)

- **Pen fence collision** — sheep now physically collide with pen walls; they can only enter through the 4 gap openings
- **Angry escape** — sheep at ≥70% stress actively flee the pen, sliding along walls to find a gap
- **Block-push stress** — dragging a block into a sheep raises its stress (stationary blocks just repel)
- Tuning defaults adjusted: 12 sheep, 10 blocks, speed 0.0016, crisis speed 2.7

### Background audio (`web/src/sound.js`)

Added two looping background tracks that play during gameplay:

- **Farm ambience** (`farm-sound.mp3`) — default 100%
- **Grass rustling** (`grass-rustled.mp3`) — default 10%

Audio fades in/out with the scene transitions:
- **Intro**: volume ramps up over the first half, matching the black overlay fade-out
- **Playing / win / timeout**: full volume
- **Reset**: volume fades to zero as the screen goes black

### Sound effects

Event-driven one-shot SFX triggered by game events:

| Event | Sound(s) | Default vol |
|---|---|---|
| Sheep enters crisis (mad mode) | `mad sheep.mp3` | 25% |
| Sheep starts eating grass | `eat grass.mp3` (singleton loop — one track regardless of how many sheep eat) | 5% |
| Sheep captured in pen | `small win.mp3` | 30% |
| All sheep captured (win) | `big win.mp3` + `kids laughing.mp3` | 30% / 25% |
| Timer runs out (timeout) | `game over kid.mp3` + `lose.mp3` | 40% / 30% |

### Sound control panel

A "Sound" button in the top-right opens a panel with per-track controls:

- **Global mute** and **Reset to defaults** buttons at the top
- **Per-track**: volume slider (0–100%), individual mute (ON/OFF), and test-play button
- Paired sounds (win pair, lose pair) share a combined test button since they always play together
- Settings persist in localStorage

### Panel UX improvements

- **Mutual exclusion**: opening Sound panel closes Tune panel and vice versa
- **Click outside to close**: clicking anywhere outside either panel dismisses it
- Both panels use a shared `panel-open` custom event for coordination

### Other changes

- Default sheep count reduced from 12 to 8
