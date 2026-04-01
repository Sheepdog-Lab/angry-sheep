import { MARKER_STREAM } from './config.js';
import { getMarkerStreamState } from './markerStream.js';

/** Distinct RGB per id — avoids p5 colorMode() changes that can flicker other layers */
function rgbForId(id) {
  const r = 55 + (id * 73) % 200;
  const g = 40 + (id * 131) % 180;
  const b = 55 + (id * 97) % 200;
  return { r, g, b };
}

/**
 * Draw ArUco marker positions as dots above the playfield and black overscan mask.
 */
export function drawMarkerOverlay(p, canvasSize) {
  const { connected, markers, rawMarkers, calibration } = getMarkerStreamState();
  const { dotRadiusPx, showLabels } = MARKER_STREAM;

  const hasDots = markers.length > 0;

  if (!connected && !hasDots) {
    p.push();
    p.fill(255, 200, 200, 120);
    p.noStroke();
    p.textSize(11);
    p.textAlign(p.RIGHT, p.TOP);
    p.text('ArUco: server offline (run python server/server.py)', canvasSize - 8, 8);
    p.pop();
    return;
  }

  for (const m of markers) {
    const id = m.id;
    const x = m.x * canvasSize;
    const y = m.y * canvasSize;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof id !== 'number') continue;
    const { r, g, b } = rgbForId(id);
    p.push();
    p.fill(r, g, b, 240);
    p.stroke(255, 255, 255, 200);
    p.strokeWeight(2);
    p.ellipse(x, y, dotRadiusPx * 2, dotRadiusPx * 2);
    if (showLabels) {
      p.fill(255, 255, 255, 230);
      p.noStroke();
      p.textSize(Math.max(10, dotRadiusPx));
      p.textAlign(p.CENTER, p.CENTER);
      p.text(String(id), x, y);
    }
    p.pop();
  }

  p.push();
  p.fill(255, 255, 255, 140);
  p.noStroke();
  p.textSize(10);
  p.textAlign(p.RIGHT, p.TOP);
  const tag = connected
    ? `ArUco: ${markers.length} marker(s)`
    : hasDots
      ? 'ArUco: reconnecting…'
      : 'ArUco: …';
  const rawIds = rawMarkers.map((m) => m.id).join(', ') || 'none';
  const debug =
    `raw IDs ${rawIds}\n` +
    `calibration ${calibration?.active ? `${calibration.count}/4 ${calibration.nextCorner}` : calibration?.loaded ? 'loaded' : 'not set'}`;
  p.text(`${tag}\n${debug}`, canvasSize - 8, 8);
  p.pop();
}
