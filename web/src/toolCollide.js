import { TOOL_SIZES } from './config.js';

// Shape model for overlap checks between tools:
//   - blocks are oriented bounding boxes (OBB) — same extents used by sheep.js
//   - sheepdog / grass / comb are circles at TOOL_SIZES[type]
// Enforced only while dragging, so small existing overlaps from INITIAL_TOOLS
// don't lock tools in place (the resolver just can't make things worse).

function toolRot(tool) {
  if (typeof tool.rotation === 'number') return tool.rotation;
  if (typeof tool.angle_deg === 'number') return (tool.angle_deg * Math.PI) / 180;
  return 0;
}

function shape(tool) {
  if (tool.type === 'block') {
    return {
      kind: 'obb',
      hw: TOOL_SIZES.block.w / 2,
      hh: TOOL_SIZES.block.h / 2,
      rot: toolRot(tool),
    };
  }
  return { kind: 'circle', r: TOOL_SIZES[tool.type] ?? 0.02 };
}

function circleCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by;
  const d2 = dx * dx + dy * dy;
  const sum = ar + br;
  if (d2 >= sum * sum) return null;
  const d = Math.sqrt(d2);
  const nx = d > 1e-9 ? dx / d : 1;
  const ny = d > 1e-9 ? dy / d : 0;
  return { nx, ny, depth: sum - d };
}

function circleObb(cx, cy, cr, obbX, obbY, hw, hh, rot) {
  // Circle center in OBB local frame.
  const c = Math.cos(-rot), s = Math.sin(-rot);
  const lx = (cx - obbX) * c - (cy - obbY) * s;
  const ly = (cx - obbX) * s + (cy - obbY) * c;
  const clx = Math.max(-hw, Math.min(hw, lx));
  const cly = Math.max(-hh, Math.min(hh, ly));
  let dlx = lx - clx, dly = ly - cly;
  const d2 = dlx * dlx + dly * dly;
  let localNx, localNy, depth;
  if (d2 < 1e-18) {
    // Center inside the box — push along the nearest edge.
    const penX = hw - Math.abs(lx);
    const penY = hh - Math.abs(ly);
    if (penX < penY) {
      localNx = lx >= 0 ? 1 : -1;
      localNy = 0;
      depth = penX + cr;
    } else {
      localNx = 0;
      localNy = ly >= 0 ? 1 : -1;
      depth = penY + cr;
    }
  } else {
    const d = Math.sqrt(d2);
    if (d >= cr) return null;
    localNx = dlx / d;
    localNy = dly / d;
    depth = cr - d;
  }
  const cr2 = Math.cos(rot), sr2 = Math.sin(rot);
  return {
    nx: localNx * cr2 - localNy * sr2,
    ny: localNx * sr2 + localNy * cr2,
    depth,
  };
}

function obbCorners(cx, cy, hw, hh, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const out = new Array(4);
  const pts = [[hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh]];
  for (let i = 0; i < 4; i++) {
    const [lx, ly] = pts[i];
    out[i] = [cx + lx * c - ly * s, cy + lx * s + ly * c];
  }
  return out;
}

// SAT on two OBBs: 4 candidate axes (2 from each), pick the minimum
// overlap axis and orient it to push A away from B.
function obbObb(ax, ay, ahw, ahh, arot, bx, by, bhw, bhh, brot) {
  const cA = Math.cos(arot), sA = Math.sin(arot);
  const cB = Math.cos(brot), sB = Math.sin(brot);
  const axes = [
    [cA, sA], [-sA, cA],
    [cB, sB], [-sB, cB],
  ];
  const cornersA = obbCorners(ax, ay, ahw, ahh, arot);
  const cornersB = obbCorners(bx, by, bhw, bhh, brot);
  let minOverlap = Infinity;
  let minNx = 1, minNy = 0;
  for (let i = 0; i < axes.length; i++) {
    const [axx, ayy] = axes[i];
    let aMin = Infinity, aMax = -Infinity;
    for (let k = 0; k < 4; k++) {
      const p = cornersA[k][0] * axx + cornersA[k][1] * ayy;
      if (p < aMin) aMin = p;
      if (p > aMax) aMax = p;
    }
    let bMin = Infinity, bMax = -Infinity;
    for (let k = 0; k < 4; k++) {
      const p = cornersB[k][0] * axx + cornersB[k][1] * ayy;
      if (p < bMin) bMin = p;
      if (p > bMax) bMax = p;
    }
    const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
    if (overlap <= 0) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      const sign = (ax * axx + ay * ayy) - (bx * axx + by * ayy) >= 0 ? 1 : -1;
      minNx = axx * sign;
      minNy = ayy * sign;
    }
  }
  return { nx: minNx, ny: minNy, depth: minOverlap };
}

function pairOverlap(ax, ay, aShape, bx, by, bShape) {
  if (aShape.kind === 'circle' && bShape.kind === 'circle') {
    return circleCircle(ax, ay, aShape.r, bx, by, bShape.r);
  }
  if (aShape.kind === 'circle' && bShape.kind === 'obb') {
    return circleObb(ax, ay, aShape.r, bx, by, bShape.hw, bShape.hh, bShape.rot);
  }
  if (aShape.kind === 'obb' && bShape.kind === 'circle') {
    const r = circleObb(bx, by, bShape.r, ax, ay, aShape.hw, aShape.hh, aShape.rot);
    if (!r) return null;
    return { nx: -r.nx, ny: -r.ny, depth: r.depth };
  }
  return obbObb(
    ax, ay, aShape.hw, aShape.hh, aShape.rot,
    bx, by, bShape.hw, bShape.hh, bShape.rot,
  );
}

/**
 * Return a position for the dragged tool that doesn't overlap any other tool,
 * pushing the desired position along collision normals. A small number of
 * iterations handles chains (pushed off A into B); leftover overlap after the
 * loop is accepted rather than locking the drag.
 */
export function resolveToolOverlap(draggedTool, desiredX, desiredY, allTools) {
  const aShape = shape(draggedTool);
  let x = desiredX, y = desiredY;
  const others = [];
  for (const t of allTools) {
    if (t.id === draggedTool.id) continue;
    others.push({ x: t.x, y: t.y, shape: shape(t) });
  }
  const epsilon = 1e-5;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const o of others) {
      const hit = pairOverlap(x, y, aShape, o.x, o.y, o.shape);
      if (!hit) continue;
      x += hit.nx * (hit.depth + epsilon);
      y += hit.ny * (hit.depth + epsilon);
      moved = true;
    }
    if (!moved) break;
  }
  return { x, y };
}
