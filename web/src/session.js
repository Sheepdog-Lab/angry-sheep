import { SESSION, TABLE_RADIUS, SHEEP as SHEEP_CFG } from './config.js';
import { spawnFlock, getFlock } from './sheep.js';
import * as Input from './input.js';

// States: 'intro' → 'playing' → 'win' | 'timeout' → 'reset' → 'intro'
let phase = 'intro';
let frameCounter = 0;       // frames elapsed in current phase
let timerFrames = 0;         // frames elapsed during 'playing' phase

// -- Public API --

export function getPhase() {
  return phase;
}

export function getTimerSeconds() {
  const elapsed = timerFrames / 60;
  return Math.max(0, SESSION.timerSeconds - elapsed);
}

export function startSession(p) {
  phase = 'intro';
  frameCounter = 0;
  timerFrames = 0;
  spawnFlock();
  Input.init(p, Math.min(p.windowWidth, p.windowHeight));
}

export function update() {
  frameCounter++;

  if (phase === 'intro') {
    if (frameCounter >= SESSION.introDuration) {
      phase = 'playing';
      frameCounter = 0;
    }
  } else if (phase === 'playing') {
    timerFrames++;

    // Check win
    const flock = getFlock();
    const allCaptured = flock.length > 0 && flock.every((s) => s.captured);
    if (allCaptured) {
      phase = 'win';
      frameCounter = 0;
      return;
    }

    // Check timeout
    if (timerFrames >= SESSION.timerSeconds * 60) {
      phase = 'timeout';
      frameCounter = 0;
    }
  } else if (phase === 'win' || phase === 'timeout') {
    if (frameCounter >= SESSION.outroDuration) {
      phase = 'reset';
      frameCounter = 0;
    }
  } else if (phase === 'reset') {
    if (frameCounter >= SESSION.resetPause) {
      phase = 'intro';
      frameCounter = 0;
      timerFrames = 0;
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
    drawTimer(p, canvasSize);
    drawHints(p, canvasSize);
  } else if (phase === 'win') {
    drawWin(p, canvasSize, cx, cy);
  } else if (phase === 'timeout') {
    drawTimeout(p, canvasSize, cx, cy);
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

function drawTimer(p, s) {
  const remaining = getTimerSeconds();
  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Timer arc at top-center
  const timerCx = s / 2;
  const timerCy = s * 0.06;
  const timerR = s * 0.035;
  const progress = 1 - remaining / SESSION.timerSeconds;

  // Background circle
  p.noFill();
  p.stroke(255, 255, 255, 40);
  p.strokeWeight(3);
  p.ellipse(timerCx, timerCy, timerR * 2);

  // Progress arc (depleting)
  const urgent = remaining < 30;
  p.stroke(urgent ? p.color(255, 80, 80, 200) : p.color(255, 255, 255, 150));
  p.strokeWeight(3);
  p.arc(timerCx, timerCy, timerR * 2, timerR * 2,
    -Math.PI / 2,
    -Math.PI / 2 + (1 - progress) * Math.PI * 2);

  // Time text
  p.noStroke();
  p.fill(urgent ? p.color(255, 100, 100) : p.color(255, 255, 255, 180));
  p.textSize(s * 0.022);
  p.textAlign(p.CENTER, p.CENTER);
  p.text(timeStr, timerCx, timerCy + timerR + s * 0.02);
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

function drawWin(p, s, cx, cy) {
  const progress = Math.min(1, frameCounter / (SESSION.outroDuration * 0.6));
  const t = frameCounter * 0.05;

  // Green glow
  const pulse = Math.sin(t) * 0.3 + 0.7;
  p.noStroke();
  p.fill(100, 220, 100, 50 * pulse * progress);
  p.ellipse(cx, cy, s * 0.6 * pulse);

  // Sparkles expanding outward
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + t * 0.7;
    const dist = s * (0.05 + progress * 0.15 + 0.03 * Math.sin(t * 2 + i));
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;
    const size = (4 + Math.sin(t * 3 + i) * 2) * progress;
    p.fill(255, 255, 150, 220 * progress);
    p.noStroke();
    // Star shape
    drawStar(p, sx, sy, size);
  }

  // Big stars
  if (progress > 0.4) {
    const starAlpha = Math.min(1, (progress - 0.4) * 3) * 255;
    p.fill(255, 240, 100, starAlpha);
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + t * 0.3;
      const dist = s * 0.08;
      drawStar(p, cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 8);
    }
  }
}

function drawTimeout(p, s, cx, cy) {
  const progress = Math.min(1, frameCounter / (SESSION.outroDuration * 0.5));

  // Gentle fade overlay
  p.noStroke();
  p.fill(0, 0, 0, 80 * progress);
  p.rect(0, 0, s, s);

  // Hourglass icon
  if (progress > 0.2) {
    const alpha = Math.min(1, (progress - 0.2) * 3) * 200;
    const iconSize = s * 0.04;

    p.push();
    p.translate(cx, cy);

    // Top triangle
    p.fill(255, 255, 255, alpha);
    p.noStroke();
    p.triangle(-iconSize, -iconSize, iconSize, -iconSize, 0, 0);
    // Bottom triangle
    p.triangle(-iconSize, iconSize, iconSize, iconSize, 0, 0);
    // Frame lines
    p.stroke(255, 255, 255, alpha);
    p.strokeWeight(2);
    p.line(-iconSize * 1.2, -iconSize, iconSize * 1.2, -iconSize);
    p.line(-iconSize * 1.2, iconSize, iconSize * 1.2, iconSize);

    p.pop();
  }

  // "Try again" arrow (circular)
  if (progress > 0.6) {
    const arrowAlpha = Math.min(1, (progress - 0.6) * 3) * 180;
    p.noFill();
    p.stroke(255, 255, 255, arrowAlpha);
    p.strokeWeight(2.5);
    const arrowR = s * 0.06;
    p.arc(cx, cy + s * 0.08, arrowR, arrowR, -Math.PI * 0.8, Math.PI * 0.5);
    // Arrowhead
    const tipAngle = Math.PI * 0.5;
    const tipX = cx + Math.cos(tipAngle) * arrowR * 0.5;
    const tipY = cy + s * 0.08 + Math.sin(tipAngle) * arrowR * 0.5;
    p.fill(255, 255, 255, arrowAlpha);
    p.noStroke();
    p.triangle(tipX, tipY, tipX - 5, tipY - 6, tipX + 5, tipY - 3);
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
