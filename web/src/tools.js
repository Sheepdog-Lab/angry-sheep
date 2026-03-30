import { TOOL_COLORS, TOOL_SIZES, TOOL_HIT_RADIUS } from './config.js';
import { SHEEP } from './config.js';

/** @type {import('p5').Image | null} */
let sheepdogSprite = null;
/** @type {import('p5').Image | null} */
let blockSprite = null;
/** @type {import('p5').Image | null} */
let grassSprite = null;
/** @type {import('p5').Image | null} */
let grassSpriteTransparent = null;
let grassProcessedKey = null;

// Store per-tool animated aiming angle (radians) so rotation is smooth.
/** @type {Map<number, number>} */
const sheepdogAimRadById = new Map();

function lerpAngleRad(a, b, t) {
  // Shortest-path angular interpolation.
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

/**
 * @param {import('p5').Image | null} img
 */
export function setSheepdogSprite(img) {
  sheepdogSprite = img;
}

/**
 * @param {import('p5').Image | null} img
 */
export function setBlockSprite(img) {
  blockSprite = img;
}

/**
 * @param {import('p5').Image | null} img
 */
export function setGrassSprite(img) {
  grassSprite = img;
  grassSpriteTransparent = null; // recompute transparency if a new image is loaded
  grassProcessedKey = null;
}

/**
 * Draw all tools on the canvas.
 * @param {object} p - p5 instance
 * @param {Array} tools - array of { type, id, x, y, angle_deg }
 * @param {number} canvasSize
 * @param {number|null} hoveredId - id of tool under the mouse (gets highlight)
 */
export function drawTools(p, tools, canvasSize, hoveredId, flock) {
  for (const tool of tools) {
    const px = tool.x * canvasSize;
    const py = tool.y * canvasSize;
    const color = TOOL_COLORS[tool.type] || '#ffffff';
    const isHovered = tool.id === hoveredId;

    p.push();
    p.translate(px, py);

    // If a sheep is near, rotate the dog toward it (visual-only).
    // We keep `tool.angle_deg` as the default and smoothly steer the sprite.
    let rotDeg = tool.angle_deg;
    if (tool.type === 'sheepdog') {
      const defaultRad = p.radians(tool.angle_deg);
      let currentRad = sheepdogAimRadById.has(tool.id)
        ? sheepdogAimRadById.get(tool.id)
        : defaultRad;

      let targetRad = defaultRad;
      let proximity = 0;

      if (Array.isArray(flock) && flock.length > 0) {
      const dogNx = tool.x;
      const dogNy = tool.y;

      let best = null;
      let bestDist = Infinity;
      for (const sh of flock) {
        // normalized distance (0..1 space)
        const dx = sh.x - dogNx;
        const dy = sh.y - dogNy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          best = sh;
        }
      }

        if (best && bestDist < SHEEP.dogFleeRadius) {
          const dx = best.x - dogNx;
          const dy = best.y - dogNy;
          // +x is 0deg in our tool coordinate convention.
          targetRad = Math.atan2(dy, dx);
          proximity = 1 - bestDist / SHEEP.dogFleeRadius; // 0..1
        }
      }

      const steerAlpha = 0.06 + proximity * 0.20; // faster when close
      currentRad = lerpAngleRad(currentRad, targetRad, steerAlpha);
      sheepdogAimRadById.set(tool.id, currentRad);
      rotDeg = (currentRad * 180) / Math.PI;
    }

    p.rotate(p.radians(rotDeg));

    // Hover glow
    if (isHovered) {
      p.noFill();
      p.stroke(255, 255, 255, 100);
      p.strokeWeight(3);
      p.ellipse(0, 0, TOOL_HIT_RADIUS * canvasSize * 2);
    }

    if (tool.type === 'block') {
      p.noStroke();
      p.fill(color);
      drawBlock(p, canvasSize);
    } else if (tool.type === 'sheepdog') {
      drawSheepdog(p, canvasSize);
    } else if (tool.type === 'grass') {
      p.noStroke();
      p.fill(color);
      drawGrass(p, canvasSize);
    }

    p.pop();
  }
}

function drawBlock(p, s) {
  const w = TOOL_SIZES.block.w * s;
  const h = TOOL_SIZES.block.h * s;
  if (blockSprite && blockSprite.width > 0) {
    p.push();
    p.imageMode(p.CENTER);
    const iw = blockSprite.width;
    const ih = blockSprite.height;
    const scale = Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    p.image(blockSprite, 0, 0, dw, dh);
    p.pop();
    return;
  }

  p.rectMode(p.CENTER);
  p.rect(0, 0, w, h, 3);
  // Wood grain lines
  p.stroke(0, 0, 0, 40);
  p.strokeWeight(1);
  p.line(-w * 0.35, 0, w * 0.35, 0);
}

function drawSheepdog(p, s) {
  const r = TOOL_SIZES.sheepdog * s;
  // Gentle idle animation so the dog doesn't look stiff.
  const t = p.frameCount;
  const bobY = Math.sin(t * 0.08) * r * 0.06;
  const tilt = Math.sin(t * 0.05) * 0.08; // small radians
  const tailWag = Math.sin(t * 0.11) * r * 0.06;

  if (sheepdogSprite && sheepdogSprite.width > 0) {
    p.push();
    // PNG faces “up”; tool convention is forward = +x after parent rotate(angle_deg)
    p.rotate(Math.PI / 2);
    // Body bob + tiny wiggle
    p.translate(0, bobY);
    p.rotate(tilt);
    // Slight squash/stretch to imply tail/breathing motion
    const squash = 1 + Math.sin(t * 0.12) * 0.02;
    p.scale(squash, 1 - (squash - 1) * 0.7);
    const iw = sheepdogSprite.width;
    const ih = sheepdogSprite.height;
    const maxDim = r * 2.8;
    const scale = maxDim / Math.max(iw, ih);
    const w = iw * scale;
    const h = ih * scale;
    p.imageMode(p.CENTER);
    p.image(sheepdogSprite, 0, 0, w, h);
    p.pop();
    return;
  }

  p.push();
  // Body bob + tilt for procedural fallback
  p.translate(0, bobY);
  p.rotate(tilt);

  // Tiny limb/ear movement to avoid stiffness.
  const legSwing = Math.sin(t * 0.25) * r * 0.03;
  const earFlap = Math.sin(t * 0.18) * r * 0.03;

  // Fluffy tail (black with white tip)
  p.noStroke();
  p.fill('#1a1a1a');
  p.ellipse(-r * 0.95 + tailWag * 0.35, -r * 0.15 + tailWag, r * 0.45, r * 0.3);
  p.fill('#f0f0f0');
  p.ellipse(-r * 1.1 + tailWag * 0.35, -r * 0.2 + tailWag, r * 0.22, r * 0.16);

  // Legs — white paws on black legs
  const legX = [-r * 0.35, r * 0.2];
  for (const lx of legX) {
    // Black upper leg
    p.fill('#1a1a1a');
    p.ellipse(lx, r * 0.48 + legSwing, r * 0.22, r * 0.32);
    p.ellipse(lx, -r * 0.48 - legSwing, r * 0.22, r * 0.32);
    // White paws
    p.fill('#f0f0f0');
    p.ellipse(lx, r * 0.58 + legSwing, r * 0.16, r * 0.14);
    p.ellipse(lx, -r * 0.58 - legSwing, r * 0.16, r * 0.14);
  }

  // Body — black back
  p.fill('#1a1a1a');
  p.ellipse(-r * 0.1, 0, r * 1.6, r * 1.15);

  // White chest/belly blaze
  p.fill('#f0f0f0');
  p.ellipse(r * 0.25, 0, r * 0.7, r * 0.8);

  // White neck/collar stripe
  p.fill('#f0f0f0');
  p.ellipse(r * 0.35, 0, r * 0.35, r * 0.6);

  // Head — black base
  p.fill('#1a1a1a');
  p.ellipse(r * 0.55, 0, r * 0.85, r * 0.72);

  // White blaze down the center of the face
  p.fill('#f0f0f0');
  p.beginShape();
  p.vertex(r * 0.42, -r * 0.08);
  p.vertex(r * 0.85, -r * 0.05);
  p.vertex(r * 0.88, r * 0.05);
  p.vertex(r * 0.42, r * 0.08);
  p.endShape(p.CLOSE);

  // Snout — white/tan
  p.fill('#e8dcd0');
  p.ellipse(r * 0.82, r * 0.02, r * 0.34, r * 0.24);

  // Nose
  p.fill('#111');
  p.ellipse(r * 0.92, r * 0.01, r * 0.14, r * 0.1);

  // Eyes — alert, intense border collie stare
  p.fill('#4a2800');
  p.ellipse(r * 0.54, -r * 0.12, r * 0.16, r * 0.13);
  p.ellipse(r * 0.54, r * 0.12, r * 0.16, r * 0.13);
  // Pupils
  p.fill('#111');
  p.ellipse(r * 0.56, -r * 0.12, r * 0.09, r * 0.09);
  p.ellipse(r * 0.56, r * 0.12, r * 0.09, r * 0.09);
  // Eye shine
  p.fill(255, 255, 255, 200);
  p.ellipse(r * 0.55, -r * 0.13, r * 0.04, r * 0.04);
  p.ellipse(r * 0.55, r * 0.11, r * 0.04, r * 0.04);

  // Ears — semi-erect (slight flap)
  p.fill('#1a1a1a');
  // Left ear
  p.beginShape();
  p.vertex(r * 0.38, -r * 0.28 + earFlap);
  p.vertex(r * 0.52, -r * 0.42 + earFlap);
  p.vertex(r * 0.58, -r * 0.30 + earFlap);
  p.endShape(p.CLOSE);
  // Folded tip
  p.fill('#2a2a2a');
  p.triangle(
    r * 0.50,
    -r * 0.40 + earFlap,
    r * 0.56,
    -r * 0.34 + earFlap,
    r * 0.48,
    -r * 0.32 + earFlap,
  );
  // Right ear
  p.fill('#1a1a1a');
  p.beginShape();
  p.vertex(r * 0.38, r * 0.28 - earFlap);
  p.vertex(r * 0.52, r * 0.42 - earFlap);
  p.vertex(r * 0.58, r * 0.30 - earFlap);
  p.endShape(p.CLOSE);
  p.fill('#2a2a2a');
  p.triangle(
    r * 0.50,
    r * 0.40 - earFlap,
    r * 0.56,
    r * 0.34 - earFlap,
    r * 0.48,
    r * 0.32 - earFlap,
  );
  p.pop();
}

function drawGrass(p, s) {
  const r = TOOL_SIZES.grass * s;

  if (grassSprite && grassSprite.width > 0) {
    // Some provided grass PNGs include a black (non-transparent) background.
    // We preprocess once to convert near-black pixels to transparent.
    if (!grassSpriteTransparent) {
      const key = `${grassSprite.width}x${grassSprite.height}`;
      if (grassProcessedKey !== key) {
        grassProcessedKey = key;

        // eslint-disable-next-line no-unused-vars
        const cutoff = 35; // higher = remove more background, but may eat dark edges
        const g = p.createGraphics(grassSprite.width, grassSprite.height);
        g.pixelDensity(1);
        g.imageMode(p.CORNER);
        g.clear();
        g.image(grassSprite, 0, 0);
        g.loadPixels();

        for (let i = 0; i < g.pixels.length; i += 4) {
          const pr = g.pixels[i];
          const pg = g.pixels[i + 1];
          const pb = g.pixels[i + 2];

          // If the pixel is basically black, treat it as transparent.
          if (pr <= cutoff && pg <= cutoff && pb <= cutoff) {
            g.pixels[i + 3] = 0;
          }
        }

        g.updatePixels();
        grassSpriteTransparent = g;
      }
    }

    // Draw sprite with aspect-fit, centered on the tool origin.
    // Parent `drawTools()` already rotates by `angle_deg` for consistent tool direction.
    p.push();
    p.imageMode(p.CENTER);
    const src = grassSpriteTransparent && grassSpriteTransparent.width > 0 ? grassSpriteTransparent : grassSprite;
    const iw = src.width;
    const ih = src.height;
    const maxDim = r * 3.0;
    const scale = maxDim / Math.max(iw, ih);
    const w = iw * scale;
    const h = ih * scale;
    p.image(src, 0, 0, w, h);
    p.pop();
    return;
  }

  // Fallback (no sprite loaded): procedural blades.
  p.ellipse(0, 0, r * 2);
  p.stroke(TOOL_COLORS.grass);
  p.strokeWeight(2);
  const bladeH = r * 1.2;
  p.line(0, 0, 0, -bladeH);
  p.line(0, 0, -r * 0.6, -bladeH * 0.8);
  p.line(0, 0, r * 0.6, -bladeH * 0.8);
}

/**
 * Find the tool under a normalized (0-1) coordinate.
 * Returns the tool's id, or null if nothing is close enough.
 */
export function hitTest(tools, nx, ny) {
  let closestId = null;
  let closestDist = TOOL_HIT_RADIUS;

  for (const tool of tools) {
    const dx = tool.x - nx;
    const dy = tool.y - ny;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < closestDist) {
      closestDist = dist;
      closestId = tool.id;
    }
  }

  return closestId;
}
