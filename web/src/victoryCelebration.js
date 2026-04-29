/**
 * Pen-centered victory VFX — airy pulses, layered particles, no heavy UI.
 *
 * Tunables: `VICTORY_CELEBRATION` / `setVictoryCelebrationTuning`
 * — timeline: arrivalPopFrames, holdDurationFrames, lingerFadeStartFrame, particleLifetimeFrames
 * — pulses: pulseWaveCount, pulseThicknessPx, pulseOpacityMax, pulseFadeFrames, ringPulseRadiusMul
 * — flash/halo: goldenFlashFrames, goldenHaloDurationFrames, goldenFlashIntensity, haloIntensity
 * — pen rim: penGlowIntensity, penPulseFrames, penRimStrokePxMax
 * — counts: confettiCount, heartParticleCount, sparkleCount, magicalDustCount, floatingMoteCount,
 *   orbitingStarCount, glowOrbCount, shimmerArcCount
 * — burst: burstMaxDistFrac, burstSpeedMin/Max, burstRampFrames, burstAngleJitter, arrivalBurstMul
 * — drift/fade: particleDriftSlowMul, particleDriftMedMul, lingerDriftMul, gravity, confettiFadeStartFrame
 * — readability: particleAlphaBoost, burstOpacityFloor, midOpacityFloor, lingerOpacityFloor,
 *   sparkleSizeMul, sparkleBrightnessMul, heartSizeMul, glowIntensityMul, shimmerOpacityPrimary/Secondary
 * — burst: burstMaxDistFrac (radius), centerBurstIntensity (underlay flash)
 * — linger: particleLifetimeFrames (duration), magicalFlakeCount
 * — sizes: confettiSizeMinFrac, confettiSizeMaxFrac, glowSizeFrac, confettiEdgeBoost, confettiDensityMul
 * — confetti: organic shapes (`drawOrganicConfettiPiece`, `CONFETTI_BASE_COLORS`)
 * — sheep celebration (sheep.js): hop uses vertical motion + subtle wiggle; silhouette stays round.
 *   sheepHopDurationFrames, sheepHopOmega / sheepBounceOmega, sheepBounceAmpNorm, sheepHopLiftPow,
 *   sheepLandingReboundAmpNorm, sheepLandingReboundOmega (gentle grounded rebound, vertical),
 *   sheepBodyBobAmpNorm, sheepBodyBobOmega, sheepWiggleRad, sheepJoySwayNorm, sheepLocalBobRad,
 *   sheepMicroSquashStretch (0 = none; tiny cap when set),
 *   sheepBounceDurationFrames, sheepPhaseSpread, sheepHopSparkleIntensity,
 *   per-sheep accents (sheep.js, calming-style): sheepLocalVfxIntensity, sheepLocalSparkleCount,
 *   sheepVictoryFeedingVfxMix (0–1, grass bundle + mint glow + gold/mint sparkles on win),
 *   sheepLocalHeartChance, sheepLocalParticleSizeFrac; sheepLocalStarTwinkleCount / lifetime /
 *   shimmer / glow / dust keys kept for `setVictoryCelebrationTuning` compatibility (mostly unused).
 */

import { PEN, TABLE_RADIUS } from './config.js';

/** Hard caps — prevents frame freezes / GPU stalls if tuning runs away. */
const PARTICLE_CAPS = {
  confetti: 160,
  hearts: 48,
  sparkles: 96,
  magicalDust: 72,
  magicalFlakes: 40,
  floatingMotes: 64,
  glowOrbs: 48,
  orbitingStars: 28,
  sparkleHaloDots: 42,
};

function clampParticleCount(n, cap) {
  const k = Math.floor(Number(n));
  if (!Number.isFinite(k) || k < 0) return 0;
  return Math.min(k, cap);
}

const VICTORY_CELEBRATION_DEFAULT = {
  arrivalPopFrames: 16,
  holdDurationFrames: 54,
  lingerFadeStartFrame: 118,
  /** Linger duration reference — longer = slower fade tail */
  particleLifetimeFrames: 268,

  goldenFlashFrames: 11,
  goldenHaloDurationFrames: 48,
  /** Clear bright pop at pen center */
  goldenFlashIntensity: 0.48,
  haloIntensity: 0.46,
  /** Multiplier on underlay sparkle burst brightness */
  centerBurstIntensity: 1.35,

  pulseWaveCount: 4,
  pulseThicknessPx: 1.08,
  pulseOpacityMax: 0.26,
  pulseFadeFrames: 24,
  ringPulseRadiusMul: 1.26,

  sparkleHaloDotCount: 32,
  sparkleHaloFrames: 30,
  sparkleHaloDotAlphaMul: 1.28,

  penGlowIntensity: 0.62,
  penPulseFrames: 24,
  penRimStrokePxMax: 2.55,
  penGlowReadabilityMul: 1.12,

  confettiCount: 120,
  heartParticleCount: 36,
  sparkleCount: 72,
  magicalDustCount: 56,
  magicalFlakeCount: 28,
  floatingMoteCount: 48,
  orbitingStarCount: 22,
  glowOrbCount: 36,
  shimmerArcCount: 12,

  /** Outward celebration radius (fraction of canvas from pen center) */
  burstMaxDistFrac: 0.62,
  burstSpeedMin: 3.6,
  burstSpeedMax: 11.8,
  burstRampFrames: 8,
  burstAngleJitter: 1.02,
  arrivalBurstMul: 1.46,

  particleDriftSlowMul: 0.36,
  particleDriftMedMul: 0.66,
  /** Scales dust/mote/flake drift — lower = slower, easier to read */
  lingerDriftMul: 0.58,

  confettiFadeStartFrame: 112,
  /** Multiplier on `confettiCount` without editing the base count */
  confettiDensityMul: 1,
  confettiSizeMinFrac: 0.013,
  confettiSizeMaxFrac: 0.036,
  /** Subtle dark offset behind confetti for grass contrast (0 = off) */
  confettiEdgeBoost: 0.22,

  sparkleDistMul: 1.28,
  heartDistMul: 0.92,
  glowDistMul: 0.84,
  glowSizeFrac: 0.05,
  glowIntensityMul: 1.32,

  gravity: 0.086,

  particleAlphaBoost: 1.14,
  burstOpacityFloor: 0.42,
  midOpacityFloor: 0.3,
  lingerOpacityFloor: 0.22,

  sparkleSizeMul: 1.32,
  sparkleBrightnessMul: 1.12,
  heartSizeMul: 1.24,

  shimmerOpacityPrimary: 56,
  shimmerOpacitySecondary: 32,
  shimmerStrokeMul: 1.12,

  /** Main hop height (fraction of canvas) — keep modest for clarity */
  sheepBounceAmpNorm: 0.019,
  /** Celebration envelope — hop strength fades toward end of outro */
  sheepBounceDurationFrames: 200,
  /**
   * Hop phase speed when `sheepHopDurationFrames` is 0.
   * Prefer `sheepHopDurationFrames`: ω = π / frames per hop arch.
   */
  sheepBounceOmega: 0.152,
  /** Frames per hop arch (lift → land). 0 = use omega */
  sheepHopDurationFrames: 26,
  /** Hop arc shape — higher = softer, rounder buoyant lift */
  sheepHopLiftPow: 0.88,
  /**
   * Extra vertical rebound while grounded (fraction of sheep radius). Buoyant shuffle, not squash.
   */
  sheepLandingReboundAmpNorm: 0.022,
  sheepLandingReboundOmega: 2.1,
  /** Gentle body bob layered on the hop */
  sheepBodyBobAmpNorm: 0.042,
  sheepBodyBobOmega: 0.34,
  /** Soft joy yaw (radians) — keep small so sheep stay round from above */
  sheepWiggleRad: 0.055,
  /** Lateral sway (fraction of radius), zero-mean */
  sheepJoySwayNorm: 0.022,
  /** Subtle ear/wool motion after facing (radians) */
  sheepLocalBobRad: 0.055,
  /**
   * Max body stretch/squash deviation (0 = off). Capped in code so sheep never look flattened.
   */
  sheepMicroSquashStretch: 0,
  /** Phase offset between sheep (rad spread per id) — keeps hops unsynchronized */
  sheepPhaseSpread: 2.65,
  sheepHopSparkleIntensity: 0.78,

  /** Per-sheep victory accents (0 = off); subtle gold/cream sparkles + soft glow */
  sheepLocalVfxIntensity: 0.66,
  /** 0–1: feeding-style grass PNG + soft mint rings + crumbs during victory (uses feeding asset) */
  sheepVictoryFeedingVfxMix: 1,
  /** Tiny `drawSparkle` count per sheep (max 5 in sheep.js) */
  sheepLocalSparkleCount: 3,
  /** Reserved (sparkles only; calming-style twinkles) */
  sheepLocalStarTwinkleCount: 0,
  /** 0–1: occasional small pale heart near hop apex */
  sheepLocalHeartChance: 0.1,
  /** Scales sparkle arm / landing mote size */
  sheepLocalParticleSizeFrac: 0.046,
  /** Reserved */
  sheepLocalParticleLifetimeFrames: 20,
  /** >1 tightens hop/land timing windows for pops */
  sheepLocalPopTimingSharpness: 1.12,
  /** Soft ring shimmer alpha scale (behind body) */
  sheepLocalShimmerIntensity: 0.36,
  /** Glow puff under sheep on bounce */
  sheepLocalGlowPuffMul: 0.48,
  /** Landing celebratory dust strength */
  sheepLocalLandingDustMul: 0.42,
  /** Max dust motes per sheep per landing window (hard-capped in sheep.js) */
  sheepLocalDustMaxCount: 3,
};

/** @type {typeof VICTORY_CELEBRATION_DEFAULT} */
export let VICTORY_CELEBRATION = { ...VICTORY_CELEBRATION_DEFAULT };

export function setVictoryCelebrationTuning(partial) {
  VICTORY_CELEBRATION = { ...VICTORY_CELEBRATION_DEFAULT, ...partial };
}

function fract(x) {
  return x - Math.floor(x);
}

function hash01(n) {
  return fract(Math.sin(n * 12.9898) * 43758.5453);
}

function easeOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

function easeOutQuad(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) * (1 - x);
}

function phaseBurstStrength(winFrame, V) {
  const ar = V.arrivalPopFrames;
  if (winFrame < ar) return 0.65 + 0.35 * easeOutCubic(winFrame / ar);
  const holdEnd = ar + V.holdDurationFrames;
  if (winFrame < holdEnd) return 1;
  const linger = V.lingerFadeStartFrame;
  if (winFrame < linger) {
    return 1 - ((winFrame - holdEnd) / Math.max(1, linger - holdEnd)) * 0.22;
  }
  const life = V.particleLifetimeFrames;
  const u = Math.min(1, Math.max(0, (winFrame - linger) / Math.max(1, life - linger)));
  return Math.max(0.12, 1 - u);
}

/** Boost RGB toward white for projector-readable sparkles */
function brightenRgb(rgb, mul) {
  const m = mul ?? 1;
  if (m <= 1.001) return rgb;
  return rgb.map((c) => Math.min(255, Math.round(c + (255 - c) * Math.min(0.42, (m - 1) * 0.95))));
}

function drawStarBurst(p, x, y, size, rot, alpha, rgb) {
  if (alpha < 0.018) return;
  p.push();
  p.translate(x, y);
  p.rotate(rot);
  p.noStroke();
  const [r, g, b] = rgb;
  p.fill(r, g, b, alpha * 255);
  p.beginShape();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? size : size * 0.42;
    p.vertex(Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  p.endShape(p.CLOSE);
  p.pop();
}

function drawMiniHeart(p, x, y, sz, cr, cg, cb, alpha) {
  if (alpha < 0.022) return;
  p.push();
  p.translate(x, y);
  p.noStroke();
  p.fill(cr, cg, cb, alpha * 255);
  const r = sz * 0.42;
  p.circle(-r * 0.48, -r * 0.12, r * 1.05);
  p.circle(r * 0.48, -r * 0.12, r * 1.05);
  p.beginShape();
  p.vertex(0, r * 0.92);
  p.vertex(-r * 0.98, -r * 0.08);
  p.vertex(r * 0.98, -r * 0.08);
  p.endShape(p.CLOSE);
  p.pop();
}

/** Saturated palette — reads on bright grass / projection */
const CONFETTI_BASE_COLORS = [
  [255, 115, 175],
  [255, 210, 72],
  [72, 182, 255],
  [92, 218, 155],
  [255, 155, 82],
  [255, 252, 248],
];

function confettiRgb(seed, colorIdx) {
  const base = CONFETTI_BASE_COLORS[colorIdx % CONFETTI_BASE_COLORS.length];
  const sat = 0.9 + hash01(seed + 44) * 0.1;
  const lift = hash01(seed + 55) > 0.68 ? 18 : 0;
  return [
    Math.min(255, Math.round(base[0] * sat + lift)),
    Math.min(255, Math.round(base[1] * sat + lift * 0.62)),
    Math.min(255, Math.round(base[2] * sat + lift * 0.48)),
  ];
}

function cj(seed, k, mag) {
  return (hash01(seed + k * 19.37) - 0.5) * mag;
}

/** Irregular torn paper quad */
function drawConfettiShard(p, s, seed) {
  const w = s * (0.42 + hash01(seed) * 0.28);
  const h = s * (0.38 + hash01(seed + 1) * 0.22);
  p.beginShape();
  p.vertex(-w * 0.42 + cj(seed, 1, w), -h * 0.38 + cj(seed, 2, h));
  p.vertex(w * 0.48 + cj(seed, 3, w), -h * 0.28 + cj(seed, 4, h));
  p.vertex(w * 0.35 + cj(seed, 5, w), h * 0.42 + cj(seed, 6, h));
  p.vertex(-w * 0.38 + cj(seed, 7, w), h * 0.35 + cj(seed, 8, h));
  p.endShape(p.CLOSE);
}

/** Short bent paper strip */
function drawConfettiShortStrip(p, s, seed) {
  const w = s * (0.55 + hash01(seed + 2) * 0.35);
  const h = s * (0.18 + hash01(seed + 3) * 0.12);
  const bend = cj(seed, 10, w * 0.18);
  p.beginShape();
  p.vertex(-w * 0.5, -h * 0.5);
  p.vertex(w * 0.5 + bend * 0.4, -h * 0.42 + bend * 0.15);
  p.vertex(w * 0.48 + bend, h * 0.48);
  p.vertex(-w * 0.46, h * 0.42 - bend * 0.12);
  p.endShape(p.CLOSE);
}

/** Long thin ribbon-like strip */
function drawConfettiLongStrip(p, s, seed) {
  const w = s * (0.85 + hash01(seed + 4) * 0.55);
  const h = s * (0.09 + hash01(seed + 5) * 0.07);
  const skew = cj(seed, 11, h * 2.2);
  p.beginShape();
  p.vertex(-w * 0.48, -h * 0.5 + skew);
  p.vertex(w * 0.5, -h * 0.38 - skew * 0.3);
  p.vertex(w * 0.52, h * 0.42 - skew);
  p.vertex(-w * 0.46, h * 0.48 + skew * 0.4);
  p.endShape(p.CLOSE);
}

/** Soft asymmetric paper oval */
function drawConfettiSoftOval(p, s, seed) {
  const rx = s * (0.28 + hash01(seed + 6) * 0.18);
  const ry = s * (0.34 + hash01(seed + 7) * 0.15);
  const tilt = cj(seed, 12, 0.15);
  p.push();
  p.rotate(tilt);
  p.ellipse(0, 0, rx * 2 + cj(seed, 13, s * 0.06), ry * 2 + cj(seed, 14, s * 0.07));
  p.pop();
}

/** Wavy curved snippet (closed ribbon) */
function drawConfettiCurvedSnippet(p, s, seed) {
  const w = s * 0.72;
  const amp = s * (0.14 + hash01(seed + 8) * 0.1);
  const n = 8;
  p.beginShape();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = (u - 0.5) * w + Math.sin(u * Math.PI * 1.8 + seed * 2.1) * amp * 0.35;
    const y =
      Math.sin(u * Math.PI * 2.2 + hash01(seed + 9) * 4) * amp - amp * 0.35;
    p.vertex(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n;
    const x = (u - 0.5) * w + Math.sin(u * Math.PI * 1.8 + seed * 2.1) * amp * 0.35;
    const y =
      Math.sin(u * Math.PI * 2.2 + hash01(seed + 9) * 4) * amp + amp * 0.42;
    p.vertex(x, y);
  }
  p.endShape(p.CLOSE);
}

/** Thin twisted sliver */
function drawConfettiSliver(p, s, seed) {
  const len = s * (0.62 + hash01(seed + 15) * 0.35);
  const th = s * 0.07;
  p.beginShape();
  p.vertex(-len * 0.48, -th * 0.4);
  p.vertex(len * 0.42 + cj(seed, 16, len * 0.08), -th * 0.5);
  p.vertex(len * 0.5, th * 0.55);
  p.vertex(-len * 0.4 + cj(seed, 17, len * 0.1), th * 0.42);
  p.endShape(p.CLOSE);
}

/** Ribbon curl — bent tapered shape */
function drawConfettiRibbonCurl(p, s, seed) {
  const r = s * (0.38 + hash01(seed + 18) * 0.22);
  const n = 12;
  p.beginShape();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const ang = u * Math.PI * 1.15 + hash01(seed + 19) * 0.5;
    const rr = r * (0.55 + u * 0.45);
    p.vertex(Math.cos(ang) * rr * 1.1 - r * 0.15, Math.sin(ang) * rr * 0.85);
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n;
    const ang = u * Math.PI * 1.15 + hash01(seed + 19) * 0.5;
    const rr = r * (0.42 + u * 0.38);
    p.vertex(Math.cos(ang) * rr * 0.92 - r * 0.12, Math.sin(ang) * rr * 0.72 + s * 0.06);
  }
  p.endShape(p.CLOSE);
}

/** Soft subtle 5-point celebratory star */
function drawConfettiSoftStar(p, s, seed) {
  const outer = s * (0.34 + hash01(seed + 20) * 0.14);
  const inner = outer * (0.42 + hash01(seed + 21) * 0.12);
  p.beginShape();
  for (let k = 0; k < 10; k++) {
    const rad = k % 2 === 0 ? outer : inner;
    const ang = (k / 10) * Math.PI * 2 - Math.PI / 2 + cj(seed, 22 + k, 0.07);
    p.vertex(Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  p.endShape(p.CLOSE);
}

/** Crinkled asymmetrical blob */
function drawConfettiCrumple(p, s, seed) {
  const n = 6 + Math.floor(hash01(seed * 83.2) * 3);
  p.beginShape();
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2 + hash01(seed + k * 3.1) * 0.35;
    const rad = s * (0.22 + hash01(seed + k * 7.7) * 0.2);
    p.vertex(Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  p.endShape(p.CLOSE);
}

/**
 * @param {number} shapeId 0…10
 */
function drawOrganicConfettiPiece(p, shapeId, seed, sz, cr, cg, cb, alpha) {
  p.fill(cr, cg, cb, alpha * 255);
  p.noStroke();
  const id = ((shapeId % 11) + 11) % 11;
  switch (id) {
    case 0:
      drawConfettiShard(p, sz, seed);
      break;
    case 1:
      drawConfettiShortStrip(p, sz, seed);
      break;
    case 2:
      drawConfettiLongStrip(p, sz, seed);
      break;
    case 3:
      drawConfettiSoftOval(p, sz, seed);
      break;
    case 4:
      drawConfettiCurvedSnippet(p, sz, seed);
      break;
    case 5:
      drawConfettiSliver(p, sz, seed);
      break;
    case 6:
      drawConfettiRibbonCurl(p, sz, seed);
      break;
    case 7:
      drawConfettiCrumple(p, sz, seed);
      break;
    case 8:
      drawConfettiSoftStar(p, sz, seed);
      break;
    case 9:
      drawConfettiShortStrip(p, sz * 1.12, seed + 3.3);
      break;
    default:
      drawConfettiCurvedSnippet(p, sz * 0.92, seed + 1.7);
      break;
  }
}

/**
 * Soft flash + airy halos + thin ripples + sparkle halo — before drawPen.
 */
export function drawVictoryUnderlay(p, canvasSize, winFrame) {
  if (!Number.isFinite(canvasSize) || canvasSize <= 4) return;
  const V = VICTORY_CELEBRATION;
  const cx = PEN.cx * canvasSize;
  const cy = PEN.cy * canvasSize;
  const penR = PEN.radius * canvasSize;
  const scale = canvasSize / 520;
  const t = Math.max(0, winFrame);

  const ctr = V.centerBurstIntensity ?? 1;
  const flashT = Math.min(1, t / Math.max(1, V.goldenFlashFrames));
  const flashAlpha = (1 - easeOutCubic(flashT)) * V.goldenFlashIntensity * ctr * 255;

  const haloT = Math.min(1, t / Math.max(1, V.goldenHaloDurationFrames));
  const haloAlpha = (1 - haloT * 0.88) * V.haloIntensity * ctr;

  p.push();
  p.blendMode(p.BLEND);

  if (flashAlpha > 1.5) {
    p.noStroke();
    for (let i = 0; i < 4; i++) {
      const k = i / 4;
      const a = flashAlpha * (1 - k * 0.22) * (0.2 + k * 0.04);
      p.fill(255, 253, 248, a);
      p.ellipse(cx, cy, canvasSize * (0.12 + k * 0.16), canvasSize * (0.11 + k * 0.15));
    }
    p.fill(255, 245, 195, flashAlpha * 0.28);
    p.ellipse(cx, cy, canvasSize * 0.11, canvasSize * 0.1);
    p.fill(255, 255, 255, flashAlpha * 0.14);
    p.ellipse(cx, cy, canvasSize * 0.048, canvasSize * 0.045);
  }

  if (haloAlpha > 0.015) {
    p.noStroke();
    const ha = haloAlpha * 255;
    p.fill(255, 228, 165, ha * 0.17);
    p.ellipse(cx, cy, penR * 3.65, penR * 3.4);
    p.fill(255, 246, 218, ha * 0.13);
    p.ellipse(cx, cy, penR * 2.52, penR * 2.32);
    p.fill(255, 255, 252, ha * 0.085);
    p.ellipse(cx, cy, penR * 1.72, penR * 1.58);
  }

  const ringBoost = phaseBurstStrength(t, V);
  const pw = V.pulseThicknessPx * scale;

  for (let ri = 0; ri < V.pulseWaveCount; ri++) {
    const delay = ri * 5;
    if (t < delay) continue;
    const u = easeOutCubic(Math.min(1, (t - delay) / Math.max(1, V.pulseFadeFrames)));
    const rad = penR * (0.46 + u * V.ringPulseRadiusMul * (0.92 + ri * 0.035));
    const baseA = V.pulseOpacityMax * (1 - u) ** 2.1 * ringBoost * 255;
    p.noFill();
    p.stroke(255, 252, 248, baseA * 0.5);
    p.strokeWeight(Math.max(0.45, pw * (1 - u * 0.55)));
    p.ellipse(cx, cy, rad * 2, rad * 1.93);
    p.stroke(255, 238, 210, baseA * 0.32);
    p.strokeWeight(Math.max(0.35, pw * 0.65 * (1 - u)));
    p.ellipse(cx, cy, rad * 2.04, rad * 1.97);
  }

  const haloDotMul = (V.sparkleHaloDotAlphaMul ?? 1) * ctr;
  const haloDots = clampParticleCount(V.sparkleHaloDotCount, PARTICLE_CAPS.sparkleHaloDots);
  if (t < V.sparkleHaloFrames && haloDots > 0) {
    const hf = 1 - t / V.sparkleHaloFrames;
    const sr = penR * (0.72 + t * 0.024);
    for (let k = 0; k < haloDots; k++) {
      const ang = (k / haloDots) * Math.PI * 2 + t * 0.09;
      const sx = cx + Math.cos(ang) * sr * (0.92 + hash01(k * 7.1) * 0.14);
      const sy = cy + Math.sin(ang) * sr * (0.9 + hash01(k * 5.3) * 0.12);
      const sz = canvasSize * 0.0048 * (0.82 + hash01(k * 3.2) * 0.52);
      p.noStroke();
      p.fill(255, 252, 238, Math.min(220, 135 * hf * ringBoost * haloDotMul));
      p.ellipse(sx, sy, sz, sz * 0.92);
      p.fill(255, 236, 198, Math.min(190, 92 * hf * ringBoost * haloDotMul));
      p.ellipse(sx - sz * 0.15, sy - sz * 0.12, sz * 0.48, sz * 0.44);
    }
  }

  p.pop();
}

/** Thin elegant rim — does not dominate the pen art */
export function drawVictoryPenAccent(p, canvasSize, winFrame) {
  if (!Number.isFinite(canvasSize) || canvasSize <= 4) return;
  const V = VICTORY_CELEBRATION;
  const cx = PEN.cx * canvasSize;
  const cy = PEN.cy * canvasSize;
  const penR = PEN.radius * canvasSize;
  const scale = canvasSize / 520;
  const t = Math.max(0, winFrame);

  const pulse =
    t < V.penPulseFrames
      ? Math.sin((t / V.penPulseFrames) * Math.PI)
      : Math.exp(-(t - V.penPulseFrames) * 0.024) * 0.28;

  const readMul = V.penGlowReadabilityMul ?? 1;
  const glow = phaseBurstStrength(t, V) * V.penGlowIntensity * readMul;

  p.push();
  p.blendMode(p.BLEND);
  p.noFill();

  const sw = Math.min(V.penRimStrokePxMax * scale, (1.35 + 1.2 * pulse) * scale * glow);
  p.stroke(255, 246, 208, 108 * glow * (0.45 + 0.55 * pulse));
  p.strokeWeight(sw);
  p.ellipse(cx, cy, penR * 2 * 1.018, penR * 2 * 1.018);

  p.stroke(255, 255, 255, 42 * glow * pulse);
  p.strokeWeight(Math.max(0.55, sw * 0.42));
  p.ellipse(cx, cy, penR * 2 * 1.008, penR * 2 * 1.008);

  p.pop();
}

export function drawRadialVictoryBurst(p, canvasSize, winFrame) {
  drawVictoryParticles(p, canvasSize, winFrame);
}

function drawShimmerArcs(p, cx, cy, penR, t, scale, burstStr, V) {
  const n = V.shimmerArcCount;
  const boost = burstStr * (0.55 + 0.45 * Math.sin(t * 0.08));
  const opPri = V.shimmerOpacityPrimary ?? 48;
  const opSec = V.shimmerOpacitySecondary ?? 26;
  const swMul = V.shimmerStrokeMul ?? 1;
  p.strokeCap(p.ROUND);
  for (let i = 0; i < n; i++) {
    const ang0 = (i / n) * Math.PI * 2 + t * 0.045 + i * 0.31;
    const span = Math.PI * (0.26 + hash01(i * 11.2) * 0.18);
    const rad = penR * (1.08 + 0.12 * Math.sin(t * 0.14 + i * 0.7) + hash01(i * 9.4) * 0.06);
    const fade = boost * (0.38 + 0.26 * Math.sin(t * 0.28 + i));
    p.noFill();
    p.stroke(255, 252, 248, fade * opPri);
    p.strokeWeight(Math.max(0.55, 1.05 * scale * swMul));
    p.arc(cx, cy, rad * 2, rad * 2 * 0.96, ang0, ang0 + span);
    p.stroke(255, 228, 188, fade * opSec);
    p.strokeWeight(Math.max(0.42, 0.72 * scale * swMul));
    p.arc(cx, cy, rad * 2.04, rad * 2.02 * 0.96, ang0 + 0.04, ang0 + span * 0.92);
  }
}

export function drawVictoryParticles(p, canvasSize, winFrame) {
  if (!Number.isFinite(canvasSize) || canvasSize <= 4) return;
  const V = VICTORY_CELEBRATION;
  const cx = PEN.cx * canvasSize;
  const cy = PEN.cy * canvasSize;
  const penR = PEN.radius * canvasSize;
  const scale = canvasSize / 520;
  const maxDist = canvasSize * V.burstMaxDistFrac;
  const t = Math.max(0, winFrame);
  const life = V.particleLifetimeFrames;

  const ap = V.particleAlphaBoost ?? 1;
  const burstFloor = V.burstOpacityFloor ?? 0.38;
  const midFloor = V.midOpacityFloor ?? 0.26;
  const lingerFloor = V.lingerOpacityFloor ?? 0.18;
  const ld = V.lingerDriftMul ?? 0.58;
  const gi = V.glowIntensityMul ?? 1;
  const spSz = V.sparkleSizeMul ?? 1;
  const spBr = V.sparkleBrightnessMul ?? 1;
  const heartMul = V.heartSizeMul ?? 1;
  const edgeBoost = V.confettiEdgeBoost ?? 0;

  const burstStr = phaseBurstStrength(t, V);
  const arrivalMul =
    t < V.arrivalPopFrames ? V.arrivalBurstMul : 1 + (burstStr - 1) * 0.22;
  const burstEase = easeOutCubic(Math.min(1, t / Math.max(1, V.burstRampFrames)));

  const glowOrbN = clampParticleCount(V.glowOrbCount, PARTICLE_CAPS.glowOrbs);
  const dustN = clampParticleCount(V.magicalDustCount, PARTICLE_CAPS.magicalDust);
  const heartN = clampParticleCount(V.heartParticleCount, PARTICLE_CAPS.hearts);
  const sparkleN = clampParticleCount(V.sparkleCount, PARTICLE_CAPS.sparkles);
  const orbitN = clampParticleCount(V.orbitingStarCount, PARTICLE_CAPS.orbitingStars);
  const moteN = clampParticleCount(V.floatingMoteCount, PARTICLE_CAPS.floatingMotes);

  const paletteHearts = [
    [255, 118, 178],
    [72, 205, 255],
    [255, 215, 72],
    [108, 238, 162],
    [255, 255, 255],
    [238, 188, 255],
    [255, 175, 108],
  ];

  p.push();
  p.blendMode(p.BLEND);

  // --- Mid layer: soft glow orbs (drawn behind burst confetti for depth) ---
  for (let i = 0; i < glowOrbN; i++) {
    const seed = i * 31.17 + 4.2;
    const ang =
      (i / Math.max(1, glowOrbN)) * Math.PI * 2 +
      hash01(seed) * V.burstAngleJitter -
      Math.PI / 2;
    const v0 =
      (V.burstSpeedMin * V.particleDriftMedMul +
        hash01(seed + 2) * V.burstSpeedMax * 0.46) *
      scale *
      arrivalMul;
    const dist = Math.min(
      maxDist * V.glowDistMul,
      v0 * t * burstEase * 0.54 + t * 0.085 * scale * ld,
    );
    const gx = cx + Math.cos(ang) * dist;
    const gy = cy + Math.sin(ang) * dist + t * V.gravity * 0.44 * scale;
    const u = t / life;
    const fade =
      u < 0.52
        ? 0.52 + 0.48 * Math.sin(u * Math.PI * 1.75)
        : (1 - (u - 0.52) / 0.48) ** 1.48;
    let a = 0.082 * fade * burstStr * burstEase * gi * ap;
    a = Math.max(a, midFloor * 0.34 * burstStr * burstEase);
    const sz =
      canvasSize *
      V.glowSizeFrac *
      (0.82 + hash01(seed + 9) * 0.52);
    p.noStroke();
    const warm = i % 3;
    p.fill(255, 252 - warm * 9, 234 - warm * 8, Math.min(240, a * 255));
    p.ellipse(gx, gy, sz, sz * 0.9);
    p.fill(232, 250, 255, Math.min(210, a * 155));
    p.ellipse(gx - sz * 0.06, gy - sz * 0.05, sz * 0.4, sz * 0.38);
  }

  // --- Magical dust — slower outward drift (linger-tuned) ---
  for (let i = 0; i < dustN; i++) {
    const seed = i * 19.77 + 2.4;
    const ang = hash01(seed) * Math.PI * 2 + (i / Math.max(1, dustN)) * Math.PI * 2;
    const v0 =
      (V.burstSpeedMin * V.particleDriftSlowMul +
        hash01(seed + 1) * V.burstSpeedMax * 0.35) *
      scale *
      arrivalMul;
    const dist = Math.min(
      maxDist * 0.74,
      v0 * t * burstEase * 0.44 + t * 0.038 * scale * ld,
    );
    const dx = cx + Math.cos(ang + hash01(seed + 3) * 0.4) * dist;
    const dy =
      cy +
      Math.sin(ang + hash01(seed + 4) * 0.4) * dist +
      Math.sin(t * 0.048 + seed) * canvasSize * 0.0042 * ld;
    const u = t / life;
    const fa = (1 - u * 0.78) * burstStr * 0.48 * ap;
    const dsz = canvasSize * (0.003 + hash01(seed + 6) * 0.0036);
    const dustA = Math.max(fa * 0.85, lingerFloor * 0.95 * burstStr * burstEase);
    p.noStroke();
    p.fill(255, 252, 242, Math.min(220, 62 * dustA));
    p.ellipse(dx, dy, dsz, dsz * 1.05);
    p.fill(255, 228, 198, Math.min(165, 38 * dustA));
    p.ellipse(dx + dsz * 0.2, dy - dsz * 0.15, dsz * 0.55, dsz * 0.5);
  }

  // --- Soft magical flakes (rhombus silhouettes, burst + slow tumble) ---
  const flakeN = clampParticleCount(V.magicalFlakeCount ?? 0, PARTICLE_CAPS.magicalFlakes);
  for (let i = 0; i < flakeN; i++) {
    const seed = i * 37.91 + 11.2;
    const ang =
      (i / Math.max(1, flakeN)) * Math.PI * 2 + hash01(seed) * V.burstAngleJitter;
    const v0 =
      (V.burstSpeedMin * 0.58 + hash01(seed + 1) * V.burstSpeedMax * 0.52) *
      scale *
      arrivalMul;
    const dist = Math.min(
      maxDist * 0.88,
      v0 * t * burstEase * 0.6 + t * 0.055 * scale * ld,
    );
    const fx =
      cx +
      Math.cos(ang) * dist +
      Math.sin(t * 0.072 + seed) * canvasSize * 0.004;
    const fy =
      cy + Math.sin(ang) * dist + t * V.gravity * 0.52 * scale;
    const u = t / life;
    let fa = (1 - u * 0.72) * burstStr * burstEase * ap * 0.42;
    fa = Math.max(fa, burstFloor * 0.48 * burstStr * burstEase);
    const fsz = canvasSize * (0.0046 + hash01(seed + 3) * 0.005);
    const tumble = seed * 1.2 + t * 0.038;
    const pals = [
      [255, 248, 225],
      [220, 248, 255],
      [255, 225, 245],
      [255, 252, 235],
    ];
    const [fr, fg, fb] = pals[i % pals.length];
    const w = fsz * 0.92;
    const h = fsz * 1.05;
    p.push();
    p.translate(fx, fy);
    p.rotate(tumble);
    p.noStroke();
    p.fill(fr * 0.32, fg * 0.36, fb * 0.28, fa * 0.42 * 255);
    p.beginShape();
    p.vertex(w * 0.08, -h * 0.92);
    p.vertex(w * 0.62, 0);
    p.vertex(w * 0.06, h * 0.92);
    p.vertex(-w * 0.62, h * 0.02);
    p.endShape(p.CLOSE);
    p.fill(fr, fg, fb, fa * 255);
    p.beginShape();
    p.vertex(0, -h);
    p.vertex(w * 0.55, 0);
    p.vertex(0, h);
    p.vertex(-w * 0.55, 0);
    p.endShape(p.CLOSE);
    p.pop();
  }

  // --- Burst: organic confetti + optional edge shadow for grass contrast ---
  const confettiN = clampParticleCount(
    Math.max(1, Math.round(V.confettiCount * (V.confettiDensityMul ?? 1))),
    PARTICLE_CAPS.confetti,
  );
  for (let i = 0; i < confettiN; i++) {
    const seed = i * 17.31 + 1.7;
    const speedMul = 0.58 + hash01(seed + 33) * 0.52;
    const baseAng =
      (i / confettiN) * Math.PI * 2 + hash01(seed) * V.burstAngleJitter * 2;
    const v0 =
      (V.burstSpeedMin + hash01(seed + 3) * (V.burstSpeedMax - V.burstSpeedMin)) *
      scale *
      arrivalMul *
      speedMul;
    const dist = Math.min(
      maxDist,
      v0 * t * burstEase * 0.65 +
        hash01(seed + 8) * maxDist * 0.042 +
        (t < V.arrivalPopFrames ? t * scale * 0.092 : 0),
    );
    const radX = Math.cos(baseAng);
    const radY = Math.sin(baseAng);
    const perpX = -radY;
    const perpY = radX;
    const flutter =
      Math.sin(t * (0.092 + hash01(seed + 40) * 0.058) + seed * 4.2) *
        canvasSize *
        0.0085 +
      Math.cos(t * (0.138 + hash01(seed + 41) * 0.045) + seed * 2.8) *
        canvasSize *
        0.0055;
    const px =
      cx +
      radX * dist +
      perpX * flutter +
      Math.sin(t * 0.122 + seed * 4) * canvasSize * 0.0038;
    const py =
      cy +
      radY * dist +
      perpY * flutter +
      t * V.gravity * scale * (0.78 + hash01(seed + 42) * 0.42) +
      Math.cos(t * 0.088 + seed) * canvasSize * 0.0042;

    const fadeT =
      t < V.confettiFadeStartFrame
        ? 1
        : 1 - (t - V.confettiFadeStartFrame) / Math.max(1, life - V.confettiFadeStartFrame);
    let alpha =
      Math.max(0, Math.min(1, fadeT)) *
      burstStr *
      burstEase *
      (1 - Math.max(0, t - life * 0.92) / (life * 0.08));
    alpha *= ap * 0.94;
    alpha = Math.max(alpha, burstFloor * 0.72 * burstStr * burstEase);

    const tumble =
      seed * 2.65 +
      t * (0.045 + hash01(seed + 1) * 0.098) * (hash01(seed + 50) > 0.5 ? 1 : -1) +
      Math.sin(t * (0.108 + hash01(seed + 51) * 0.065) + seed) * 0.62;

    const sz =
      canvasSize *
      (V.confettiSizeMinFrac +
        hash01(seed + 5) * (V.confettiSizeMaxFrac - V.confettiSizeMinFrac)) *
      (0.82 + hash01(seed + 52) * 0.45);

    const colorIdx = Math.floor(hash01(seed + 60) * CONFETTI_BASE_COLORS.length);
    const [cr, cg, cb] = confettiRgb(seed + i * 0.31, colorIdx);
    const shapeId = Math.floor(hash01(seed + 61) * 11);

    p.push();
    p.translate(px, py);
    p.rotate(tumble);
    if (edgeBoost > 0.02) {
      p.push();
      p.translate(sz * 0.09, sz * 0.08);
      drawOrganicConfettiPiece(
        p,
        shapeId,
        seed,
        sz * 1.04,
        cr * 0.34,
        cg * 0.37,
        cb * 0.3,
        alpha * 0.42 * edgeBoost,
      );
      p.pop();
    }
    drawOrganicConfettiPiece(p, shapeId, seed, sz, cr, cg, cb, alpha * 0.95);
    p.pop();
  }

  // --- Hearts (burst layer) ---
  for (let i = 0; i < heartN; i++) {
    const seed = i * 41.2 + 9.1;
    const ang =
      hash01(seed) * Math.PI * 2 +
      (i / Math.max(1, heartN)) * Math.PI * 2 * 1.13;
    const v0 =
      (V.burstSpeedMin * 0.74 + hash01(seed + 2) * V.burstSpeedMax * 0.68) *
      scale *
      arrivalMul;
    const dist = Math.min(
      maxDist * V.heartDistMul,
      v0 * t * burstEase * 0.58 + t * 0.052 * scale,
    );
    const hx = cx + Math.cos(ang) * dist + Math.sin(t * 0.092 + seed) * canvasSize * 0.003;
    const hy =
      cy +
      Math.sin(ang) * dist +
      t * V.gravity * 0.62 * scale +
      Math.cos(t * 0.068 + seed * 2) * canvasSize * 0.0028;
    const fade =
      t < V.lingerFadeStartFrame
        ? burstStr
        : burstStr *
          (1 - (t - V.lingerFadeStartFrame) / Math.max(1, life - V.lingerFadeStartFrame));
    const hs =
      canvasSize *
      (0.0082 + hash01(seed + 6) * 0.0082) *
      heartMul;
    const [hr, hg, hb] = paletteHearts[i % paletteHearts.length];
    let ha = 0.44 * fade * burstEase * ap;
    ha = Math.max(ha, burstFloor * 0.82 * burstStr * burstEase);
    drawMiniHeart(p, hx, hy, hs, hr, hg, hb, ha);
  }

  // --- Sparkle stars (bright, larger — reads at distance) ---
  for (let i = 0; i < sparkleN; i++) {
    const seed = i * 23.91 + 0.44;
    const ang =
      hash01(seed) * Math.PI * 2 +
      (i / Math.max(1, sparkleN)) * Math.PI * 2 * 1.43 +
      V.burstAngleJitter * hash01(seed + 6);
    const tier = i % 3;
    const spdMul = tier === 0 ? 1.05 : tier === 1 ? 0.82 : 0.68;
    const v0 =
      (V.burstSpeedMin * 0.88 * spdMul + hash01(seed + 4) * V.burstSpeedMax * spdMul) *
      scale *
      arrivalMul;
    const dist = Math.min(
      maxDist * V.sparkleDistMul,
      v0 * t * burstEase * 0.6 + t * 0.1 * scale,
    );
    const sx = cx + Math.cos(ang) * dist;
    const sy = cy + Math.sin(ang) * dist + t * V.gravity * 0.4 * scale;
    const tw = 0.5 + 0.5 * Math.sin(t * 0.43 + seed * 6);
    const u = t / life;
    const fade =
      u < 0.46 ? easeOutQuad(u / 0.46) : (1 - (u - 0.46) / 0.54) ** 1.08;
    let alpha = 0.54 * fade * burstStr * burstEase * tw * ap;
    alpha = Math.max(alpha, midFloor * 1.05 * burstStr * burstEase * tw);
    const sizeMul = (tier === 0 ? 1.12 : tier === 1 ? 0.88 : 0.7) * spSz;
    const size =
      canvasSize *
      0.0122 *
      sizeMul *
      (0.76 + hash01(seed + 7) * 0.58);
    const rot = t * 0.065 + seed;
    const rgb0 =
      i % 5 === 0
        ? [255, 252, 235]
        : i % 5 === 1
          ? [255, 228, 248]
          : i % 5 === 2
            ? [218, 248, 255]
            : i % 5 === 3
              ? [255, 238, 205]
              : [255, 250, 220];
    const rgb = brightenRgb(rgb0, spBr);
    drawStarBurst(p, sx, sy, size, rot, alpha, rgb);
  }

  const orbitWindow = 88;
  if (t < orbitWindow) {
    const orbitFade = 1 - t / orbitWindow;
    for (let i = 0; i < orbitN; i++) {
      const seed = i * 15.7 + 3.3;
      const base = (i / Math.max(1, orbitN)) * Math.PI * 2;
      const ang = base + t * (0.1 + hash01(seed) * 0.055);
      const rad = penR * (1.04 + 0.16 * Math.sin(t * 0.085 + seed));
      const ox = cx + Math.cos(ang) * rad;
      const oy = cy + Math.sin(ang) * rad;
      let alpha = 0.4 * orbitFade * burstStr * (0.5 + 0.5 * Math.sin(t * 0.38 + i)) * ap;
      alpha = Math.max(alpha, midFloor * 0.95 * orbitFade * burstStr);
      const osize = canvasSize * 0.0072 * (0.82 + hash01(seed + 4) * 0.42) * spSz;
      drawStarBurst(
        p,
        ox,
        oy,
        osize,
        t * 0.085 + seed,
        alpha,
        brightenRgb([255, 250, 228], spBr),
      );
    }
  }

  // --- Shimmer trails: after burst motion reads, underline radial flow ---
  drawShimmerArcs(p, cx, cy, penR, t, scale, burstStr, V);

  // --- Floating motes (linger — slow, soft, foreground-capable) ---
  for (let i = 0; i < moteN; i++) {
    const seed = i * 21.13 + 4.2;
    const ang = hash01(seed) * Math.PI * 2;
    const rad = Math.sqrt(hash01(seed + 1)) * maxDist * 0.9;
    const spread = (t * (0.22 + (i % 6) * 0.042) * ld + seed * 40) % 620;
    const px =
      cx +
      Math.cos(ang + spread * 0.0035) *
        Math.min(rad, rad * 0.2 + spread * 0.076 * scale * ld);
    const py =
      cy +
      Math.sin(ang + spread * 0.0035) *
        Math.min(rad, rad * 0.2 + spread * 0.076 * scale * ld) +
      Math.sin(spread * 0.026 + seed) * canvasSize * 0.012;
    if (Math.hypot(px - cx, py - cy) > TABLE_RADIUS * canvasSize * 0.965) continue;
    const u = t / life;
    let fa = (1 - u * 0.72) * burstStr * 0.52 * ap;
    fa = Math.max(fa, lingerFloor * burstStr * 0.95);
    const sz = canvasSize * (0.0045 + (i % 5) * 0.00115);
    p.noStroke();
    p.fill(255, 253, 248, Math.min(210, 38 * fa));
    p.ellipse(px, py, sz, sz * 1.06);
    p.fill(255, 232, 198, Math.min(155, 26 * fa));
    p.ellipse(px - sz * 0.14, py - sz * 0.11, sz * 0.48, sz * 0.46);
  }

  p.pop();
}
