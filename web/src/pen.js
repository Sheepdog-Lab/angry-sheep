import { PEN } from './config.js';

/** @type {import('p5').Image | null} */
let penSprite = null;

/**
 * @param {import('p5').Image | null} img
 */
export function setPenSprite(img) {
  penSprite = img;
}

/**
 * Draw the pen/corral — PNG sprite when loaded, else procedural circle + gaps.
 */
export function drawPen(p, canvasSize) {
  const s = canvasSize;
  const cx = PEN.cx * s;
  const cy = PEN.cy * s;
  const r = PEN.radius * s;
  const sw = PEN.strokeWeight * s;

  // Light fill for the pen interior
  p.noStroke();
  p.fill(PEN.fillColor + '30');
  p.ellipse(cx, cy, r * 2);

  if (penSprite && penSprite.width > 0) {
    p.push();
    p.imageMode(p.CENTER);
    const iw = penSprite.width;
    const ih = penSprite.height;
    const maxDim = r * 2 * 0.98;
    const scale = maxDim / Math.max(iw, ih);
    const w = iw * scale;
    const h = ih * scale;
    p.image(penSprite, cx, cy, w, h);
    p.pop();
    return;
  }

  // Fallback: arc segments between the gaps
  p.noFill();
  p.stroke(PEN.strokeColor);
  p.strokeWeight(sw);
  p.strokeCap(p.ROUND);

  const wallSegments = getWallSegments(PEN.gaps);

  for (const [startDeg, endDeg] of wallSegments) {
    const startRad = p.radians(startDeg);
    const endRad = p.radians(endDeg);
    p.arc(cx, cy, r * 2, r * 2, startRad, endRad);
  }
}

/**
 * Given gap definitions (open sections), return the wall segments (solid arcs).
 * Gaps and walls are complementary arcs around the full 360°.
 */
function getWallSegments(gaps) {
  if (gaps.length === 0) return [[0, 360]];

  // Normalize gaps to [start, end] where both are in [0, 360)
  // and convert to a list of "open" angle ranges
  const openRanges = [];
  for (const [gs, ge] of gaps) {
    const start = ((gs % 360) + 360) % 360;
    const end = ((ge % 360) + 360) % 360;
    openRanges.push({ start, end });
  }

  // Sort gap edges: collect all boundary points
  const edges = [];
  for (const { start, end } of openRanges) {
    edges.push({ angle: start, type: 'gap_start' });
    if (end < start) {
      // wraps around 0°
      edges.push({ angle: end, type: 'gap_end' });
    } else {
      edges.push({ angle: end, type: 'gap_end' });
    }
  }

  // Simple approach: walk around the circle and collect solid segments
  // Build a list of all angles that are "solid" vs "gap"
  const walls = [];
  // Sort all gap edges by angle
  const sortedGaps = [...openRanges].sort((a, b) => a.start - b.start);

  // For each gap, the wall runs from previous gap's end to this gap's start
  for (let i = 0; i < sortedGaps.length; i++) {
    const prevGap = sortedGaps[(i - 1 + sortedGaps.length) % sortedGaps.length];
    const thisGap = sortedGaps[i];

    let wallStart = prevGap.end;
    let wallEnd = thisGap.start;

    // Skip zero-length walls
    if (wallStart === wallEnd) continue;

    walls.push([wallStart, wallEnd]);
  }

  return walls;
}

/**
 * Check if a normalized coordinate is inside the pen circle.
 */
export function isInsidePen(nx, ny) {
  const dx = nx - PEN.cx;
  const dy = ny - PEN.cy;
  return Math.sqrt(dx * dx + dy * dy) <= PEN.radius;
}

/**
 * Check whether an angle (degrees, 0–360) falls within one of the pen gaps.
 */
export function isInGap(angleDeg) {
  const a = ((angleDeg % 360) + 360) % 360;
  for (const [gs, ge] of PEN.gaps) {
    const s = ((gs % 360) + 360) % 360;
    const e = ((ge % 360) + 360) % 360;
    if (s > e) {
      // Wraps around 0° (e.g. 350→10)
      if (a >= s || a <= e) return true;
    } else {
      if (a >= s && a <= e) return true;
    }
  }
  return false;
}

/**
 * Return distance and angle info for a point relative to the pen center.
 */
export function penEdgeInfo(nx, ny) {
  const dx = nx - PEN.cx;
  const dy = ny - PEN.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = ((angleRad * 180 / Math.PI) + 360) % 360;
  return { dist, angleDeg, inside: dist <= PEN.radius };
}
