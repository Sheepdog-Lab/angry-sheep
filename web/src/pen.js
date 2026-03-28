import { PEN } from './config.js';

/**
 * Draw the pen/corral — a circle with multiple openings (gaps in the arc).
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

  // Draw arc segments between the gaps
  p.noFill();
  p.stroke(PEN.strokeColor);
  p.strokeWeight(sw);
  p.strokeCap(p.ROUND);

  // Collect all gap edges as sorted angles, then draw the solid arcs between them
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
