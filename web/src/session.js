import { SESSION, TABLE_RADIUS, SHEEP as SHEEP_CFG } from './config.js';
import { spawnFlock, getFlock, lockVictorySheepPositions } from './sheep.js';
import { playSfx, muteTrackTemp } from './sound.js';
import { resetIdleHerd } from './idleHerd.js';

// States: 'intro' → 'playing' → 'win' → 'reset' → 'intro'
let phase = 'intro';
let frameCounter = 0;       // frames elapsed in current phase

/** @type {{ s1: import('p5').Image | null; s2: import('p5').Image | null; s3: import('p5').Image | null; banner: import('p5').Image | null }} */
let victorySprites = {
  s1: null,
  s2: null,
  s3: null,
  banner: null,
};

/** Crisis hint bubbles (same PNGs as sheep calming cues); set from main after preload. */
let hintCueSprites = {
  feeding: null,
  petting: null,
  voice: null,
};

// -- Public API --

export function setVictoryCelebrationSprites(sprites) {
  victorySprites = { ...victorySprites, ...sprites };
}

/** @param {{ feeding?: import('p5').Image | null; petting?: import('p5').Image | null; voice?: import('p5').Image | null }} imgs */
export function setCrisisHintCueSprites(imgs) {
  hintCueSprites = {
    feeding: imgs.feeding ?? null,
    petting: imgs.petting ?? null,
    voice: imgs.voice ?? null,
  };
}

/** Skip win outro early (keyboard). */
export function skipVictoryToReset() {
  if (phase !== 'win') return false;
  phase = 'reset';
  frameCounter = 0;
  return true;
}

export function getPhase() {
  return phase;
}

export function getFrameCounter() {
  return frameCounter;
}

/**
 * Online guest: follow the host’s session clock (intro / playing / win / reset).
 * @param {'intro' | 'playing' | 'win' | 'reset'} nextPhase
 */
export function applyNetworkPhase(nextPhase, nextFrameCounter) {
  const prev = phase;
  phase = nextPhase;
  frameCounter = Math.max(0, Math.floor(nextFrameCounter || 0));
  if (nextPhase === 'win' && prev !== 'win') {
    lockVictorySheepPositions();
  }
}

export function startSession() {
  phase = 'intro';
  frameCounter = 0;
  resetIdleHerd();
  spawnFlock();
}

/** Manual reset — triggers fade-to-black then restarts. */
export function resetSession() {
  if (phase === 'reset' || phase === 'intro') return;
  phase = 'reset';
  frameCounter = 0;
}

/**
 * Demo helper: instantly trigger the full victory scene by marking every
 * sheep captured. Next update() tick takes the normal win path (mute kids
 * music, play trumpet + kids laughing, render drawWin with confetti /
 * sparkles / banner), so the demo matches a real completion exactly.
 * Fast-forwards the intro if needed so the capture check actually runs.
 */
export function forceVictory() {
  if (phase === 'win' || phase === 'reset') return;
  if (phase === 'intro') {
    phase = 'playing';
    frameCounter = 0;
  }
  const flock = getFlock();
  if (flock.length === 0) return;
  for (const s of flock) s.captured = true;
}

export function update() {
  frameCounter++;

  if (phase === 'intro') {
    if (frameCounter >= SESSION.introDuration) {
      phase = 'playing';
      frameCounter = 0;
    }
  } else if (phase === 'playing') {
    // Check win
    const flock = getFlock();
    const allCaptured = flock.length > 0 && flock.every((s) => s.captured);
    if (allCaptured) {
      lockVictorySheepPositions();
      phase = 'win';
      frameCounter = 0;
      muteTrackTemp('kids', true);
      playSfx('trumpet');
      playSfx('kidsLaugh');
      return;
    }
  } else if (phase === 'win') {
    if (frameCounter >= SESSION.outroDuration) {
      phase = 'reset';
      frameCounter = 0;
    }
  } else if (phase === 'reset') {
    if (frameCounter >= SESSION.resetPause) {
      phase = 'intro';
      frameCounter = 0;
      muteTrackTemp('kids', false);
      resetIdleHerd();
      spawnFlock();
    }
  }
}

// -- Drawing --

export function drawOverlay(p, canvasSize) {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  if (phase === 'intro') {
    drawIntro(p, canvasSize, cx, cy);
  } else if (phase === 'playing') {
    drawHints(p, canvasSize);
  } else if (phase === 'win') {
    drawWin(p, canvasSize, cx, cy);
  } else if (phase === 'reset') {
    drawResetFade(p, canvasSize);
  }
}

function drawIntro(p, s, cx, cy) {
  const progress = frameCounter / SESSION.introDuration;

  // Fade in from black
  const fadeAlpha = Math.max(0, 1 - progress * 2); // fades out in first half
  if (fadeAlpha > 0) {
    p.noStroke();
    p.fill(0, 0, 0, fadeAlpha * 255);
    p.rect(0, 0, s, s);
  }

  // Animated arrow pointing toward pen
  if (progress > 0.3) {
    const arrowAlpha = Math.min(1, (progress - 0.3) * 3) * 200;
    const bounce = Math.sin(frameCounter * 0.08) * 8;

    // Draw several arrows pointing inward from different angles
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
      const dist = s * 0.18 + bounce;
      const ax = cx + Math.cos(angle) * dist;
      const ay = cy + Math.sin(angle) * dist;

      p.push();
      p.translate(ax, ay);
      p.rotate(angle + Math.PI); // point toward center

      p.fill(255, 255, 255, arrowAlpha);
      p.noStroke();
      const ar = s * 0.02;
      p.triangle(ar, 0, -ar * 0.6, -ar * 0.5, -ar * 0.6, ar * 0.5);
      p.pop();
    }
  }

  // Sheep icon in center (pen goal indicator)
  if (progress > 0.5) {
    const iconAlpha = Math.min(1, (progress - 0.5) * 4) * 220;
    p.noStroke();
    // Small sheep silhouette
    p.fill(255, 255, 255, iconAlpha);
    p.ellipse(cx, cy - s * 0.005, s * 0.03, s * 0.025);
    // Tiny face
    p.fill(80, 80, 80, iconAlpha);
    p.ellipse(cx + s * 0.01, cy - s * 0.005, s * 0.012, s * 0.01);
  }
}

function drawHints(p, s) {
  const flock = getFlock();

  for (const sheep of flock) {
    if (sheep.captured) continue;
    if (sheep.stress < SHEEP_CFG.crisisThreshold) continue;
    if (!sheep._crisisFrames || sheep._crisisFrames < SHEEP_CFG.crisisHintDelay) continue;

    // Draw hint bubble near this sheep
    const px = sheep.x * s;
    const py = sheep.y * s;
    const bubbleY = py - SHEEP_CFG.radius * s * 2.5;
    const bob = Math.sin(frameCounter * 0.06 + sheep.id) * 4;

    p.push();
    p.translate(px, bubbleY + bob);

    // One cue at a time, cycling: grass → pet → voice → … (~1.5s each at 60fps)
    const cueCycle = [
      hintCueSprites.feeding,
      hintCueSprites.petting,
      hintCueSprites.voice,
    ].filter((img) => img && img.width > 2 && img.height > 2);

    if (cueCycle.length > 0) {
      const HINT_CYCLE_FRAMES = 90;
      const cueImg = cueCycle[Math.floor(frameCounter / HINT_CYCLE_FRAMES) % cueCycle.length];
      const maxSide = s * 0.078;
      const sc = Math.min(maxSide / cueImg.width, maxSide / cueImg.height);
      const iw = cueImg.width * sc;
      const ih = cueImg.height * sc;
      p.imageMode(p.CENTER);
      p.image(cueImg, 0, 0, iw, ih);
    }

    p.pop();
  }
}

function easeOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

function drawWin(p, s, cx, cy) {
  const outro = SESSION.outroDuration;
  const t = frameCounter * 0.05;
  const R = TABLE_RADIUS * s;
  const burst = easeOutCubic(Math.min(1, frameCounter / 18));

  const ctx = p.drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.985, 0, Math.PI * 2);
  ctx.clip();

  // Very light vignette — world VFX carries the win; keep pen/sheep readable
  p.noStroke();
  p.fill(18, 38, 22, 12 * burst);
  p.rect(0, 0, s, s);

  ctx.restore();

  if (frameCounter > 8 && frameCounter < outro - 28) {
    const w = Math.sin(t * 4) * 0.5 + 0.5;
    p.fill(255, 252, 230, 38 * w * burst);
    p.noStroke();
    for (let k = 0; k < 14; k++) {
      const ang = (k / 14) * Math.PI * 2 + t * 1.05;
      const rr = R * (0.91 + 0.016 * Math.sin(t * 2 + k));
      drawStar(p, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, s * 0.0052 * (0.85 + (k % 3) * 0.08));
    }
  }
}

function drawResetFade(p, s) {
  const progress = frameCounter / SESSION.resetPause;
  p.noStroke();
  p.fill(0, 0, 0, progress * 255);
  p.rect(0, 0, s, s);
}

function drawStar(p, x, y, size) {
  p.push();
  p.translate(x, y);
  p.noStroke();
  // 4-pointed star
  p.beginShape();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? size : size * 0.4;
    p.vertex(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  p.endShape(p.CLOSE);
  p.pop();
}
