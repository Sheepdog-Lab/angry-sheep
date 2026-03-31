import { TABLE_RADIUS, AMBIENT_GRASS as AG } from './config.js';

/** @type {import('p5').Image | null} */
let imgRef = null;

/** @type {Array<{
 *   id: number;
 *   layer: 0 | 1;
 *   windMode: 'gust' | 'simple';
 *   x: number;
 *   y: number;
 *   scaleJ: number;
 *   rot0: number;
 *   flip: number;
 *   opacity: number;
 *   reactVar: number;
 *   inGust: boolean;
 *   gustStart: number;
 *   gustEnd: number;
 *   nextGustAt: number;
 *   gustDur: number;
 *   gustAmp: number;
 *   srRot: number;
 *   srShift: number;
 * }>} */
let instances = [];

/** Spatial hash: buckets[cellIndex] = grass instance indices */
let grassSpatial = {
  div: 8,
  cellW: 1,
  /** @type {number[][]} */
  buckets: [],
};

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function frac01(id, salt) {
  const x = Math.sin(id * 12.9898 + salt * 78.233 + id * salt * 0.001) * 43758.5453;
  return x - Math.floor(x);
}

export function setTerrainGrassImage(img) {
  imgRef = img;
}

function clampToPlayDisc(px, py, cx, cy, maxR) {
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d > maxR && d > 1e-6) {
    return {
      x: cx + (dx / d) * maxR,
      y: cy + (dy / d) * maxR,
    };
  }
  return { x: px, y: py };
}

function placeOne(rng, cx, cy, R, canvasSize) {
  let x = cx;
  let y = cy;
  for (let attempt = 0; attempt < 80; attempt++) {
    const u = rng();
    const v = rng();
    const rad = Math.sqrt(u) * R;
    const ang = v * Math.PI * 2;
    x = cx + Math.cos(ang) * rad;
    y = cy + Math.sin(ang) * rad;
    const ny = y / canvasSize;
    if (ny >= AG.EXCLUDE_TOP_FRAC && ny <= 1 - AG.EXCLUDE_BOTTOM_FRAC) break;
  }
  return { x, y };
}

function rebuildGrassSpatial(canvasSize) {
  const div = AG.SHEEP_GRID_DIV;
  const cellW = canvasSize / div;
  const buckets = new Array(div * div);
  for (let i = 0; i < buckets.length; i++) buckets[i] = [];
  for (let i = 0; i < instances.length; i++) {
    const g = instances[i];
    const cx = Math.min(div - 1, Math.max(0, Math.floor(g.x / cellW)));
    const cy = Math.min(div - 1, Math.max(0, Math.floor(g.y / cellW)));
    buckets[cx + cy * div].push(i);
  }
  grassSpatial = { div, cellW, buckets };
}

/**
 * Closest grass indices within radius (for sheep impulse; capped per sheep).
 * @param {number} sx
 * @param {number} sy
 * @param {number} radiusPx
 * @returns {number[]}
 */
function grassIndicesNear(sx, sy, radiusPx) {
  const { div, cellW, buckets } = grassSpatial;
  const minCx = Math.max(0, Math.floor((sx - radiusPx) / cellW));
  const maxCx = Math.min(div - 1, Math.floor((sx + radiusPx) / cellW));
  const minCy = Math.max(0, Math.floor((sy - radiusPx) / cellW));
  const maxCy = Math.min(div - 1, Math.floor((sy + radiusPx) / cellW));

  /** @type {{ idx: number; d: number }[]} */
  const cand = [];
  for (let cxi = minCx; cxi <= maxCx; cxi++) {
    for (let cyi = minCy; cyi <= maxCy; cyi++) {
      const arr = buckets[cxi + cyi * div];
      for (let k = 0; k < arr.length; k++) {
        const idx = arr[k];
        const g = instances[idx];
        const d = Math.hypot(g.x - sx, g.y - sy);
        if (d < radiusPx) cand.push({ idx, d });
      }
    }
  }
  cand.sort((a, b) => a.d - b.d);
  const max = AG.SHEEP_MAX_REACT_PER_SHEEP;
  const out = [];
  for (let i = 0; i < cand.length && i < max; i++) out.push(cand[i].idx);
  return out;
}

function pushInstance(
  rng,
  opts,
  cx,
  cy,
  R,
  canvasSize,
) {
  const {
    layer,
    i,
    windMode,
    opacity,
    scaleExtra = 1,
    offset = false,
  } = opts;

  let { x, y } = placeOne(rng, cx, cy, R, canvasSize);
  if (offset) {
    x += (rng() - 0.5) * 2 * AG.SECONDARY_OFFSET_FRAC * canvasSize;
    y += (rng() - 0.5) * 2 * AG.SECONDARY_OFFSET_FRAC * canvasSize;
    const c = clampToPlayDisc(x, y, cx, cy, R);
    x = c.x;
    y = c.y;
  }

  let scaleJ = (1 + (rng() * 2 - 1) * AG.SCALE_VARIATION) * scaleExtra;
  const rot0 = (rng() * 2 - 1) * AG.ROTATION_VAR;
  const flip = rng() < 0.5 ? -1 : 1;
  const firstDelay = rng() * AG.PHASE_SPREAD_FRAMES;
  const reactVar = 0.68 + rng() * 0.38;
  const uid = layer * 50000 + i;

  instances.push({
    id: uid,
    layer,
    windMode,
    x,
    y,
    scaleJ,
    rot0,
    flip,
    opacity,
    reactVar,
    inGust: false,
    gustStart: 0,
    gustEnd: 0,
    nextGustAt: firstDelay,
    gustDur: 0,
    gustAmp: 1,
    srRot: 0,
    srShift: 0,
  });
}

export function initTerrainAmbientGrass(canvasSize) {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const R = TABLE_RADIUS * canvasSize * AG.DISK_MARGIN;
  instances = [];

  const rngP = mulberry32(0x9e3779b9);
  for (let i = 0; i < AG.PRIMARY_GRASS_COUNT; i++) {
    const windMode = i < AG.WIND_GUST_ANIMATED_COUNT ? 'gust' : 'simple';
    const opacity = AG.OPACITY_MIN + rngP() * (AG.OPACITY_MAX - AG.OPACITY_MIN);
    pushInstance(
      rngP,
      {
        layer: 0,
        i,
        windMode,
        opacity,
        scaleExtra: 1,
        offset: false,
      },
      cx,
      cy,
      R,
      canvasSize,
    );
  }

  const rngS = mulberry32(0x5f3759df);
  for (let i = 0; i < AG.SECONDARY_GRASS_COUNT; i++) {
    const opacity =
      AG.SECONDARY_OPACITY_MIN + rngS() * (AG.SECONDARY_OPACITY_MAX - AG.SECONDARY_OPACITY_MIN);
    pushInstance(
      rngS,
      {
        layer: 1,
        i,
        windMode: 'simple',
        opacity,
        scaleExtra: AG.SECONDARY_SCALE_J_MULT,
        offset: true,
      },
      cx,
      cy,
      R,
      canvasSize,
    );
  }

  rebuildGrassSpatial(canvasSize);
}

function scheduleNextGap(id, frame) {
  return (
    AG.GUST_GAP_MIN + frac01(id, frame * 0.017) * (AG.GUST_GAP_MAX - AG.GUST_GAP_MIN)
  );
}

function pickGustDuration(id, frame) {
  return (
    AG.GUST_DURATION_MIN + frac01(id * 3, frame * 0.023) * (AG.GUST_DURATION_MAX - AG.GUST_DURATION_MIN)
  );
}

function pickGustAmp(id, frame) {
  return 0.62 + frac01(id * 5, frame * 0.031) * 0.38;
}

function simpleWindSway(g, f) {
  const base =
    g.layer === 1 ? AG.SECONDARY_SIMPLE_WIND_SCALE : AG.SIMPLE_WIND_SCALE;
  const w1 = Math.sin(f * AG.SIMPLE_WIND_FREQ + g.x * 0.014 + g.id * 0.11);
  const w2 = Math.sin(
    f * AG.SIMPLE_WIND_FREQ * AG.SIMPLE_WIND_SECOND_FREQ_MUL +
      g.y * 0.021 +
      g.id * 0.37,
  );
  const mix = AG.SIMPLE_WIND_WAVE_MIX;
  const combined = w1 + w2 * mix;
  const norm = 1 / (1 + mix);
  return combined * norm * base * g.flip;
}

/**
 * @param {Array<{ x: number; y: number; vx: number; vy: number }>} flock
 * @param {number} canvasSize
 * @param {boolean} active
 * @param {number} frameCount
 */
export function updateGrassSheepInteraction(flock, canvasSize, active, frameCount) {
  const capR = AG.SHEEP_MAX_TILT;
  const capS = AG.SHEEP_MAX_SHIFT_FRAC * canvasSize;
  const near = AG.SHEEP_NEAR_RADIUS * canvasSize;

  for (const g of instances) {
    g.srRot *= AG.SHEEP_RECOVERY;
    g.srShift *= AG.SHEEP_RECOVERY;
  }

  if (!active || !flock || flock.length === 0) {
    for (const g of instances) {
      g.srRot = Math.max(-capR, Math.min(capR, g.srRot));
      g.srShift = Math.max(-capS, Math.min(capS, g.srShift));
    }
    return;
  }

  if (frameCount % AG.SHEEP_CHECK_INTERVAL !== 0) {
    for (const g of instances) {
      g.srRot = Math.max(-capR, Math.min(capR, g.srRot));
      g.srShift = Math.max(-capS, Math.min(capS, g.srShift));
    }
    return;
  }

  for (const sh of flock) {
    const sx = sh.x * canvasSize;
    const sy = sh.y * canvasSize;
    const idxs = grassIndicesNear(sx, sy, near);
    for (let j = 0; j < idxs.length; j++) {
      const g = instances[idxs[j]];
      const rdx = g.x - sx;
      const rdy = g.y - sy;
      const dist = Math.hypot(rdx, rdy);
      if (dist >= near || dist < 1e-4) continue;

      const falloff = 1 - dist / near;
      const f2 = falloff * falloff;
      const nx = rdx / dist;

      const sheepMul = g.layer === 0 ? 1 : AG.SECONDARY_SHEEP_SCALE;
      const lean = -nx * AG.SHEEP_PUSH_INTENSITY * f2 * g.reactVar * g.flip;

      const sv = Math.hypot(sh.vx, sh.vy);
      let brush = 0;
      if (sv > 1e-7) {
        const vx = sh.vx * canvasSize;
        const vy = sh.vy * canvasSize;
        const cross = vx * rdy - vy * rdx;
        const denom = dist * (Math.hypot(vx, vy) + 1e-8);
        const tang = Math.max(-1, Math.min(1, cross / denom));
        brush = tang * AG.SHEEP_VELOCITY_TILT * f2 * g.reactVar;
      }

      g.srRot += (lean + brush) * sheepMul;
      g.srShift +=
        nx *
        AG.SHEEP_SHIFT_FRAC *
        canvasSize *
        f2 *
        g.reactVar *
        0.85 *
        sheepMul;
    }
  }

  for (const g of instances) {
    g.srRot = Math.max(-capR, Math.min(capR, g.srRot));
    g.srShift = Math.max(-capS, Math.min(capS, g.srShift));
  }
}

export function drawTerrainAmbientGrass(p, canvasSize) {
  if (!imgRef || !imgRef.width || instances.length === 0) return;

  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const R = TABLE_RADIUS * canvasSize;
  const D = R * 2;
  const baseH = D * AG.BASE_HEIGHT_FRAC;
  const f = p.frameCount;

  const ctx = p.drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.985, 0, Math.PI * 2);
  ctx.clip();

  for (let gi = 0; gi < instances.length; gi++) {
    const g = instances[gi];
    if (g.windMode !== 'gust') continue;
    if (g.inGust) {
      if (f > g.gustEnd) {
        g.inGust = false;
        g.nextGustAt = f + scheduleNextGap(g.id, f);
      }
    } else if (f >= g.nextGustAt) {
      g.inGust = true;
      g.gustStart = f;
      g.gustDur = pickGustDuration(g.id, f);
      g.gustEnd = g.gustStart + g.gustDur;
      g.gustAmp = pickGustAmp(g.id, f);
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    const wantLayer = 1 - pass;
    for (let gi = 0; gi < instances.length; gi++) {
      const g = instances[gi];
      if (g.layer !== wantLayer) continue;

      let sway = 0;
      let shift = 0;
      if (g.windMode === 'gust' && g.inGust && f >= g.gustStart && f <= g.gustEnd) {
        const t = (f - g.gustStart) / Math.max(1, g.gustEnd - g.gustStart);
        const env = Math.sin(t * Math.PI);
        const subtle = 0.86 + 0.14 * Math.sin(f * 0.095 + g.id * 0.7);
        sway = env * AG.SWAY_ANGLE_MAX * g.gustAmp * subtle * g.flip;
        shift =
          Math.sin(t * Math.PI * 2) *
          AG.SWAY_SHIFT_FRAC *
          canvasSize *
          0.22 *
          env;
      } else if (g.windMode === 'gust') {
        sway = simpleWindSway(g, f) * AG.GUST_IDLE_SIMPLE_MULT;
      } else {
        sway = simpleWindSway(g, f);
      }

      const h = baseH * g.scaleJ;
      const ar = imgRef.width / imgRef.height;
      const w = h * ar;

      const squash = Math.min(0.07, Math.abs(g.srRot) * AG.SHEEP_FLATTEN_FROM_TILT);

      p.push();
      p.translate(g.x + shift + g.srShift, g.y);
      p.rotate(g.rot0 + sway + g.srRot);
      p.scale(g.flip, 1 - squash);
      p.tint(255, 255, 255, g.opacity * 255);
      p.imageMode(p.CENTER);
      p.image(imgRef, 0, -h / 2, w, h);
      p.noTint();
      p.pop();
    }
  }

  ctx.restore();
}
