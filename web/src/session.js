import { SESSION, TABLE_RADIUS, SHEEP as SHEEP_CFG } from './config.js';
import { spawnFlock, getFlock } from './sheep.js';
import { playSfx, muteTrackTemp } from './sound.js';

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

// -- Public API --

export function setVictoryCelebrationSprites(sprites) {
  victorySprites = { ...victorySprites, ...sprites };
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

export function startSession() {
  phase = 'intro';
  frameCounter = 0;
  spawnFlock();
}

/** Manual reset — triggers fade-to-black then restarts. */
export function resetSession() {
  if (phase === 'reset' || phase === 'intro') return;
  phase = 'reset';
  frameCounter = 0;
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

    // Bubble background
    p.fill(255, 255, 255, 210);
    p.noStroke();
    p.ellipse(0, 0, s * 0.05, s * 0.04);

    // Alternate between grass and pet hint icons
    const showGrass = (Math.floor(frameCounter / 90) % 2) === 0;
    if (showGrass) {
      // Grass icon
      p.stroke('#4caf50');
      p.strokeWeight(2);
      p.line(0, s * 0.006, 0, -s * 0.01);
      p.line(0, 0, -s * 0.006, -s * 0.008);
      p.line(0, 0, s * 0.006, -s * 0.008);
    } else {
      // Hand/pet icon (open palm)
      p.noStroke();
      p.fill('#e89040');
      p.ellipse(0, 0, s * 0.018, s * 0.015);
      // Fingers
      for (let i = -2; i <= 1; i++) {
        p.ellipse(i * s * 0.004, -s * 0.01, s * 0.005, s * 0.01);
      }
    }

    p.pop();
  }
}

/**
 * Victory composition — positions are fractions of play diameter `D` from table center.
 * Tune here: spacing, scale, facing.
 */
const VICTORY_LAYOUT = {
  clusterOffsetY: 0.03,
  groundYFactor: 0.11,
  s1: { xFactor: -0.175, heightFactor: 0.15, mirrorX: false },
  s2: { xFactor: 0.145, heightFactor: 0.15, mirrorX: false },
  s3: { heightFactor: 0.205, hopPeriodFrames: 46, jumpAmpFactor: 0.105 },
};

/** Bottom banner: width vs canvas; max height vs table radius (natural aspect, no awkward crop). */
const VICTORY_BANNER_LAYOUT = {
  maxWidthFrac: 0.88,
  maxHeightFracOfR: 0.46,
  bottomEdgeFromCenterR: 0.93,
};

const VICTORY_CONFETTI_COUNT = 88;
const VICTORY_SPARKLE_COUNT = 18;
const VICTORY_CLUSTER_SPARKLE_COUNT = 14;
const VICTORY_FLOAT_PARTICLE_COUNT = 28;

function easeOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/** Draw sprite scaled to height; feet on groundY; anchor bottom-center. */
function drawVictoryCharacter(
  p,
  img,
  footX,
  groundY,
  targetH,
  {
    flipX = false,
    extraY = 0,
    scaleX = 1,
    scaleY = 1,
    rotateRad = 0,
  } = {},
) {
  if (!img || !img.width) return;
  const baseSc = targetH / img.height;
  const w = img.width * baseSc * scaleX;
  const h = img.height * baseSc * scaleY;
  p.push();
  p.blendMode(p.BLEND);
  p.noTint();
  p.translate(footX, groundY + extraY);
  p.rotate(rotateRad);
  if (flipX) p.scale(-1, 1);
  p.imageMode(p.CENTER);
  p.image(img, 0, -h / 2, w, h);
  p.pop();
}

function fract(x) {
  return x - Math.floor(x);
}

/** Confetti — mostly around the sheep cluster, rest across the disc; vibrant, readable. */
function drawVictoryConfettiBackdrop(p, cx, cy, cyCluster, R, frame, palette) {
  const D = R * 2;
  const clusterPortion = 0.82;
  for (let i = 0; i < VICTORY_CONFETTI_COUNT; i++) {
    const seed = i * 12.9898;
    const r1 = fract(Math.sin(seed) * 43758.5453);
    const r2 = fract(Math.sin(seed + 19.19) * 43758.5453);
    const r3 = fract(Math.sin(seed + 31.7) * 43758.5453);
    const r4 = fract(Math.sin(seed + 5.2) * 43758.5453);

    let px;
    let py;
    if (i < VICTORY_CONFETTI_COUNT * clusterPortion) {
      const ang = r1 * Math.PI * 2;
      const rad = (0.1 + Math.sqrt(r2) * 0.62) * R;
      px = cx + Math.cos(ang) * rad;
      py = cyCluster + Math.sin(ang) * rad * 0.9 - D * 0.04;
    } else {
      const ang = r3 * Math.PI * 2;
      const rad = Math.sqrt(r4) * R * 0.93;
      px = cx + Math.cos(ang) * rad;
      py = cy + Math.sin(ang) * rad;
    }

    const layer = i % 3;
    const spd = 0.22 + r3 * 0.28 + layer * 0.06;
    const life = (frame * spd + i * 17.3) % 420;
    const spiral = Math.sin(life * 0.031 + seed) * R * 0.028;
    const wobbleX =
      Math.sin(life * 0.062 + seed) * R * 0.045 +
      Math.cos(life * 0.018 + r4 * 10) * R * 0.022 +
      spiral * Math.cos(r1 * Math.PI * 2 + life * 0.01);
    const wobbleY =
      Math.sin(life * 0.051 + seed * 1.7) * R * 0.038 +
      (life % 260) * R * 0.00125 * (0.55 + (i % 5) * 0.18) +
      spiral * Math.sin(r1 * Math.PI * 2 + life * 0.01);
    px += wobbleX;
    py += wobbleY;

    if (Math.hypot(px - cx, py - cy) > R * 0.98) continue;

    const rot =
      life * (0.042 + layer * 0.012) * (i % 2 === 0 ? 1 : -1) +
      seed * 0.4 +
      Math.sin(life * 0.08) * 0.25;
    const [cr, cg, cb] = palette[i % palette.length];
    const depthFade = 0.82 + layer * 0.08;
    const ca = (50 + (i % 6) * 12) * depthFade;
    const size = D * (0.0088 + (i % 7) * 0.0021 + layer * 0.0009);
    p.push();
    p.translate(px, py);
    p.rotate(rot);
    p.noStroke();
    p.fill(cr, cg, cb, ca);
    p.rectMode(p.CENTER);
    if (i % 3 === 0) p.rect(0, 0, size * 1.35, size * 0.85);
    else if (i % 3 === 1) p.rect(0, 0, size * 0.75, size * 1.2);
    else p.ellipse(0, 0, size * 1.1, size * 1.1);
    p.pop();
  }
}

function drawVictorySoftSparkles(p, cx, cy, R, t) {
  const D = R * 2;
  for (let i = 0; i < VICTORY_SPARKLE_COUNT; i++) {
    const seed = i * 8.77 + 2.1;
    const r1 = fract(Math.sin(seed) * 43758.5453);
    const r2 = fract(Math.sin(seed + 3.1) * 43758.5453);
    const ang = r1 * Math.PI * 2 + t * 0.15 * (0.5 + (i % 4) * 0.2);
    const dist = Math.sqrt(r2) * R * 0.9;
    const tw = 0.4 + 0.6 * Math.sin(t * 3.8 + i * 1.2);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.1 + i * 0.7);
    const sx = cx + Math.cos(ang) * dist + Math.sin(t * 2.1 + i) * R * 0.02;
    const sy = cy + Math.sin(ang) * dist + Math.cos(t * 1.85 + i * 0.9) * R * 0.018;
    p.fill(255, 248, 220, (16 + 26 * tw) * (0.45 + 0.55 * pulse));
    p.noStroke();
    drawStar(p, sx, sy, D * 0.007 * (0.8 + (i % 4) * 0.14) * tw);
  }
}

/** Warm magical sparkles hugging the sheep cluster (not full-disc). */
function drawVictoryClusterSparkles(p, cx, cyCluster, D, t) {
  for (let i = 0; i < VICTORY_CLUSTER_SPARKLE_COUNT; i++) {
    const seed = i * 5.91 + 0.7;
    const a = (i / VICTORY_CLUSTER_SPARKLE_COUNT) * Math.PI * 2 + t * 0.95 + seed * 0.2;
    const r = D * (0.12 + 0.1 * Math.sin(t * 1.4 + i * 0.6));
    const sx = cx + Math.cos(a) * r;
    const sy = cyCluster - D * 0.07 + Math.sin(a) * r * 0.72;
    const tw = 0.5 + 0.5 * Math.sin(t * 4.2 + i * 1.1);
    const pulse = 0.55 + 0.45 * Math.sin(t * 1.05 + i * 0.85);
    p.noStroke();
    p.fill(255, 252, 225, (42 + 55 * tw) * pulse);
    drawStar(p, sx, sy, D * 0.01 * (0.9 + (i % 3) * 0.08));
    p.fill(255, 230, 160, (18 + 22 * tw) * pulse * 0.55);
    drawStar(p, sx + D * 0.004 * Math.sin(t + i), sy - D * 0.003, D * 0.0048 * tw);
  }
}

/** Soft motes — very subtle float, mostly mid-disc. */
function drawVictoryFloatingParticles(p, cx, cyCluster, R, frame) {
  const D = R * 2;
  for (let i = 0; i < VICTORY_FLOAT_PARTICLE_COUNT; i++) {
    const seed = i * 21.13 + 4.2;
    const r1 = fract(Math.sin(seed) * 43758.5453);
    const r2 = fract(Math.sin(seed + 1.7) * 43758.5453);
    const ang = r1 * Math.PI * 2;
    const rad = Math.sqrt(r2) * R * 0.72;
    const baseX = cx + Math.cos(ang) * rad;
    const baseY = cyCluster + Math.sin(ang) * rad * 0.85;
    const drift = (frame * (0.22 + (i % 5) * 0.06) + seed * 40) % 500;
    const py = baseY - (drift % 180) * R * 0.0018 + Math.sin(drift * 0.04 + i) * R * 0.012;
    const px = baseX + Math.sin(drift * 0.035 + seed) * R * 0.025;
    if (Math.hypot(px - cx, py - cyCluster) > R * 0.92) continue;
    const a = 14 + (i % 5) * 7;
    const sz = D * (0.003 + (i % 4) * 0.0008);
    p.noStroke();
    p.fill(255, 252, 235, a);
    p.ellipse(px, py, sz, sz * 1.1);
    p.fill(255, 245, 210, a * 0.45);
    p.ellipse(px - sz * 0.2, py - sz * 0.15, sz * 0.45, sz * 0.45);
  }
}

/** Warm layered glow behind the sheep cluster (in-world, not a card). */
function drawVictoryClusterGlow(p, cx, cyCluster, D, t, burst) {
  const wobble = 0.88 + 0.12 * Math.sin(t * 1.15);
  p.noStroke();
  p.fill(255, 248, 210, 14 * burst * wobble);
  p.ellipse(cx, cyCluster - D * 0.05, D * 0.62 * wobble, D * 0.36 * wobble);
  p.fill(255, 230, 190, 10 * burst * (0.9 + 0.1 * Math.sin(t * 0.9)));
  p.ellipse(cx, cyCluster - D * 0.04, D * 0.48, D * 0.28);
  p.fill(200, 235, 255, 8 * burst * (0.85 + 0.15 * Math.sin(t * 1.4 + 0.5)));
  p.ellipse(cx + D * 0.02, cyCluster - D * 0.06, D * 0.35, D * 0.22);
}

/** Shepherd + sign PNG — bottom-centered in the play disc, natural aspect ratio. */
function drawVictoryBannerBottom(p, img, cx, cy, s, R, burst) {
  if (!img || !img.width) return;
  const maxW = Math.min(s * VICTORY_BANNER_LAYOUT.maxWidthFrac, R * 1.86);
  let sc = maxW / img.width;
  let w = img.width * sc;
  let h = img.height * sc;
  const maxH = R * VICTORY_BANNER_LAYOUT.maxHeightFracOfR;
  if (h > maxH) {
    sc = maxH / img.height;
    w = img.width * sc;
    h = img.height * sc;
  }
  const bottomY = cy + R * VICTORY_BANNER_LAYOUT.bottomEdgeFromCenterR;
  const cyImg = bottomY - h * 0.5;
  p.push();
  p.blendMode(p.BLEND);
  p.noTint();
  p.imageMode(p.CENTER);
  const ctx = p.drawingContext;
  const prevA = ctx.globalAlpha;
  ctx.globalAlpha = burst;
  p.image(img, cx, cyImg, w, h);
  ctx.globalAlpha = prevA;
  p.pop();
}

function drawWin(p, s, cx, cy) {
  const outro = SESSION.outroDuration;
  const t = frameCounter * 0.05;
  const R = TABLE_RADIUS * s;
  const D = R * 2;
  const burst = easeOutCubic(Math.min(1, frameCounter / 28));

  const cyCluster = cy + D * VICTORY_LAYOUT.clusterOffsetY;
  const groundY = cy + R * VICTORY_LAYOUT.groundYFactor;

  const palette = [
    [255, 62, 138],
    [48, 172, 255],
    [255, 208, 40],
    [68, 210, 118],
    [255, 255, 255],
  ];

  const ctx = p.drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.985, 0, Math.PI * 2);
  ctx.clip();

  // Light grass tint, then subtle dim so characters + confetti read clearly
  p.noStroke();
  p.fill(20, 45, 22, 18 * burst);
  p.rect(0, 0, s, s);
  p.fill(10, 18, 28, 26 * burst);
  p.rect(0, 0, s, s);

  drawVictoryConfettiBackdrop(p, cx, cy, cyCluster, R, frameCounter, palette);
  drawVictoryClusterGlow(p, cx, cyCluster, D, t, burst);
  drawVictoryFloatingParticles(p, cx, cyCluster, R, frameCounter);
  drawVictorySoftSparkles(p, cx, cy, R, t);
  drawVictoryClusterSparkles(p, cx, cyCluster, D, t);

  const { s1, s2, s3, banner } = victorySprites;

  drawVictoryBannerBottom(p, banner, cx, cy, s, R, burst);

  const idleA = Math.sin(t * 1.85) * D * 0.016;
  const idleB = Math.sin(t * 1.68 + 1.2) * D * 0.014;
  const sway1 = Math.sin(t * 2.25) * 0.042;
  const sway2 = Math.sin(t * 2.08 + 0.8) * 0.039;
  const breath1 = 1 + Math.sin(t * 2.55) * 0.024;
  const breath2 = 1 + Math.sin(t * 2.38 + 0.5) * 0.022;

  const hopAng = (frameCounter / VICTORY_LAYOUT.s3.hopPeriodFrames) * Math.PI * 2;
  const hop = Math.abs(Math.sin(hopAng));
  const jumpLift = -hop * D * VICTORY_LAYOUT.s3.jumpAmpFactor;
  const squashY = 1 - 0.078 * hop;
  const stretchX = 1 + 0.064 * hop;

  drawVictoryCharacter(p, s1, cx + D * VICTORY_LAYOUT.s1.xFactor, groundY, D * VICTORY_LAYOUT.s1.heightFactor * breath1, {
    flipX: VICTORY_LAYOUT.s1.mirrorX,
    extraY: idleA,
    rotateRad: sway1,
  });

  drawVictoryCharacter(p, s2, cx + D * VICTORY_LAYOUT.s2.xFactor, groundY, D * VICTORY_LAYOUT.s2.heightFactor * breath2, {
    flipX: VICTORY_LAYOUT.s2.mirrorX,
    extraY: idleB,
    rotateRad: sway2,
  });

  drawVictoryCharacter(p, s3, cx, groundY, D * VICTORY_LAYOUT.s3.heightFactor, {
    extraY: jumpLift,
    scaleX: stretchX,
    scaleY: squashY,
  });

  ctx.restore();

  // Rim twinkles (outside clip)
  if (frameCounter > 12 && frameCounter < outro - 25) {
    const w = Math.sin(t * 4) * 0.5 + 0.5;
    p.fill(255, 255, 240, 34 * w * burst);
    p.noStroke();
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2 + t * 1.1;
      const rr = R * (0.9 + 0.02 * Math.sin(t * 2 + k));
      drawStar(p, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, s * 0.0045 * (0.85 + (k % 3) * 0.08));
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
