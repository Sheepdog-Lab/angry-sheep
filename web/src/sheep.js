import { PHYSICAL_MODE, SHEEP, TABLE_RADIUS, PEN } from './config.js';
import { isInsidePen, isInGap, penEdgeInfo } from './pen.js';
import { getDragId } from './input.js';
import { playSfx } from './sound.js';
import { isHerdActive } from './herdMode.js';

// -- Flock state --
let flock = [];
let nextSheepId = 0;

/** @type {import('p5').Image | null} */
let sheepSprite = null;

/** Calming cue art (`web/public/calming-*.png`); URLs in config. */
/** @type {import('p5').Image | null} */
let calmingFeedingImg = null;
/** @type {import('p5').Image | null} */
let calmingPettingImg = null;

/**
 * Called from main.js after preload so flock drawing can use the PNG sprite.
 * @param {import('p5').Image | null} img
 */
export function setSheepSprite(img) {
  sheepSprite = img;
}

/**
 * @param {{ feeding?: import('p5').Image | null; petting?: import('p5').Image | null }} imgs
 */
export function setCalmingCueSprites(imgs) {
  calmingFeedingImg = imgs?.feeding ?? null;
  calmingPettingImg = imgs?.petting ?? null;
}

// -- Public API --

export function spawnFlock(count = SHEEP.count) {
  flock = [];
  nextSheepId = 0;
  const grazerSlots = Math.round(count * SHEEP.grazerFraction);
  for (let i = 0; i < count; i++) {
    flock.push(createSheep(i < grazerSlots));
  }
}

export function getFlock() {
  return flock;
}

export function isAnySheepEating() {
  return flock.some((s) => s._isEating);
}

/**
 * Step the simulation forward one frame.
 * @param {object} input - full shared contract state { tools, voice, pet }
 */
export function updateFlock(input) {
  const { tools, voice, pet } = input;

  for (const sheep of flock) {
    sheep._tick = (sheep._tick || 0) + 1;

    if (sheep.captured) {
      applyPenCalmWander(sheep);
      continue;
    }

    tryWakeGrazer(sheep, tools, voice, pet);

    // Crisis sheep behave differently
    if (sheep.stress >= SHEEP.crisisThreshold) {
      sheep.grazerUnlocked = true;
      applyCrisisWander(sheep);
    } else if (sheep.stationaryGrazer && !sheep.grazerUnlocked) {
      applyStationaryIdle(sheep);
    } else {
      applyNaturalWander(sheep);
    }

    applySeparation(sheep);
    applyEdgeBounce(sheep);
    applyToolReactions(sheep, tools);
    applyCrisisPenEscape(sheep, tools);
    applyPenFenceCollision(sheep);
    applyDeescalation(sheep, tools, voice, pet);
    updateInteractionFeedback(sheep);
    applyStressTracking(sheep, tools);
    applyPenCapture(sheep);
    move(sheep);
  }

  for (const sheep of flock) {
    if (sheep.captured) applyPenSeparation(sheep);
  }
  for (const sheep of flock) {
    if (sheep.captured) move(sheep);
  }

  // Process pending splits after iteration
  const newSheep = [];
  for (const sheep of flock) {
    if (sheep._splitPending) {
      sheep._splitPending = false;
      if (flock.length + newSheep.length < SHEEP.splitMaxFlock) {
        newSheep.push(createSheepAt(sheep.x, sheep.y, sheep.stress * 0.7));
      }
    }
  }
  if (newSheep.length > 0) {
    flock.push(...newSheep);
  }
}

export function drawFlock(p, canvasSize) {
  for (const sheep of flock) {
    drawSheep(p, sheep, canvasSize);
  }
}

// -- Internals --

function createSheep(stationaryGrazer = false) {
  const angle = Math.random() * Math.PI * 2;
  const minR = PEN.radius + 0.06;
  const maxR = TABLE_RADIUS - SHEEP.tableMargin;
  const dist = minR + Math.random() * (maxR - minR);

  return makeSheep(
    0.5 + Math.cos(angle) * dist,
    0.5 + Math.sin(angle) * dist,
    0,
    { stationaryGrazer },
  );
}

function createSheepAt(x, y, stress) {
  // Offset slightly from parent
  const angle = Math.random() * Math.PI * 2;
  const offset = 0.03;
  return makeSheep(
    x + Math.cos(angle) * offset,
    y + Math.sin(angle) * offset,
    stress,
    { stationaryGrazer: false },
  );
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.stationaryGrazer]
 */
function makeSheep(x, y, stress, opts = {}) {
  const stationaryGrazer = !!opts.stationaryGrazer;
  const { speedMultMin, speedMultMax } = SHEEP;
  const speedMult =
    speedMultMin + Math.random() * (speedMultMax - speedMultMin);
  const wanderJitterPersonal =
    SHEEP.wanderJitter * (0.62 + Math.random() * 0.76);

  return {
    id: nextSheepId++,
    x,
    y,
    vx: 0,
    vy: 0,
    facing: Math.random() * Math.PI * 2,
    wanderAngle: Math.random() * Math.PI * 2,
    captured: false,
    penFrames: 0,
    // Stress / crisis
    stress: stress,            // 0 = calm, >= crisisThreshold = crisis
    dogPushCount: 0,           // consecutive dog pushes while in crisis (for splitting)
    beingPetted: false,        // set each frame by de-escalation check
    /** @type {null | 'pet' | 'grass' | 'voice'} active calming feedback (set in applyDeescalation) */
    _calmingKind: null,
    /** One-shot pet/feed delight animation (frames remaining); see interactionFeedback in config */
    _petReactT: 0,
    _feedReactT: 0,
    _prevBeingPetted: false,
    _prevEating: false,
    _prevGrassCalm: false,
    _lastPetFeedbackTick: -999999,
    _lastFeedFeedbackTick: -999999,
    _splitPending: false,
    _crisisFrames: 0,          // frames spent in crisis (for hint system)
    _tick: 0,
    // Movement personality (desync from flock)
    speedMult,
    wanderJitterPersonal,
    wanderPhase: Math.random() * Math.PI * 2,
    behaviorMode: Math.random() < 0.55 ? 'walk' : 'pause',
    behaviorTimer: Math.floor(20 + Math.random() * 100),
    // Stationary grazers (~¼ flock): idle until interaction
    stationaryGrazer,
    grazerUnlocked: !stationaryGrazer,
    // Grazing (hunger sim)
    grazeFullness: Math.random() * 0.3, // 0 = hungry, 1 = full; start slightly varied
  };
}

// -- Behaviors --

/** Calm settled behavior inside pen — interior bias, edge avoidance, idle/wander. */
function applyPenCalmWander(sheep) {
  const PC = SHEEP.penInside;
  const sm = sheep.speedMult ?? 1;

  if (sheep.penBehaviorMode === undefined) {
    sheep.penBehaviorMode = 'wander';
    sheep.penBehaviorTimer = 20 + Math.floor(Math.random() * 80);
  }

  sheep.vx *= PC.velocityDamping;
  sheep.vy *= PC.velocityDamping;

  sheep.penBehaviorTimer -= 1;
  if (sheep.penBehaviorTimer <= 0) {
    if (Math.random() < PC.penIdleChance) {
      sheep.penBehaviorMode = 'idle';
      sheep.penBehaviorTimer = 45 + Math.floor(Math.random() * 140);
    } else {
      sheep.penBehaviorMode = 'wander';
      sheep.wanderAngle += (Math.random() - 0.5) * PC.penTurnNoise;
      sheep.penBehaviorTimer = 45 + Math.floor(Math.random() * 120);
    }
  }

  const dx = sheep.x - PEN.cx;
  const dy = sheep.y - PEN.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const r = PEN.radius;
  const nd = dist < 1e-8 ? 0 : dist / r;

  if (sheep.penBehaviorMode === 'idle') {
    sheep.vx += (Math.random() - 0.5) * PC.idleDrift * sm;
    sheep.vy += (Math.random() - 0.5) * PC.idleDrift * sm;
  } else {
    sheep.wanderAngle += (Math.random() - 0.5) * PC.penWanderJitter;
    const spur =
      SHEEP.speed * sm * PC.insidePenSpeedMultiplier * (0.11 + Math.random() * 0.1);
    sheep.vx += Math.cos(sheep.wanderAngle) * spur;
    sheep.vy += Math.sin(sheep.wanderAngle) * spur;
  }

  if (dist > 1e-6) {
    const ux = -dx / dist;
    const uy = -dy / dist;

    if (nd > PC.penInteriorComfort) {
      const t = (nd - PC.penInteriorComfort) / (1 - PC.penInteriorComfort);
      const pull = PC.penCenterBias * t * t;
      sheep.vx += ux * pull;
      sheep.vy += uy * pull;
    }
    if (nd > PC.penWanderRadius) {
      const t = (nd - PC.penWanderRadius) / (1 - PC.penWanderRadius);
      const pull = PC.penCenterBias * 0.42 * t * t;
      sheep.vx += ux * pull;
      sheep.vy += uy * pull;
    }
    if (nd > PC.edgeAvoidStart) {
      const t = (nd - PC.edgeAvoidStart) / (1 - PC.edgeAvoidStart);
      const push = PC.penEdgeAvoidance * t * t;
      sheep.vx += ux * push;
      sheep.vy += uy * push;
    }
  }
}

function applyPenSeparation(sheep) {
  const PC = SHEEP.penInside;
  const sep = PC.sheepSeparationInsidePen;
  const forceMul = PC.penSeparationForceMul;
  for (const other of flock) {
    if (other.id === sheep.id || !other.captured) continue;
    const dx = sheep.x - other.x;
    const dy = sheep.y - other.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < sep && dist > 0.001) {
      const f = (SHEEP.separationForce * forceMul) / dist;
      sheep.vx += (dx / dist) * f;
      sheep.vy += (dy / dist) * f;
    }
  }
}

function tryWakeGrazer(sheep, tools, voice, pet) {
  if (!sheep.stationaryGrazer || sheep.grazerUnlocked) return;

  // Speaking (e.g. hold V) counts as interaction even before sentiment resolves.
  if (voice && voice.active) {
    sheep.grazerUnlocked = true;
    return;
  }

  if (pet && pet.active) {
    const dx = sheep.x - pet.x;
    const dy = sheep.y - pet.y;
    if (Math.sqrt(dx * dx + dy * dy) < SHEEP.petRadius * 1.15) {
      sheep.grazerUnlocked = true;
      return;
    }
  }

  for (const tool of tools) {
    const dx = sheep.x - tool.x;
    const dy = sheep.y - tool.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) continue;

    if (tool.type === 'sheepdog' && dist < SHEEP.dogFleeRadius) {
      sheep.grazerUnlocked = true;
      return;
    }
    if (tool.type === 'grass' && dist < SHEEP.grassAttractRadius) {
      sheep.grazerUnlocked = true;
      return;
    }
    if (tool.type === 'block' && dist < SHEEP.blockDetectRadius) {
      sheep.grazerUnlocked = true;
      return;
    }
  }
}

/** Mostly still: tiny drift + heavy damping until woken. */
function applyStationaryIdle(sheep) {
  const sm = sheep.speedMult ?? 1;
  sheep.vx *= 0.84;
  sheep.vy *= 0.84;
  sheep.wanderAngle += (Math.random() - 0.5) * 0.035;

  const t = sheep._tick * 0.035 + sheep.wanderPhase;
  if (Math.random() < 0.018 + 0.01 * Math.sin(t)) {
    const nudge = SHEEP.speed * sm * 0.045;
    sheep.vx += (Math.random() - 0.5) * nudge;
    sheep.vy += (Math.random() - 0.5) * nudge;
  }
}

/**
 * Walk / pause / turn with per-sheep timing so motion is not synchronized.
 */
function applyNaturalWander(sheep) {
  const sm = sheep.speedMult ?? 1;
  const t = sheep._tick * 0.038 + sheep.wanderPhase;
  const desync = 1 + 0.32 * Math.sin(t);

  if (sheep.behaviorMode === 'pause') {
    sheep.vx *= 0.86 + Math.random() * 0.04;
    sheep.vy *= 0.86 + Math.random() * 0.04;
    sheep.wanderAngle += (Math.random() - 0.5) * 0.09;
    sheep.behaviorTimer -= 1;
    if (sheep.behaviorTimer <= 0) {
      sheep.behaviorMode = 'walk';
      sheep.behaviorTimer = 40 + Math.floor(Math.random() * 150);
      if (Math.random() < 0.45) {
        sheep.wanderAngle += (Math.random() - 0.5) * 1.1;
      }
    }
    return;
  }

  // walk
  const jitter =
    (Math.random() - 0.5) * sheep.wanderJitterPersonal * desync;
  sheep.wanderAngle += jitter;

  const spur =
    SHEEP.speed *
    sm *
    (0.22 + Math.random() * 0.14) *
    (0.78 + 0.22 * Math.sin(t * 1.3));

  sheep.vx += Math.cos(sheep.wanderAngle) * spur;
  sheep.vy += Math.sin(sheep.wanderAngle) * spur;

  sheep.behaviorTimer -= 1;
  if (sheep.behaviorTimer <= 0) {
    sheep.behaviorMode = 'pause';
    sheep.behaviorTimer = 10 + Math.floor(Math.random() * 52);
  }

  if (Math.random() < 0.0018) {
    sheep.behaviorMode = 'pause';
    sheep.behaviorTimer = 6 + Math.floor(Math.random() * 28);
  }
}

function applyCrisisWander(sheep) {
  // Erratic, fast wandering
  const sm = sheep.speedMult ?? 1;
  sheep.wanderAngle += (Math.random() - 0.5) * SHEEP.crisisWanderJitter;
  const spd = SHEEP.speed * SHEEP.crisisSpeedMult * sm;
  sheep.vx += Math.cos(sheep.wanderAngle) * spd * 0.4;
  sheep.vy += Math.sin(sheep.wanderAngle) * spd * 0.4;
}

function applySeparation(sheep) {
  const sepScale =
    sheep.stationaryGrazer && !sheep.grazerUnlocked ? 0.32 : 1;
  for (const other of flock) {
    if (other.id === sheep.id || other.captured) continue;
    const dx = sheep.x - other.x;
    const dy = sheep.y - other.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < SHEEP.flockSeparation && dist > 0.001) {
      const force = (SHEEP.separationForce / dist) * sepScale;
      sheep.vx += (dx / dist) * force;
      sheep.vy += (dy / dist) * force;
    }
  }
}

function applyEdgeBounce(sheep) {
  const dx = sheep.x - 0.5;
  const dy = sheep.y - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const limit = TABLE_RADIUS - SHEEP.tableMargin;

  if (dist > limit && dist > 0.001) {
    sheep.vx -= (dx / dist) * SHEEP.edgePushForce;
    sheep.vy -= (dy / dist) * SHEEP.edgePushForce;
  }
}

/** Crisis sheep inside/near the pen steer toward the nearest unblocked gap and bolt out. */
function applyCrisisPenEscape(sheep, tools) {
  if (sheep.captured) return;
  if (sheep.stress < SHEEP.crisisThreshold * 0.9) return;
  const info = penEdgeInfo(sheep.x, sheep.y);
  // Only act when inside or very close to the pen fence
  if (info.dist >= PEN.radius + SHEEP.penFenceThickness) return;

  // Build list of gaps sorted by angular distance, skip blocked ones
  const blockRadius = 0.06;
  const candidates = [];
  for (const [gs, ge] of PEN.gaps) {
    let mid;
    if (gs > ge) {
      mid = (gs + ge + 360) / 2;
      if (mid >= 360) mid -= 360;
    } else {
      mid = (gs + ge) / 2;
    }
    let diff = mid - info.angleDeg;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    // Check if a tool is blocking this gap
    const gapRad = (mid * Math.PI) / 180;
    const gapX = PEN.cx + Math.cos(gapRad) * PEN.radius;
    const gapY = PEN.cy + Math.sin(gapRad) * PEN.radius;
    let blocked = false;
    for (const tool of tools) {
      const tdx = tool.x - gapX;
      const tdy = tool.y - gapY;
      if (Math.sqrt(tdx * tdx + tdy * tdy) < blockRadius) {
        blocked = true;
        break;
      }
    }

    candidates.push({ mid, angDist: Math.abs(diff), blocked });
  }

  // Sort by angular distance, prefer unblocked
  candidates.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    return a.angDist - b.angDist;
  });

  const chosen = candidates[0];
  if (!chosen) return;

  // Steer toward the chosen gap's position just outside the pen edge
  const gapRad = (chosen.mid * Math.PI) / 180;
  const targetX = PEN.cx + Math.cos(gapRad) * (PEN.radius + 0.02);
  const targetY = PEN.cy + Math.sin(gapRad) * (PEN.radius + 0.02);
  const dx = targetX - sheep.x;
  const dy = targetY - sheep.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;

  const force = SHEEP.crisisPenEscapeForce * 2.5;
  sheep.vx += (dx / d) * force;
  sheep.vy += (dy / d) * force;
  sheep.wanderAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.15;
}

/** Free sheep mildly avoid pen area so they don't wander in accidentally. */
function applyPenAvoidance(sheep) {
  if (sheep.captured) return;
  if (sheep.stress >= SHEEP.crisisThreshold) return;
  const dx = sheep.x - PEN.cx;
  const dy = sheep.y - PEN.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist >= SHEEP.penAvoidRadius || dist < 1e-6) return;
  // Ramp force up as sheep gets closer to pen center
  const t = 1 - dist / SHEEP.penAvoidRadius;
  const force = SHEEP.penAvoidForce * t * t;
  const ux = dx / dist;
  const uy = dy / dist;
  sheep.vx += ux * force;
  sheep.vy += uy * force;
}

/** Pen fence blocks sheep at wall segments; gaps allow passage. */
function applyPenFenceCollision(sheep) {
  if (sheep.captured) return;
  const info = penEdgeInfo(sheep.x, sheep.y);
  const thickness = SHEEP.penFenceThickness;
  const distFromEdge = Math.abs(info.dist - PEN.radius);
  // Only activate near the fence edge
  if (distFromEdge > thickness) return;
  // If at a gap, allow free passage
  if (isInGap(info.angleDeg)) return;
  // At a wall — push outward / inward based on which side we're on
  const dx = sheep.x - PEN.cx;
  const dy = sheep.y - PEN.cy;
  const d = info.dist < 1e-6 ? 1e-6 : info.dist;
  const ux = dx / d;
  const uy = dy / d;
  // Determine push direction: outward if approaching from outside, inward if from inside
  // For non-captured sheep approaching from outside (most common), push outward
  const pushDir = info.dist >= PEN.radius ? 1 : -1;
  sheep.vx += ux * SHEEP.penFenceBounceForce * pushDir;
  sheep.vy += uy * SHEEP.penFenceBounceForce * pushDir;
  // Clamp position to just outside/inside the fence
  if (info.dist >= PEN.radius) {
    const pushR = PEN.radius + thickness * 0.5;
    if (info.dist < pushR) {
      sheep.x = PEN.cx + ux * pushR;
      sheep.y = PEN.cy + uy * pushR;
    }
  } else {
    const pushR = PEN.radius - thickness * 0.5;
    if (info.dist > pushR) {
      sheep.x = PEN.cx + ux * pushR;
      sheep.y = PEN.cy + uy * pushR;
    }
  }
  // Deflect wander angle to be tangential (slide along wall)
  const tangent = Math.atan2(uy, ux) + Math.PI / 2;
  const diff = sheep.wanderAngle - tangent;
  if (Math.abs(diff) > Math.PI / 2) {
    sheep.wanderAngle = tangent + (diff > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // Dampen radial velocity component
  const radial = sheep.vx * ux + sheep.vy * uy;
  if ((pushDir > 0 && radial < 0) || (pushDir < 0 && radial > 0)) {
    sheep.vx -= ux * radial * 0.7;
    sheep.vy -= uy * radial * 0.7;
  }
}

function applyToolReactions(sheep, tools) {
  let nearbyBlocks = 0;
  let nearGrass = false;
  let eatingGrass = false;
  let herdCalming = false;
  const inCrisis = sheep.stress >= SHEEP.crisisThreshold;

  for (const tool of tools) {
    const dx = sheep.x - tool.x;
    const dy = sheep.y - tool.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dogToSheepX = sheep.x - tool.x;
    const dogToSheepY = sheep.y - tool.y;
    const inFrontOfDog = dist <= 0.001 || tool.type !== 'sheepdog'
      ? true
      : isPointInForwardCone(tool, dogToSheepX, dogToSheepY);

    if (tool.type === 'sheepdog' && dist < SHEEP.dogFleeRadius && dist > 0.001 && inFrontOfDog) {
      if (isHerdActive()) {
        // Herd mode (wizard-of-oz): same physical contact, kind words flip
        // the meaning. Calm the sheep regardless of crisis state, and don't
        // accumulate the split counter while we're herding.
        sheep.stress = Math.max(0, sheep.stress - SHEEP.herdCalmRate * 0.02);
        herdCalming = true;
      } else if (inCrisis) {
        // Crisis sheep ignore sheepdogs for movement — but it adds to split counter
        sheep.dogPushCount++;
        if (sheep.dogPushCount >= SHEEP.splitStressPush * 60) {
          // Accumulated enough push frames → split
          sheep._splitPending = true;
          sheep.dogPushCount = 0;
        }
      } else {
        // Normal flee + add stress
        const force = SHEEP.dogFleeForce * (1 - dist / SHEEP.dogFleeRadius);
        sheep.vx += (dx / dist) * force;
        sheep.vy += (dy / dist) * force;
        sheep.stress = Math.min(sheep.stress + SHEEP.stressPerPush * 0.02, SHEEP.crisisThreshold + 0.5);
      }
    }

    if (tool.type === 'grass' && dist < SHEEP.grassAttractRadius && dist > 0.001) {
      nearGrass = true;
      if (inCrisis) {
        // Mad sheep are always hungry — grass attracts and comforts them
        const force = SHEEP.grassAttractForce * (1 - dist / SHEEP.grassAttractRadius);
        sheep.vx -= (dx / dist) * force;
        sheep.vy -= (dy / dist) * force;
      } else {
        // Calm sheep: attracted briefly, but fill up fast and lose interest
        const hunger = 1 - sheep.grazeFullness;
        if (hunger > 0.01) {
          const force = SHEEP.grassAttractForce * hunger * (1 - dist / SHEEP.grassAttractRadius);
          sheep.vx -= (dx / dist) * force;
          sheep.vy -= (dy / dist) * force;
        }
        // Fill up quickly when close
        if (dist < SHEEP.grassAttractRadius * 0.5) {
          eatingGrass = true;
          sheep.grazeFullness = Math.min(1, sheep.grazeFullness + SHEEP.grazeFillRate);
        }
      }
    }

    if (tool.type === 'block' && dist < SHEEP.blockDetectRadius && dist > 0.001) {
      nearbyBlocks++;
      const force = SHEEP.blockRepelForce / Math.max(dist, 0.01);
      sheep.vx += (dx / dist) * force;
      sheep.vy += (dy / dist) * force;

      // Actively dragged block angers the sheep
      if (tool.id === getDragId()) {
        sheep.stress = Math.min(
          sheep.stress + SHEEP.blockDragStressRate,
          SHEEP.crisisThreshold + 0.5,
        );
      }

      const awayAngle = Math.atan2(dy, dx);
      let wanderDiff = sheep.wanderAngle - awayAngle;
      while (wanderDiff > Math.PI) wanderDiff -= Math.PI * 2;
      while (wanderDiff < -Math.PI) wanderDiff += Math.PI * 2;
      if (Math.abs(wanderDiff) > Math.PI / 2) {
        sheep.wanderAngle = awayAngle + (wanderDiff > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
  }

  if (nearbyBlocks >= 2) {
    const damping = Math.max(0.3, 1 - nearbyBlocks * 0.25);
    sheep.vx *= damping;
    sheep.vy *= damping;
  }

  sheep._isEating = eatingGrass;
  sheep._herdCalming = herdCalming;

  // Digest when not near any grass
  if (!nearGrass) {
    sheep.grazeFullness = Math.max(0, sheep.grazeFullness - SHEEP.grazeDigestRate);
  }
}

function applyDeescalation(sheep, tools, voice, pet) {
  sheep._calmingKind = null;

  if (sheep.stress <= 0) {
    sheep.beingPetted = false;
    return;
  }

  let grassCalming = false;

  // Grass calming: any grass within calm radius reduces stress
  for (const tool of tools) {
    if (tool.type === 'grass') {
      const dx = sheep.x - tool.x;
      const dy = sheep.y - tool.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < SHEEP.grassCalmRadius) {
        sheep.stress = Math.max(0, sheep.stress - SHEEP.grassCalmRate);
        grassCalming = true;
      }
    }
  }

  // Petting: mouse click/hold near sheep
  sheep.beingPetted = false;
  if (pet && pet.active) {
    const dx = sheep.x - pet.x;
    const dy = sheep.y - pet.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < SHEEP.petRadius) {
      sheep.stress = Math.max(0, sheep.stress - SHEEP.petCalmRate);
      sheep.beingPetted = true;
    }
  }

  // Voice: positive sentiment reduces stress
  if (voice && voice.active && voice.sentiment === 'positive') {
    sheep.stress = Math.max(0, sheep.stress - SHEEP.voiceCalmRate);
  }

  // One clear feedback variant: most direct interaction wins.
  // Herd contact intentionally does NOT set a _calmingKind — the herd
  // visual is the looping pet-bloom glow driven from updateInteractionFeedback,
  // not the floating PNG cue.
  if (sheep.beingPetted) {
    sheep._calmingKind = 'pet';
  } else if (grassCalming) {
    sheep._calmingKind = 'grass';
  } else if (voice && voice.active && voice.sentiment === 'positive') {
    sheep._calmingKind = 'voice';
  }
}

function updateInteractionFeedback(sheep) {
  const IF = SHEEP.interactionFeedback;
  const prevPet = sheep._petReactT;
  const prevFeed = sheep._feedReactT;

  if (sheep._petReactT > 0) sheep._petReactT--;
  if (sheep._feedReactT > 0) sheep._feedReactT--;

  if (prevPet === 1 && sheep._petReactT === 0) {
    sheep.vx += (Math.random() - 0.5) * IF.relaxImpulse * 2.2;
    sheep.vy += (Math.random() - 0.5) * IF.relaxImpulse * 2.2;
  }
  if (prevFeed === 1 && sheep._feedReactT === 0) {
    sheep.vx += (Math.random() - 0.5) * IF.relaxImpulse * 2.2;
    sheep.vy += (Math.random() - 0.5) * IF.relaxImpulse * 2.2;
  }

  const grassCalmNow = sheep._calmingKind === 'grass';
  const petEdge = sheep.beingPetted && !sheep._prevBeingPetted;
  const feedEdge =
    (sheep._isEating && !sheep._prevEating) ||
    (grassCalmNow && !sheep._prevGrassCalm && sheep.stress > 0);

  if (petEdge && sheep._tick - sheep._lastPetFeedbackTick >= IF.petCooldownFrames) {
    sheep._petReactT = IF.petFrames;
    sheep._lastPetFeedbackTick = sheep._tick;
  }
  if (feedEdge && sheep._tick - sheep._lastFeedFeedbackTick >= IF.feedCooldownFrames) {
    sheep._feedReactT = IF.feedFrames;
    sheep._lastFeedFeedbackTick = sheep._tick;
  }

  // Wizard-of-oz herd: reuse the pet bloom (the glowing rings + hearts that
  // fire when petting starts). Re-trigger it whenever it expires while
  // sheepdog contact in herd mode is still happening, so the glow loops
  // continuously instead of playing once.
  if (
    sheep._herdCalming &&
    sheep._petReactT === 0 &&
    sheep._tick - sheep._lastPetFeedbackTick >= IF.petCooldownFrames
  ) {
    sheep._petReactT = IF.petFrames;
    sheep._lastPetFeedbackTick = sheep._tick;
  }

  sheep._prevBeingPetted = sheep.beingPetted;
  sheep._prevEating = !!sheep._isEating;
  sheep._prevGrassCalm = grassCalmNow;
}

function applyStressTracking(sheep, tools) {
  // Track crisis duration for hint system
  if (sheep.stress >= SHEEP.crisisThreshold) {
    // Play mad sheep SFX on first frame of crisis
    if (sheep._crisisFrames === 0) {
      playSfx('madSheep');
    }
    sheep._crisisFrames++;
  } else {
    sheep._crisisFrames = 0;
  }

  // Reset dog push counter when no sheepdogs nearby
  let dogNearby = false;
  for (const tool of tools) {
    if (tool.type === 'sheepdog') {
      const dx = sheep.x - tool.x;
      const dy = sheep.y - tool.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < SHEEP.dogFleeRadius && isPointInForwardCone(tool, dx, dy)) {
        dogNearby = true;
        break;
      }
    }
  }
  if (!dogNearby) {
    sheep.dogPushCount = 0;
  }
}

function isPointInForwardCone(tool, dx, dy) {
  if (typeof tool.rotation !== 'number') return true;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0.0001) return true;
  const forwardX = Math.cos(tool.rotation);
  const forwardY = Math.sin(tool.rotation);
  const dot = ((dx / dist) * forwardX) + ((dy / dist) * forwardY);
  return dot > PHYSICAL_MODE.sheepdogForwardConeDotMin;
}

function applyPenCapture(sheep) {
  // Agitated sheep (>= 70% stress) can't be captured — they escape instead
  if (sheep.stress >= SHEEP.crisisThreshold * 0.9) {
    sheep.penFrames = 0;
    return;
  }
  if (isInsidePen(sheep.x, sheep.y)) {
    sheep.penFrames++;
    if (sheep.penFrames >= SHEEP.captureSettleTime) {
      sheep.captured = true;
      sheep.stress = 0;
      playSfx('smallWin');
    }
  } else {
    sheep.penFrames = Math.max(0, sheep.penFrames - 2);
  }
}

function angleLerp(from, to, t) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

function move(sheep) {
  const inCrisis = sheep.stress >= SHEEP.crisisThreshold;
  const inPen = sheep.captured;
  const sm = sheep.speedMult ?? 1;
  const maxSpd = inPen
    ? SHEEP.speed *
      SHEEP.penInside.insidePenSpeedMultiplier *
      SHEEP.penInside.penMaxSpeedMult *
      sm
    : inCrisis
      ? SHEEP.speed * SHEEP.crisisSpeedMult * sm
      : SHEEP.speed * 1.6 * sm;
  const speed = Math.sqrt(sheep.vx * sheep.vx + sheep.vy * sheep.vy);

  const facingThresh = SHEEP.speed * sm * 0.28;
  if (speed > facingThresh) {
    const target = Math.atan2(sheep.vy, sheep.vx);
    sheep.facing = angleLerp(
      sheep.facing,
      target,
      inPen ? 0.06 : inCrisis ? 0.25 : 0.1,
    );
  }

  if (speed > maxSpd) {
    sheep.vx = (sheep.vx / speed) * maxSpd;
    sheep.vy = (sheep.vy / speed) * maxSpd;
  }

  sheep.x += sheep.vx;
  sheep.y += sheep.vy;

  sheep.vx *= inPen ? 0.9 : inCrisis ? 0.95 : 0.92;
  sheep.vy *= inPen ? 0.9 : inCrisis ? 0.95 : 0.92;

  // Keep captured sheep inside pen (soft interior, no fence hugging)
  if (inPen) {
    const pdx = sheep.x - PEN.cx;
    const pdy = sheep.y - PEN.cy;
    const pd = Math.sqrt(pdx * pdx + pdy * pdy);
    const maxR = PEN.radius * SHEEP.penInside.penClampRadius;
    if (pd > maxR && pd > 1e-6) {
      sheep.x = PEN.cx + (pdx / pd) * maxR;
      sheep.y = PEN.cy + (pdy / pd) * maxR;
      const radial = (sheep.vx * pdx + sheep.vy * pdy) / pd;
      if (radial > 0) {
        sheep.vx -= (pdx / pd) * radial * 0.62;
        sheep.vy -= (pdy / pd) * radial * 0.62;
      }
    }
  }

  // Hard clamp to table circle
  const dx = sheep.x - 0.5;
  const dy = sheep.y - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > TABLE_RADIUS) {
    sheep.x = 0.5 + (dx / dist) * TABLE_RADIUS;
    sheep.y = 0.5 + (dy / dist) * TABLE_RADIUS;
    sheep.vx *= -0.3;
    sheep.vy *= -0.3;
  }
}

// -- Drawing --

/** u = 0…1 over reaction; fast ease-out expansion (bloom outward). */
function vfxExpandT(u, speed, power) {
  if (u <= 0) return 0;
  const x = Math.min(1, u * speed);
  return 1 - (1 - x) ** power;
}

/** Soft fade after vfxFadeStart (0…1). */
function vfxAlphaEnvelope(u, fadeStart, fadePower) {
  if (u <= 0) return 0;
  if (u <= fadeStart) return 1;
  const t = (u - fadeStart) / (1 - fadeStart);
  return (1 - t) ** fadePower;
}

/** Linked sheep squash/bounce: peaks mid-reaction, fades with envelope. */
function interactionBodyPulse(u, IF) {
  if (u <= 0) return 0;
  return Math.sin(u * Math.PI) * vfxAlphaEnvelope(u, IF.vfxFadeStart, IF.vfxFadePower);
}

function drawSheep(p, sheep, canvasSize) {
  const s = canvasSize;
  const px = sheep.x * s;
  const py = sheep.y * s;
  const r = SHEEP.radius * s;
  const inCrisis = sheep.stress >= SHEEP.crisisThreshold;
  const stressRatio = Math.min(sheep.stress / SHEEP.crisisThreshold, 1);

  const grazingLocked =
    sheep.stationaryGrazer &&
    !sheep.grazerUnlocked &&
    !sheep.captured &&
    sheep.stress < SHEEP.crisisThreshold;

  p.push();
  p.translate(px, py);

  // Idle graze: subtle bob + lean (eating / looking down)
  if (grazingLocked) {
    const gt = sheep._tick * 0.088 + sheep.wanderPhase + sheep.id * 0.37;
    const bob = Math.sin(gt) * r * 0.15;
    const lean = Math.sin(gt * 1.71) * 0.12;
    p.translate(0, bob);
    p.rotate(lean * 0.22);
  }

  // Crisis shake
  if (inCrisis) {
    const shake = 2 + sheep.stress * 1.5;
    p.translate(
      (Math.random() - 0.5) * shake,
      (Math.random() - 0.5) * shake,
    );
  }

  const facing = sheep.facing;
  const IF = SHEEP.interactionFeedback;
  const petRem = sheep._petReactT;
  const feedRem = sheep._feedReactT;
  const uPet = petRem > 0 ? 1 - petRem / IF.petFrames : 0;
  const uFeed = feedRem > 0 ? 1 - feedRem / IF.feedFrames : 0;
  const petPulse = petRem > 0 ? interactionBodyPulse(uPet, IF) * IF.petIntensity : 0;
  const feedPulse = feedRem > 0 ? interactionBodyPulse(uFeed, IF) * IF.feedIntensity : 0;
  const happyBoost =
    petPulse * IF.petHappyTintBoost + feedPulse * IF.feedHappyTintBoost;

  if (sheepSprite && sheepSprite.width > 0) {
    // Asset faces “up”; align with movement direction
    p.push();
    p.rotate(facing + Math.PI / 2);
    const bounce = (petPulse * IF.petBounceR + feedPulse * IF.feedBounceR) * r;
    p.translate(0, -bounce);
    p.translate(
      petPulse * IF.petAffectionWiggle * r * 0.22 * Math.sin(sheep._tick * 0.92 + sheep.id * 1.7),
      feedPulse * IF.feedForwardNudgeR * r,
    );
    p.rotate(
      feedPulse * IF.feedNibbleLean +
        petPulse * IF.petAffectionWiggle * Math.sin(sheep._tick * 0.88 + sheep.id),
    );
    const sx =
      1 +
      petPulse * IF.petSquashStretchX +
      feedPulse * IF.feedSquashStretchX;
    const sy =
      1 -
      petPulse * IF.petSquashStretchY -
      feedPulse * IF.feedSquashStretchY;
    p.scale(sx, sy);
    const size = r * 2.4;
    p.imageMode(p.CENTER);
    if (inCrisis) {
      p.tint(255, 110, 95, 255);
    } else {
      let tr = 255;
      let tg;
      let tb;
      if (stressRatio < 0.5) {
        const t = stressRatio * 2;
        tg = Math.round(255 - t * 45);
        tb = Math.round(255 - t * 70);
      } else {
        const t = (stressRatio - 0.5) * 2;
        tg = Math.round(210 - t * 90);
        tb = Math.round(185 - t * 115);
      }
      if (happyBoost > 0.01) {
        tg = Math.min(255, Math.round(tg + happyBoost * 42));
        tb = Math.min(255, Math.round(tb + happyBoost * 58));
      }
      p.tint(tr, tg, tb, 255);
    }
    p.image(sheepSprite, 0, 0, size, size);
    p.noTint();
    p.pop();
  } else {
    p.push();
    const bounce = (petPulse * IF.petBounceR + feedPulse * IF.feedBounceR) * r;
    p.translate(0, -bounce);
    p.translate(
      petPulse * IF.petAffectionWiggle * r * 0.22 * Math.sin(sheep._tick * 0.92 + sheep.id * 1.7),
      feedPulse * IF.feedForwardNudgeR * r,
    );
    p.rotate(
      feedPulse * IF.feedNibbleLean +
        petPulse * IF.petAffectionWiggle * Math.sin(sheep._tick * 0.88 + sheep.id),
    );
    const sx =
      1 +
      petPulse * IF.petSquashStretchX +
      feedPulse * IF.feedSquashStretchX;
    const sy =
      1 -
      petPulse * IF.petSquashStretchY -
      feedPulse * IF.feedSquashStretchY;
    p.scale(sx, sy);
    p.noStroke();
    p.fill(inCrisis ? '#e03030' : SHEEP.color);
    p.ellipse(0, 0, r * 1.6, r * 1.4);
    p.pop();
  }

  drawInteractionFeedbackEffects(p, sheep, r, petRem, feedRem);

  // Pen capture progress ring
  if (!sheep.captured && sheep.penFrames > 0 && sheep.stress < SHEEP.crisisThreshold) {
    const progress = sheep.penFrames / SHEEP.captureSettleTime;
    p.noFill();
    p.stroke(100, 220, 100, 180);
    p.strokeWeight(2.5);
    p.arc(0, 0, r * 2.4, r * 2.4, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  }

  if (sheep._calmingKind) {
    drawCalmingIndicator(p, sheep, r, sheep._calmingKind);
  }

  p.pop();
}

/**
 * Outward bloom: elements spawn near sheep and move/scaling with expansion; alpha fades via envelope.
 */
function drawInteractionFeedbackEffects(p, sheep, r, petRem, feedRem) {
  const IF = SHEEP.interactionFeedback;
  if (petRem <= 0 && feedRem <= 0) return;

  if (petRem > 0) {
    const u = 1 - petRem / IF.petFrames;
    drawPetInteractionBloom(p, sheep, r, u, IF);
  }
  if (feedRem > 0) {
    const u = 1 - feedRem / IF.feedFrames;
    drawFeedInteractionBloom(p, sheep, r, u, IF);
  }
}

function drawPetInteractionBloom(p, sheep, r, u, IF) {
  const exp = vfxExpandT(u, IF.vfxExpandSpeed, IF.vfxExpandPower);
  const env = vfxAlphaEnvelope(u, IF.vfxFadeStart, IF.vfxFadePower);
  const alpha = IF.petEffectOpacity * 255 * env * IF.petIntensity;
  const glowA = IF.petGlowOpacity * 255 * env * IF.petIntensity;
  const radMax =
    r *
    (IF.petBloomRadiusMin + exp * (IF.petBloomRadiusMax - IF.petBloomRadiusMin));
  const emitY = IF.petEmitY * r;
  const asp = IF.petBloomAspect;
  const orbit = u * IF.petOrbitDrift + sheep._tick * 0.045 + sheep.id * 0.7;
  const breathe = 1 + Math.sin(sheep._tick * 0.19 + sheep.id) * 0.06 * exp;

  p.noStroke();
  for (let k = 0; k < IF.petGlowRingCount; k++) {
    const kf = 1 - k * 0.22;
    const ringS =
      IF.petGlowStartScale +
      exp * (IF.petGlowMaxScale - IF.petGlowStartScale) * (0.72 + k * 0.14);
    const ga = glowA * 0.22 * kf * kf * (0.55 + 0.45 * exp);
    p.fill(255, 198, 218, ga);
    p.ellipse(0, emitY, r * ringS * 2 * breathe * kf, r * ringS * 2 * asp * breathe * kf);
    p.fill(255, 228, 238, ga * 0.55);
    p.ellipse(0, emitY - r * 0.04 * exp, r * ringS * 1.45 * kf, r * ringS * 1.45 * asp * kf);
  }

  const n = IF.petHeartCount;
  const radial = radMax * exp;
  const hsBase =
    r *
    IF.petHeartBaseSize *
    (0.5 + 0.5 * exp) *
    (1 + exp * IF.petHeartExpandScale) *
    IF.petIntensity;

  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + orbit + Math.sin(u * 6.2 + i) * 0.08;
    const px = Math.cos(ang) * radial;
    const py = emitY + Math.sin(ang) * radial * asp;
    const jitter = 1 + 0.08 * Math.sin(sheep._tick * 0.31 + i * 1.7);
    const hs = hsBase * jitter;
    const a = alpha * (0.88 + 0.12 * Math.sin(i * 1.3 + u * 8));
    const outline = [110, 65, 78, a * 0.42];
    drawHeart(
      p,
      px,
      py,
      hs,
      [255, 125, 175, a],
      i % 3 === 0 ? outline : null,
    );
  }

  const spR = r * (0.09 + 0.06 * exp) * IF.petIntensity;
  drawSparkle(
    p,
    Math.cos(orbit + 0.7) * radial * 0.55,
    emitY + Math.sin(orbit + 0.7) * radial * asp * 0.55,
    spR,
    sheep._tick * 0.11 + u,
    [255, 225, 175],
    alpha * 0.92,
  );
  drawSparkle(
    p,
    Math.cos(orbit + 2.1) * radial * 0.62,
    emitY + Math.sin(orbit + 2.1) * radial * asp * 0.62,
    spR * 0.88,
    sheep._tick * 0.09 - u,
    [255, 245, 220],
    alpha * 0.85,
  );
}

function drawFeedInteractionBloom(p, sheep, r, u, IF) {
  const exp = vfxExpandT(u, IF.vfxExpandSpeed, IF.vfxExpandPower);
  const env = vfxAlphaEnvelope(u, IF.vfxFadeStart, IF.vfxFadePower);
  const alpha = IF.feedEffectOpacity * 255 * env * IF.feedIntensity;
  const glowA = IF.feedGlowOpacity * 255 * env * IF.feedIntensity;
  const radMax =
    r *
    (IF.feedBloomRadiusMin + exp * (IF.feedBloomRadiusMax - IF.feedBloomRadiusMin));
  const emitY = IF.feedEmitY * r;
  const asp = IF.feedBloomAspect;
  const orbit = u * IF.feedOrbitDrift + sheep._tick * 0.052 + sheep.id * 0.9;
  const breathe = 1 + Math.sin(sheep._tick * 0.21 + sheep.id * 0.5) * 0.07 * exp;

  p.noStroke();
  for (let k = 0; k < IF.feedGlowRingCount; k++) {
    const kf = 1 - k * 0.28;
    const ringS =
      IF.feedGlowStartScale +
      exp * (IF.feedGlowMaxScale - IF.feedGlowStartScale) * (0.75 + k * 0.2);
    const ga = glowA * 0.26 * kf * (0.5 + 0.5 * exp);
    p.fill(185, 245, 205, ga);
    p.ellipse(0, emitY, r * ringS * 2 * breathe * kf, r * ringS * 2 * asp * breathe * kf);
    p.fill(235, 255, 225, ga * 0.45);
    p.ellipse(0, emitY - r * 0.05 * exp, r * ringS * 1.35 * kf, r * ringS * 1.35 * asp * kf);
  }

  const n = IF.feedSparkleCount;
  const radial = radMax * exp;
  const spBase =
    r *
    IF.feedSparkleBaseSize *
    (0.55 + 0.45 * exp) *
    (1 + exp * IF.feedSparkleExpandScale) *
    IF.feedIntensity;

  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + orbit + i * 0.35;
    const px = Math.cos(ang) * radial * (0.85 + 0.15 * Math.sin(i * 2.1));
    const py = emitY + Math.sin(ang) * radial * asp * (0.85 + 0.15 * Math.cos(i * 1.8));
    const arm = spBase * (0.75 + 0.25 * Math.sin(i + u * 10));
    const a = alpha * (0.82 + 0.18 * Math.sin(i * 1.1 + u * 7));
    const gold = [255, 230, 150 + (i % 3) * 15];
    const mint = [95 + (i % 4) * 18, 210 + (i % 2) * 15, 130 + (i % 3) * 12];
    const rgb = i % 2 === 0 ? gold : mint;
    drawSparkle(p, px, py, arm, orbit + i * 0.9 + sheep._tick * 0.1, rgb, a);
  }

  const crumbs = 5;
  for (let c = 0; c < crumbs; c++) {
    const ang = (c / crumbs) * Math.PI * 2 + orbit * 1.3;
    const cr = radial * (0.35 + 0.4 * exp);
    const cx = Math.cos(ang) * cr;
    const cy = emitY + Math.sin(ang) * cr * asp + r * 0.12 * (1 - exp);
    const ca = alpha * 0.4 * env * (0.7 + 0.3 * Math.sin(c + u * 5));
    p.fill(130 + c * 8, 210 - c * 5, 120 + c * 6, ca);
    p.ellipse(cx, cy, r * (0.11 + 0.04 * exp), r * (0.07 + 0.03 * exp));
  }
}

/** Soft heart shape; set fill/stroke on `p` before calling, or pass rgba + outline. */
function drawHeart(p, x, y, size, fillRgba, outlineRgba) {
  if (fillRgba) {
    p.fill(fillRgba[0], fillRgba[1], fillRgba[2], fillRgba[3]);
  }
  if (outlineRgba) {
    p.stroke(outlineRgba[0], outlineRgba[1], outlineRgba[2], outlineRgba[3]);
    p.strokeWeight(Math.max(1.1, size * 0.13));
  } else {
    p.noStroke();
  }
  p.beginShape();
  p.vertex(x, y + size * 0.3);
  p.bezierVertex(x, y - size * 0.2, x - size * 0.6, y - size * 0.4, x, y - size * 0.8);
  p.bezierVertex(x + size * 0.6, y - size * 0.4, x, y - size * 0.2, x, y + size * 0.3);
  p.endShape(p.CLOSE);
}

/** Four-point twinkle; warm, readable on terrain. */
function drawSparkle(p, x, y, arm, rot, rgb, alpha) {
  if (!rgb || rgb.length < 3 || !Number.isFinite(arm) || arm <= 0) return;
  p.push();
  p.translate(x, y);
  p.rotate(rot);
  p.stroke(rgb[0], rgb[1], rgb[2], alpha * 0.85);
  p.strokeWeight(arm * 0.42);
  p.strokeCap(p.ROUND);
  p.line(-arm, 0, arm, 0);
  p.line(0, -arm, 0, arm);
  p.noStroke();
  p.fill(rgb[0], rgb[1], rgb[2], alpha);
  p.circle(0, 0, arm * 0.55);
  p.pop();
}

function drawVoiceCue(p, r) {
  p.push();
  p.translate(r * 0.48, r * 0.26);
  p.noStroke();
  p.fill(255, 245, 210, 245);
  p.ellipse(-r * 0.05, 0, r * 0.11, r * 0.09);
  p.ellipse(r * 0.02, -r * 0.02, r * 0.13, r * 0.1);
  p.ellipse(r * 0.1, r * 0.02, r * 0.09, r * 0.08);
  p.fill(255, 228, 160, 230);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(r * 0.28);
  p.text('♪', r * 0.22, -r * 0.12);
  p.pop();
}

/** p5 failed loads leave a 1×1 placeholder; treat that as “not loaded”. */
function isCalmingCueImageReady(img) {
  return (
    img &&
    typeof img.width === 'number' &&
    img.width > 2 &&
    typeof img.height === 'number' &&
    img.height > 2
  );
}

let calmingCueMissingWarned = false;

/** Feeding / petting: PNG only (no badge/plate); alpha from art + tint pulse; float/breathe from parent. */
function drawCalmingFeedPetArt(p, r, kind, pulse) {
  const img = kind === 'grass' ? calmingFeedingImg : calmingPettingImg;
  const isGrass = kind === 'grass';

  if (!isCalmingCueImageReady(img)) {
    if (!calmingCueMissingWarned && typeof console !== 'undefined') {
      calmingCueMissingWarned = true;
      console.warn(
        '[calming] Feeding/petting PNG not ready (failed load or 1×1 placeholder). Check network tab for',
        isGrass ? 'feeding' : 'petting',
        'asset.',
      );
    }
    return;
  }

  const targetH = r * 1.72;
  const sc = targetH / img.height;
  const w = img.width * sc;
  const h = img.height * sc;
  const alpha = Math.round(255 * (0.88 + 0.1 * pulse));
  p.imageMode(p.CENTER);
  p.tint(255, 255, 255, alpha);
  p.image(img, 0, -r * 0.05, w, h);
  p.noTint();
}

/**
 * Rich “calming” read: glow + hearts + sparkles + kind cue. Stays above the sprite with soft motion.
 */
function drawCalmingIndicator(p, sheep, r, kind) {
  const phase = sheep._tick * 0.11 + sheep.wanderPhase;
  const id = sheep.id * 1.17;
  const baseY = -r * 2.42;
  const floatY =
    Math.sin(phase * 1.35) * (r * 0.09) + Math.sin(phase * 0.71 + id) * (r * 0.05);
  const floatX = Math.sin(phase * 0.88 + id) * (r * 0.07);
  const breathe = 1 + Math.sin(phase * 1.65) * 0.055;
  const pulse = 0.88 + 0.12 * Math.sin(phase * 2.1);

  const isVoice = kind === 'voice';

  p.push();
  p.translate(floatX, baseY + floatY);
  p.scale(breathe);

  if (kind === 'pet' || kind === 'grass') {
    drawCalmingFeedPetArt(p, r, kind, pulse);
    p.pop();
    return;
  }

  const glowCore = isVoice
    ? [228, 214, 252]
    : [255, 218, 228];
  const glowOuter = isVoice
    ? [210, 195, 245]
    : [255, 195, 210];

  // Contrast anchor (reads on grass / wood terrain)
  p.noStroke();
  p.fill(28, 22, 38, 72 * pulse);
  p.ellipse(0, r * 0.18, r * 1.45, r * 0.52);

  // Layered soft glow
  for (let layer = 0; layer < 4; layer++) {
    const k = 1 - layer / 5;
    const a = (0.1 + k * 0.1) * pulse * 255;
    p.fill(
      glowOuter[0] + (glowCore[0] - glowOuter[0]) * (layer / 3.5),
      glowOuter[1] + (glowCore[1] - glowOuter[1]) * (layer / 3.5),
      glowOuter[2] + (glowCore[2] - glowOuter[2]) * (layer / 3.5),
      a * 0.45,
    );
    const d = r * (1.15 + layer * 0.38);
    p.ellipse(0, -r * 0.06, d, d * 0.92);
  }

  const sparkleGold = [255, 214, 120];
  const sparkleRose = [255, 175, 195];
  const sparkleMint = [140, 215, 165];
  const sparkleLav = [220, 200, 255];
  const sparkleCream = [255, 235, 205];

  const sets = isVoice
    ? [sparkleLav, sparkleGold, sparkleRose]
    : [sparkleGold, sparkleRose, sparkleCream];

  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + phase * 0.38 + id * 0.2;
    const rad = r * (0.62 + 0.14 * Math.sin(phase * 1.4 + i * 0.9));
    const sx = Math.cos(ang) * rad;
    const sy = Math.sin(ang) * rad * 0.52 - r * 0.1;
    const arm = r * (0.07 + 0.025 * Math.sin(phase * 2.4 + i));
    const tw = 0.65 + 0.35 * Math.sin(phase * 2.1 + i * 1.4);
    const c = sets[i % sets.length];
    drawSparkle(p, sx, sy, arm * tw, phase * 0.65 + i * 0.4, c, 228 * pulse);
  }

  const outline = [120, 72, 82, 130];
  drawHeart(p, -r * 0.38, -r * 0.12, r * 0.32, [255, 148, 178, 245 * pulse], outline);
  drawHeart(p, r * 0.32, r * 0.04, r * 0.22, [255, 120, 165, 215 * pulse], outline);
  drawHeart(p, 0, -r * 0.38, r * 0.2, [255, 195, 210, 185 * pulse], outline);

  if (kind === 'voice') {
    drawVoiceCue(p, r);
  }

  p.pop();
}
