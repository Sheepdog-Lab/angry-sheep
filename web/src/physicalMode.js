import { TOOL_COLORS } from './config.js';
import { applyPhysicalMarkerFlip } from './markerCalibration.js';

const SHEEPDOG_IDS = new Set([0, 1, 2, 3]);
const GRASS_IDS = new Set([4, 5]);

export function getObjectTypeFromMarker(id) {
  if (SHEEPDOG_IDS.has(id)) return 'sheepdog';
  if (GRASS_IDS.has(id)) return 'grass';
  if (id >= 6 && id <= 11) return 'block';
  return null;
}

export function buildPhysicalTools(markers) {
  return markers
    .map((marker) => {
      const type = getObjectTypeFromMarker(marker.id);
      if (!type) return null;
      const flipped = applyPhysicalMarkerFlip(marker.x, marker.y);
      return {
        id: marker.id,
        markerId: marker.id,
        type,
        x: Math.max(0, Math.min(1, flipped.x)),
        y: Math.max(0, Math.min(1, flipped.y)),
        angle_deg: typeof marker.angle_deg === 'number' ? marker.angle_deg : 0,
      };
    })
    .filter(Boolean);
}

export function drawPhysicalToolVisuals(p, tools, canvasSize) {
  for (const tool of tools) {
    const px = tool.x * canvasSize;
    const py = tool.y * canvasSize;
    const color =
      tool.type === 'sheepdog' ? '#ffffff' :
      tool.type === 'grass' ? TOOL_COLORS.grass :
      '#b0b0b0';
    p.push();
    p.fill(color);
    p.stroke(0, 0, 0, 180);
    p.strokeWeight(2);
    p.circle(px, py, 18);
    p.noStroke();
    p.fill(255);
    p.textAlign(p.CENTER, p.BOTTOM);
    p.textSize(12);
    p.text(String(tool.markerId ?? tool.id), px, py - 10);
    p.pop();
  }
}
