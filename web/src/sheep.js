import { SHEEP, TABLE_RADIUS, PEN } from './config.js';
import { isInsidePen } from './pen.js';

// -- Flock state --
let flock = [];
let nextSheepId = 0;

// -- Public API --

export function spawnFlock(count = SHEEP.count) {
  flock = [];
  nextSheepId = 0;
  for (let i = 0; i < count; i++) {
    flock.push(createSheep());
  }
}

export function getFlock() {
  return flock;
}

/**
 * Step the simulation forward one frame.
 * @param {object} input - full shared contract state { tools, voice, pet }
 */
export function updateFlock(input) {
  const { tools, voice, pet } = input;

  for (const sheep of flock) {
    if (sheep.captured) {
      applyPenWander(sheep);
      move(sheep);
      continue;
    }

    // Crisis sheep behave differently
    if (sheep.stress >= SHEEP.crisisThreshold) {
      applyCrisisWander(sheep);
    } else {
      applyWander(sheep);
    }

    applySeparation(sheep);
    applyEdgeBounce(sheep);
    applyToolReactions(sheep, tools);
    applyDeescalation(sheep, tools, voice, pet);
    applyStressTracking(sheep, tools);
    applyPenCapture(sheep);
    move(sheep);
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

function createSheep() {
  const angle = Math.random() * Math.PI * 2;
  const minR = PEN.radius + 0.06;
  const maxR = TABLE_RADIUS - SHEEP.tableMargin;
  const dist = minR + Math.random() * (maxR - minR);

  return makeSheep(
    0.5 + Math.cos(angle) * dist,
    0.5 + Math.sin(angle) * dist,
    0,
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
  );
}

function makeSheep(x, y, stress) {
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
    // Grazing
    grazeFullness: Math.random() * 0.3, // 0 = hungry, 1 = full; start slightly varied
  };
}

// -- Behaviors --

function applyPenWander(sheep) {
  sheep.wanderAngle += (Math.random() - 0.5) * 0.4;
  sheep.vx += Math.cos(sheep.wanderAngle) * SHEEP.speed * 0.12;
  sheep.vy += Math.sin(sheep.wanderAngle) * SHEEP.speed * 0.12;

  const dx = sheep.x - PEN.cx;
  const dy = sheep.y - PEN.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const limit = PEN.radius * 0.7;
  if (dist > limit && dist > 0.001) {
    sheep.vx -= (dx / dist) * 0.001;
    sheep.vy -= (dy / dist) * 0.001;
  }
}

function applyWander(sheep) {
  sheep.wanderAngle += (Math.random() - 0.5) * SHEEP.wanderJitter;
  sheep.vx += Math.cos(sheep.wanderAngle) * SHEEP.speed * 0.3;
  sheep.vy += Math.sin(sheep.wanderAngle) * SHEEP.speed * 0.3;
}

function applyCrisisWander(sheep) {
  // Erratic, fast wandering
  sheep.wanderAngle += (Math.random() - 0.5) * SHEEP.crisisWanderJitter;
  const spd = SHEEP.speed * SHEEP.crisisSpeedMult;
  sheep.vx += Math.cos(sheep.wanderAngle) * spd * 0.4;
  sheep.vy += Math.sin(sheep.wanderAngle) * spd * 0.4;
}

function applySeparation(sheep) {
  for (const other of flock) {
    if (other.id === sheep.id || other.captured) continue;
    const dx = sheep.x - other.x;
    const dy = sheep.y - other.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < SHEEP.flockSeparation && dist > 0.001) {
      const force = SHEEP.separationForce / dist;
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

function applyToolReactions(sheep, tools) {
  let nearbyBlocks = 0;
  let nearGrass = false;
  const inCrisis = sheep.stress >= SHEEP.crisisThreshold;

  for (const tool of tools) {
    const dx = sheep.x - tool.x;
    const dy = sheep.y - tool.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (tool.type === 'sheepdog' && dist < SHEEP.dogFleeRadius && dist > 0.001) {
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
          sheep.grazeFullness = Math.min(1, sheep.grazeFullness + SHEEP.grazeFillRate);
        }
      }
    }

    if (tool.type === 'block' && dist < SHEEP.blockDetectRadius && dist > 0.001) {
      nearbyBlocks++;
      const force = SHEEP.blockRepelForce / Math.max(dist, 0.01);
      sheep.vx += (dx / dist) * force;
      sheep.vy += (dy / dist) * force;

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
      if (Math.sqrt(dx * dx + dy * dy) < SHEEP.dogFleeRadius) {
        dogNearby = true;
        break;
      }
    }
  }
  if (!dogNearby) {
    sheep.dogPushCount = 0;
  }
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
  const maxSpd = inCrisis ? SHEEP.speed * SHEEP.crisisSpeedMult : SHEEP.speed * 1.6;
  const speed = Math.sqrt(sheep.vx * sheep.vx + sheep.vy * sheep.vy);

  if (speed > SHEEP.speed * 0.3) {
    const target = Math.atan2(sheep.vy, sheep.vx);
    sheep.facing = angleLerp(sheep.facing, target, inCrisis ? 0.25 : 0.1);
  }

  if (speed > maxSpd) {
    sheep.vx = (sheep.vx / speed) * maxSpd;
    sheep.vy = (sheep.vy / speed) * maxSpd;
  }

  sheep.x += sheep.vx;
  sheep.y += sheep.vy;

  sheep.vx *= inCrisis ? 0.95 : 0.92;
  sheep.vy *= inCrisis ? 0.95 : 0.92;

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

  p.push();
  p.translate(px, py);

  // Crisis shake
  if (inCrisis) {
    const shake = 2 + sheep.stress * 1.5;
    p.translate(
      (Math.random() - 0.5) * shake,
      (Math.random() - 0.5) * shake,
    );
  }

  const facing = sheep.facing;

  // Stress color: lerp white → orange → red
  let woolColor, puffColor;
  if (stressRatio < 0.5) {
    // Calm to mildly stressed: white → warm orange
    const t = stressRatio * 2;
    woolColor = lerpColorHex('#f0f0e8', '#f0a050', t);
    puffColor = lerpColorHex('#e8e8dd', '#e8904a', t);
  } else {
    // Stressed to crisis: orange → red
    const t = (stressRatio - 0.5) * 2;
    woolColor = lerpColorHex('#f0a050', '#e03030', t);
    puffColor = lerpColorHex('#e8904a', '#d02828', t);
  }

  // Wool puffs
  p.noStroke();
  p.fill(puffColor);
  const puffCount = 6;
  for (let i = 0; i < puffCount; i++) {
    const a = (i / puffCount) * Math.PI * 2;
    const puffDist = r * 0.4;
    p.ellipse(Math.cos(a) * puffDist, Math.sin(a) * puffDist, r * 1.0);
  }

  // Main body
  p.fill(woolColor);
  p.ellipse(0, 0, r * 1.6, r * 1.4);

  // Face
  const faceDist = r * 0.5;
  const fx = Math.cos(facing) * faceDist;
  const fy = Math.sin(facing) * faceDist;
  p.fill('#3a3a3a');
  p.ellipse(fx, fy, r * 0.7, r * 0.6);

  // Eyes — wider/angrier when stressed
  const eyeSize = r * (0.18 + stressRatio * 0.08);
  p.fill(inCrisis ? '#ff3333' : SHEEP.eyeColor);
  const eyeOff = r * 0.15;
  const eyePerp = facing + Math.PI / 2;
  p.ellipse(
    fx + Math.cos(eyePerp) * eyeOff,
    fy + Math.sin(eyePerp) * eyeOff,
    eyeSize,
  );
  p.ellipse(
    fx - Math.cos(eyePerp) * eyeOff,
    fy - Math.sin(eyePerp) * eyeOff,
    eyeSize,
  );

  // Angry eyebrows when stressed
  if (stressRatio > 0.3) {
    p.stroke(inCrisis ? '#ff3333' : '#555555');
    p.strokeWeight(1.5);
    const browLen = r * 0.2;
    const browY = -r * 0.08;
    // Left brow (angled down toward center)
    const bl = { x: fx + Math.cos(eyePerp) * eyeOff, y: fy + Math.sin(eyePerp) * eyeOff };
    p.line(bl.x - browLen * 0.5, bl.y + browY - browLen * 0.3, bl.x + browLen * 0.5, bl.y + browY + browLen * 0.1);
    // Right brow
    const br = { x: fx - Math.cos(eyePerp) * eyeOff, y: fy - Math.sin(eyePerp) * eyeOff };
    p.line(br.x - browLen * 0.5, br.y + browY + browLen * 0.1, br.x + browLen * 0.5, br.y + browY - browLen * 0.3);
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

function lerpColorHex(hex1, hex2, t) {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}
