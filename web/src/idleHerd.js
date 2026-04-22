// -- Auto-herd on sheepdog inactivity --
//
// Tracks sheepdog tool movement. After SESSION.autoHerdIdleFrames of no
// movement, auto-herd engages and the *single* sheep closest to the pen
// walks itself in. As soon as that sheep is captured, the idle counter
// resets — another 60s of inactivity picks the next-closest sheep, and so
// on, so the flock trickles in one at a time instead of storming the pen
// all at once. Any sheepdog motion clears the chosen sheep immediately.

import { SESSION, PEN } from './config.js';

let framesSinceMovement = 0;
let autoHerdActive = false;
/** Id of the single sheep currently being steered in; null when inactive. */
let chosenSheepId = null;
/** Last-known position per sheepdog, keyed by tool.id (fallback: index). */
let lastPositions = new Map();

/** Reset on session start/reset. */
export function resetIdleHerd() {
  framesSinceMovement = 0;
  autoHerdActive = false;
  chosenSheepId = null;
  lastPositions = new Map();
}

/**
 * Call once per frame, before updateFlock.
 * @param {Array<{type: string, x: number, y: number, id?: any}>} tools
 * @param {Array<{id: number, captured: boolean, x: number, y: number}>} flock
 */
export function tickIdleHerd(tools, flock) {
  const sheepdogs = tools.filter((t) => t.type === 'sheepdog');
  const eps = SESSION.sheepdogMoveEpsilon;
  const next = new Map();
  let moved = false;

  for (let i = 0; i < sheepdogs.length; i++) {
    const dog = sheepdogs[i];
    const key = dog.id ?? `i${i}`;
    const prev = lastPositions.get(key);
    if (prev) {
      const dx = dog.x - prev.x;
      const dy = dog.y - prev.y;
      if (Math.sqrt(dx * dx + dy * dy) > eps) moved = true;
    }
    next.set(key, { x: dog.x, y: dog.y });
  }
  lastPositions = next;

  if (sheepdogs.length === 0) {
    // Nothing to be idle from. Clear state.
    framesSinceMovement = 0;
    autoHerdActive = false;
    chosenSheepId = null;
    return;
  }

  if (moved) {
    framesSinceMovement = 0;
    autoHerdActive = false;
    chosenSheepId = null;
    return;
  }

  // If the chosen sheep reached the pen (got captured), reset the idle counter
  // so another ~60s of stillness picks the next sheep. This is what makes the
  // flock trickle in one at a time.
  if (chosenSheepId !== null) {
    const chosen = flock.find((s) => s.id === chosenSheepId);
    if (!chosen || chosen.captured) {
      chosenSheepId = null;
      autoHerdActive = false;
      framesSinceMovement = 0;
      return;
    }
  }

  framesSinceMovement++;
  if (!autoHerdActive && framesSinceMovement >= SESSION.autoHerdIdleFrames) {
    autoHerdActive = true;
  }

  // Pick the single sheep closest to the pen the moment auto-herd engages.
  if (autoHerdActive && chosenSheepId === null) {
    let best = null;
    let bestD = Infinity;
    for (const s of flock) {
      if (s.captured) continue;
      const dx = s.x - PEN.cx;
      const dy = s.y - PEN.cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (best) chosenSheepId = best.id;
  }
}

export function isAutoHerdActive() {
  return autoHerdActive;
}

export function getChosenSheepId() {
  return chosenSheepId;
}
