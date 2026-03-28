import { TOOL_COLORS, TOOL_SIZES, TOOL_HIT_RADIUS } from './config.js';

/**
 * Draw all tools on the canvas.
 * @param {object} p - p5 instance
 * @param {Array} tools - array of { type, id, x, y, angle_deg }
 * @param {number} canvasSize
 * @param {number|null} hoveredId - id of tool under the mouse (gets highlight)
 */
export function drawTools(p, tools, canvasSize, hoveredId) {
  for (const tool of tools) {
    const px = tool.x * canvasSize;
    const py = tool.y * canvasSize;
    const color = TOOL_COLORS[tool.type] || '#ffffff';
    const isHovered = tool.id === hoveredId;

    p.push();
    p.translate(px, py);
    p.rotate(p.radians(tool.angle_deg));

    // Hover glow
    if (isHovered) {
      p.noFill();
      p.stroke(255, 255, 255, 100);
      p.strokeWeight(3);
      p.ellipse(0, 0, TOOL_HIT_RADIUS * canvasSize * 2);
    }

    p.noStroke();
    p.fill(color);

    if (tool.type === 'block') {
      drawBlock(p, canvasSize);
    } else if (tool.type === 'sheepdog') {
      drawSheepdog(p, canvasSize);
    } else if (tool.type === 'grass') {
      drawGrass(p, canvasSize);
    }

    p.pop();
  }
}

function drawBlock(p, s) {
  const w = TOOL_SIZES.block.w * s;
  const h = TOOL_SIZES.block.h * s;
  p.rectMode(p.CENTER);
  p.rect(0, 0, w, h, 3);
  // Wood grain lines
  p.stroke(0, 0, 0, 40);
  p.strokeWeight(1);
  p.line(-w * 0.35, 0, w * 0.35, 0);
}

function drawSheepdog(p, s) {
  const r = TOOL_SIZES.sheepdog * s;

  // Fluffy tail (black with white tip)
  p.noStroke();
  p.fill('#1a1a1a');
  p.ellipse(-r * 0.95, -r * 0.15, r * 0.45, r * 0.3);
  p.fill('#f0f0f0');
  p.ellipse(-r * 1.1, -r * 0.2, r * 0.22, r * 0.16);

  // Legs — white paws on black legs
  const legX = [-r * 0.35, r * 0.2];
  for (const lx of legX) {
    // Black upper leg
    p.fill('#1a1a1a');
    p.ellipse(lx, r * 0.48, r * 0.22, r * 0.32);
    p.ellipse(lx, -r * 0.48, r * 0.22, r * 0.32);
    // White paws
    p.fill('#f0f0f0');
    p.ellipse(lx, r * 0.58, r * 0.16, r * 0.14);
    p.ellipse(lx, -r * 0.58, r * 0.16, r * 0.14);
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
  p.ellipse(r * 0.55, -r * 0.13, r * 0.04);
  p.ellipse(r * 0.55, r * 0.11, r * 0.04);

  // Ears — semi-erect, tipped forward (classic border collie)
  p.fill('#1a1a1a');
  // Left ear
  p.beginShape();
  p.vertex(r * 0.38, -r * 0.28);
  p.vertex(r * 0.52, -r * 0.42);
  p.vertex(r * 0.58, -r * 0.30);
  p.endShape(p.CLOSE);
  // Folded tip
  p.fill('#2a2a2a');
  p.triangle(r * 0.50, -r * 0.40, r * 0.56, -r * 0.34, r * 0.48, -r * 0.32);
  // Right ear
  p.fill('#1a1a1a');
  p.beginShape();
  p.vertex(r * 0.38, r * 0.28);
  p.vertex(r * 0.52, r * 0.42);
  p.vertex(r * 0.58, r * 0.30);
  p.endShape(p.CLOSE);
  p.fill('#2a2a2a');
  p.triangle(r * 0.50, r * 0.40, r * 0.56, r * 0.34, r * 0.48, r * 0.32);
}

function drawGrass(p, s) {
  const r = TOOL_SIZES.grass * s;
  // Base circle
  p.ellipse(0, 0, r * 2);
  // Grass blades
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
