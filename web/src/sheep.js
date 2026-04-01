import { PHYSICAL_MODE, SHEEP, TABLE_RADIUS, PEN } from './config.js';
import { isInsidePen, isInGap, penEdgeInfo } from './pen.js';
import { getDragId } from './input.js';
import { playSfx } from './sound.js';

// -- Flock state --
let flock = [];
let nextSheepId = 0;

/** @type {import('p5').Image | null} */
let sheepSprite = null;

/**
 * Called from main.js after preload so flock drawing can use the PNG sprite.
 * @param {import('p5').Image | null} img
 */
export function setSheepSprite(img) {
  sheepSprite = img;
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
  if (sheep.stress < SHEEP.crisisThreshold) return;
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
      if (inCrisis) {
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

  // Digest when not near any grass
  if (!nearGrass) {
    sheep.grazeFullness = Math.max(0, sheep.grazeFullness - SHEEP.grazeDigestRate);
  }
}

function applyDeescalation(sheep, tools, voice, pet) {
  if (sheep.stress <= 0) {
    sheep.beingPetted = false;
    return;
  }

  // Grass calming: any grass within calm radius reduces stress
  for (const tool of tools) {
    if (tool.type === 'grass') {
      const dx = sheep.x - tool.x;
      const dy = sheep.y - tool.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < SHEEP.grassCalmRadius) {
        sheep.stress = Math.max(0, sheep.stress - SHEEP.grassCalmRate);
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
  // Crisis sheep can't be captured
  if (sheep.stress >= SHEEP.crisisThreshold) {
    sheep.penFrames = 0;
    return;
  }
  if (isInsidePen(sheep.x, sheep.y)) {
    sheep.penFrames++;
    if (sheep.penFrames >= SHEEP.captureSettleTime) {
      sheep.captured = true;
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

  if (sheepSprite && sheepSprite.width > 0) {
    // Asset faces “up”; align with movement direction
    p.push();
    p.rotate(facing + Math.PI / 2);
    const size = r * 2.4;
    p.imageMode(p.CENTER);
    if (inCrisis) {
      p.tint(255, 110, 95, 255);
    } else if (stressRatio < 0.5) {
      const t = stressRatio * 2;
      p.tint(255, Math.round(255 - t * 45), Math.round(255 - t * 70), 255);
    } else {
      const t = (stressRatio - 0.5) * 2;
      p.tint(
        255,
        Math.round(210 - t * 90),
        Math.round(185 - t * 115),
        255,
      );
    }
    p.image(sheepSprite, 0, 0, size, size);
    p.noTint();
    p.pop();
  } else {
    p.noStroke();
    p.fill(inCrisis ? '#e03030' : SHEEP.color);
    p.ellipse(0, 0, r * 1.6, r * 1.4);
  }

  // Pen capture progress ring
  if (!sheep.captured && sheep.penFrames > 0 && sheep.stress < SHEEP.crisisThreshold) {
    const progress = sheep.penFrames / SHEEP.captureSettleTime;
    p.noFill();
    p.stroke(100, 220, 100, 180);
    p.strokeWeight(2.5);
    p.arc(0, 0, r * 2.4, r * 2.4, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  }

  // Petting heart
  if (sheep.beingPetted) {
    p.fill(255, 100, 150, 200);
    p.noStroke();
    const hx = 0;
    const hy = -r * 1.8 + Math.sin(p.frameCount * 0.1) * 3;
    drawHeart(p, hx, hy, r * 0.5);
  }

  p.pop();
}

function drawHeart(p, x, y, size) {
  p.beginShape();
  p.vertex(x, y + size * 0.3);
  p.bezierVertex(x, y - size * 0.2, x - size * 0.6, y - size * 0.4, x, y - size * 0.8);
  p.bezierVertex(x + size * 0.6, y - size * 0.4, x, y - size * 0.2, x, y + size * 0.3);
  p.endShape(p.CLOSE);
}
