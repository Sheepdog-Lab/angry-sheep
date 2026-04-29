import {
  TOOL_COLORS,
  TOOL_HIT_RADIUS,
  TOOL_ROTATE_STEP,
  TOOL_BLOCK_ROTATE_STEP,
  TABLE_RADIUS,
  INITIAL_TOOLS,
  MAX_LOCAL_PLAYERS,
} from './config.js';
import { hitTest } from './tools.js';
import { resolveToolOverlap } from './toolCollide.js';
import * as Session from './session.js';
import { getGameMode, onGameModeChange } from './gameMode.js';
import { getCanvasPointer, getCanvasTouchPoint } from './tableProjection.js';

/** Synthetic pointer id for the mouse (touch ids are non-negative). */
const MOUSE_POINTER_ID = -1;

// -- State (matches shared contract) --
const state = {
  tools: [],
  voice: { active: false, sentiment: null },
  /** Normalized petting points (0–1); empty when no one is petting. */
  pet: { points: [] },
};

let canvasSize = 0;
let p5Ref = null;

/** @type {Map<number, { toolId: number, offsetX: number, offsetY: number }>} */
const activeDrags = new Map();

/** Tool ids under any pointer (mouse + touches). */
const hoveredIds = new Set();

let mouseIsDown = false;
/** Three “kind voice” slots: V, U, I (same sentiment when any held; B is reserved for grooming hint). */
const voiceDown = [false, false, false];
let savedDigitalTools = [];

/** When true, local drags do not move tools (guests send input to the host instead). */
let guestMultiplayerMode = false;

// -- Public API --

export function getState() {
  return state;
}

export function setGuestMultiplayerMode(on) {
  guestMultiplayerMode = !!on;
  if (guestMultiplayerMode) {
    activeDrags.clear();
    mouseIsDown = false;
  }
}

export function isGuestMultiplayerMode() {
  return guestMultiplayerMode;
}

export function getToolsSnapshot() {
  return state.tools.map((t) => ({ ...t }));
}

export function replaceToolsFromSnapshot(rows) {
  if (!Array.isArray(rows)) return;
  state.tools.length = 0;
  for (let i = 0; i < rows.length; i++) {
    state.tools.push({ ...rows[i] });
  }
}

/** @returns {Set<number>} copy of tool ids under any pointer */
export function getHoveredIds() {
  return new Set(hoveredIds);
}

/** @deprecated Prefer {@link getHoveredIds}; returns an arbitrary hovered tool id. */
export function getHoveredId() {
  const it = hoveredIds.values().next();
  return it.done ? null : it.value;
}

/** @returns {true} if this tool is being dragged by any pointer (digital co-op). */
export function isToolBeingDragged(toolId) {
  for (const d of activeDrags.values()) {
    if (d.toolId === toolId) return true;
  }
  return false;
}

export function init(p, size) {
  p5Ref = p;
  canvasSize = size;

  // Place fixed tools on the table
  state.tools = INITIAL_TOOLS.map((t, i) => ({
    ...t,
    id: i,
  }));
  savedDigitalTools = cloneTools(state.tools);

  p.mousePressed = onMousePressed;
  p.mouseDragged = onMouseDragged;
  p.mouseReleased = onMouseReleased;
  p.mouseWheel = onMouseWheel;
  p.touchStarted = onTouchStarted;
  p.touchMoved = onTouchMoved;
  p.touchEnded = onTouchEnded;

  if (p.canvas) {
    p.canvas.style.touchAction = 'none';
    p.canvas.addEventListener('touchcancel', onCanvasTouchCancel, { passive: true });
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  onGameModeChange(handleModeChange);

  // Handle race: if initCameraSwitcher already triggered physical mode
  // before this listener was registered, apply it now.
  if (getGameMode() === 'physical') {
    handleModeChange('physical');
  }
}

export function updateCanvasSize(size) {
  canvasSize = size;
}

export function setToolCount(type, count) {
  if (getGameMode() !== 'digital') return;
  const current = state.tools.filter((t) => t.type === type);
  const diff = count - current.length;
  if (diff > 0) {
    // Add tools at random positions inside the table
    let maxId = state.tools.reduce((m, t) => Math.max(m, t.id), 0);
    for (let i = 0; i < diff; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.15 + Math.random() * 0.25;
      maxId++;
      state.tools.push({
        type,
        id: maxId,
        x: 0.5 + Math.cos(angle) * dist,
        y: 0.5 + Math.sin(angle) * dist,
        angle_deg: Math.floor(Math.random() * 360),
      });
    }
  } else if (diff < 0) {
    // Remove from the end
    let toRemove = -diff;
    for (let i = state.tools.length - 1; i >= 0 && toRemove > 0; i--) {
      if (state.tools[i].type === type) {
        state.tools.splice(i, 1);
        toRemove--;
      }
    }
  }
}

export function setPhysicalTools(tools) {
  if (getGameMode() !== 'physical') return;
  state.tools = cloneTools(tools);
}

/**
 * Draw the HUD: tool legend + help text.
 */
export function drawHUD(p, size) {
  const s = size;
  const margin = 16;

  const voiceCount = voiceDown.filter(Boolean).length;
  if (voiceCount > 0) {
    p.fill(150, 255, 150, 180);
    p.noStroke();
    p.textSize(13);
    p.textAlign(p.LEFT, p.CENTER);
    const label =
      voiceCount > 1
        ? `♪ speaking kindly… (${voiceCount} players)`
        : '♪ speaking kindly…';
    p.text(label, margin, margin + 12);
  }

  // Help hint (bottom-left)
  p.fill(255, 255, 255, 80);
  p.noStroke();
  p.textSize(11);
  p.textAlign(p.LEFT, p.BOTTOM);
  p.text(
    `Up to ${MAX_LOCAL_PLAYERS} players: multi-touch drag (or mouse)  |  Scroll: rotate  |  ← → or A D (or R); blocks & dogs fine step  |  Dog auto-aim returns when far from flock  |  Kind voice: V / U / I  |  Calm: comb or empty-hand touch near sheep`,
    margin,
    s - margin,
  );
}

// -- Internal helpers --

function normalize(px, py) {
  return { x: px / canvasSize, y: py / canvasSize };
}

function cloneTools(tools) {
  return tools.map((tool) => ({ ...tool }));
}

function syncVoiceFromKeys() {
  state.voice.active = voiceDown[0] || voiceDown[1] || voiceDown[2];
  state.voice.sentiment = state.voice.active ? 'positive' : null;
}

function resetInteractionState() {
  activeDrags.clear();
  hoveredIds.clear();
  mouseIsDown = false;
  voiceDown[0] = false;
  voiceDown[1] = false;
  voiceDown[2] = false;
  syncVoiceFromKeys();
  state.pet.points = [];
}

function handleModeChange(mode) {
  resetInteractionState();
  if (mode === 'physical') {
    savedDigitalTools = cloneTools(state.tools);
    state.tools = [];
    return;
  }
  state.tools = cloneTools(savedDigitalTools);
}

function isInsideCanvas(px, py) {
  return px >= 0 && px <= canvasSize && py >= 0 && py <= canvasSize;
}

function pointer(p) {
  return getCanvasPointer(p, canvasSize);
}

function toolDraggedByOtherPointer(toolId, myPointerId) {
  for (const [pid, d] of activeDrags) {
    if (pid !== myPointerId && d.toolId === toolId) return true;
  }
  return false;
}

function tryPointerDown(pointerId, mx, my) {
  if (Session.getPhase() === 'win') return;
  if (guestMultiplayerMode) return;

  const n = normalize(mx, my);
  const id = hitTest(state.tools, n.x, n.y);
  if (id === null) return;

  if (toolDraggedByOtherPointer(id, pointerId)) return;

  const dragCount = activeDrags.size;
  if (dragCount >= MAX_LOCAL_PLAYERS && !activeDrags.has(pointerId)) return;

  const tool = state.tools.find((t) => t.id === id);
  if (!tool) return;

  activeDrags.set(pointerId, {
    toolId: id,
    offsetX: tool.x - n.x,
    offsetY: tool.y - n.y,
  });
}

function applyDragPosition(pointerId) {
  const drag = activeDrags.get(pointerId);
  if (!drag) return;

  let mx;
  let my;
  if (pointerId === MOUSE_POINTER_ID) {
    const pm = pointer(p5Ref);
    mx = pm.x;
    my = pm.y;
  } else {
    const t = p5Ref.touches.find((touch) => touch.id === pointerId);
    if (!t) return;
    const pt = getCanvasTouchPoint(p5Ref, canvasSize, t.x, t.y);
    mx = pt.x;
    my = pt.y;
  }

  if (!isInsideCanvas(mx, my)) return;

  const n = normalize(mx, my);
  const tool = state.tools.find((tr) => tr.id === drag.toolId);
  if (!tool) return;

  let tx = n.x + drag.offsetX;
  let ty = n.y + drag.offsetY;
  const dx = tx - 0.5;
  const dy = ty - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxR = TABLE_RADIUS - TOOL_HIT_RADIUS;
  if (dist > maxR) {
    tx = 0.5 + (dx / dist) * maxR;
    ty = 0.5 + (dy / dist) * maxR;
  }
  const resolved = resolveToolOverlap(tool, tx, ty, state.tools);
  tool.x = resolved.x;
  tool.y = resolved.y;
}

function syncAllDragPositions() {
  for (const pid of activeDrags.keys()) {
    applyDragPosition(pid);
  }
}

const STEER_TYPES = new Set(['block', 'sheepdog', 'grass', 'comb']);

function getSteerTargetTool() {
  for (const d of activeDrags.values()) {
    const tool = state.tools.find((t) => t.id === d.toolId);
    if (tool && STEER_TYPES.has(tool.type)) return tool;
  }
  for (const hid of hoveredIds) {
    const tool = state.tools.find((t) => t.id === hid);
    if (tool && STEER_TYPES.has(tool.type)) return tool;
  }
  return null;
}

function toolUnderMouseForWheel() {
  const pm = pointer(p5Ref);
  if (!isInsideCanvas(pm.x, pm.y)) return null;
  const n = normalize(pm.x, pm.y);
  const id = hitTest(state.tools, n.x, n.y);
  return id !== null ? state.tools.find((t) => t.id === id) : null;
}

// -- Event handlers --

function onMousePressed() {
  if (getGameMode() !== 'digital') return;
  const p = p5Ref;
  if (p.mouseButton !== p.LEFT) return;

  if (Session.getPhase() === 'win') {
    return;
  }

  mouseIsDown = true;
  const { x: mx, y: my } = pointer(p);
  if (!isInsideCanvas(mx, my)) return;

  tryPointerDown(MOUSE_POINTER_ID, mx, my);
}

function onMouseDragged() {
  if (getGameMode() !== 'digital') return;
  applyDragPosition(MOUSE_POINTER_ID);
}

function onMouseReleased() {
  if (getGameMode() !== 'digital') {
    resetInteractionState();
    return;
  }
  activeDrags.delete(MOUSE_POINTER_ID);
  mouseIsDown = false;
}

function onTouchStarted() {
  if (getGameMode() !== 'digital') return;
  if (Session.getPhase() === 'win') return;
  const touches = p5Ref.touches;
  if (touches.length === 0) return false;

  for (let i = 0; i < touches.length; i++) {
    const t = touches[i];
    const pid = t.id;
    if (activeDrags.has(pid)) continue;
    const { x, y } = getCanvasTouchPoint(p5Ref, canvasSize, t.x, t.y);
    if (!isInsideCanvas(x, y)) continue;
    tryPointerDown(pid, x, y);
  }
  return false;
}

function onTouchMoved() {
  if (getGameMode() !== 'digital') return;
  syncAllDragPositions();
  return false;
}

function onTouchEnded() {
  if (getGameMode() !== 'digital') return;
  const remaining = new Set(p5Ref.touches.map((t) => t.id));
  for (const pid of [...activeDrags.keys()]) {
    if (pid === MOUSE_POINTER_ID) continue;
    if (!remaining.has(pid)) {
      activeDrags.delete(pid);
    }
  }
  return false;
}

/** p5 has no touchCancelled hook; browser still fires touchcancel on iOS. */
function onCanvasTouchCancel() {
  if (getGameMode() !== 'digital') return;
  for (const pid of [...activeDrags.keys()]) {
    if (pid !== MOUSE_POINTER_ID) activeDrags.delete(pid);
  }
}

function rotateStepDeg(toolType) {
  if (toolType === 'block' || toolType === 'sheepdog') {
    return TOOL_BLOCK_ROTATE_STEP;
  }
  return TOOL_ROTATE_STEP;
}

function onMouseWheel(event) {
  if (getGameMode() !== 'digital') return;
  if (guestMultiplayerMode) return;
  const tool = toolUnderMouseForWheel();
  if (tool !== null) {
    if (tool.type === 'sheepdog') {
      const dir = event.delta > 0 ? 1 : -1;
      const step = rotateStepDeg(tool.type);
      tool.sheepdogManualAim = true;
      tool.angle_deg = (tool.angle_deg + dir * step) % 360;
    } else if (tool.type !== 'sheepdog') {
      const dir = event.delta > 0 ? 1 : -1;
      const step = rotateStepDeg(tool.type);
      tool.angle_deg = (tool.angle_deg + dir * step) % 360;
    }
    return false;
  }
}

function onKeyDown(event) {
  if (Session.getPhase() === 'win' && (event.code === 'Enter' || event.code === 'Space')) {
    event.preventDefault();
    Session.skipVictoryToReset();
    return;
  }

  if (getGameMode() !== 'digital') return;

  if (guestMultiplayerMode) {
    if (
      event.code === 'KeyV' ||
      event.code === 'KeyU' ||
      event.code === 'KeyI'
    ) {
      /* voice only — fall through */
    } else {
      return;
    }
  }

  const steerKey =
    event.code === 'ArrowLeft' ||
    event.code === 'ArrowRight' ||
    event.code === 'KeyA' ||
    event.code === 'KeyD';
  if (!guestMultiplayerMode && steerKey) {
    const steerTool = getSteerTargetTool();
    if (steerTool) {
      event.preventDefault();
      const dirRight =
        event.code === 'ArrowRight' || event.code === 'KeyD';
      const dir = dirRight ? 1 : -1;
      const step = rotateStepDeg(steerTool.type);
      if (steerTool.type === 'sheepdog') steerTool.sheepdogManualAim = true;
      steerTool.angle_deg = (steerTool.angle_deg + dir * step) % 360;
      return;
    }
  }

  if (!guestMultiplayerMode && (event.key === 'r' || event.key === 'R')) {
    const tool = toolUnderMouseForWheel();
    if (tool && tool.type === 'sheepdog') {
      const step = rotateStepDeg(tool.type);
      tool.sheepdogManualAim = true;
      tool.angle_deg = (tool.angle_deg + step) % 360;
    } else if (tool && tool.type !== 'sheepdog') {
      const step = rotateStepDeg(tool.type);
      tool.angle_deg = (tool.angle_deg + step) % 360;
    }
  } else if (event.code === 'KeyV') {
    voiceDown[0] = true;
    syncVoiceFromKeys();
  } else if (event.code === 'KeyU') {
    voiceDown[1] = true;
    syncVoiceFromKeys();
  } else if (event.code === 'KeyI') {
    voiceDown[2] = true;
    syncVoiceFromKeys();
  }
}

function onKeyUp(event) {
  if (getGameMode() !== 'digital') return;
  if (event.code === 'KeyV') {
    voiceDown[0] = false;
    syncVoiceFromKeys();
  } else if (event.code === 'KeyU') {
    voiceDown[1] = false;
    syncVoiceFromKeys();
  } else if (event.code === 'KeyI') {
    voiceDown[2] = false;
    syncVoiceFromKeys();
  }
}

/**
 * Each frame: sync multi-pointer drags, hovers, and petting sample points.
 */
export function updateHover(p) {
  p5Ref = p;
  if (getGameMode() !== 'digital') {
    hoveredIds.clear();
    state.pet.points = [];
    return;
  }

  syncAllDragPositions();

  hoveredIds.clear();
  const addHover = (mx, my) => {
    if (!isInsideCanvas(mx, my)) return;
    const n = normalize(mx, my);
    const id = hitTest(state.tools, n.x, n.y);
    if (id !== null) hoveredIds.add(id);
  };

  const pm = pointer(p);
  addHover(pm.x, pm.y);
  for (let i = 0; i < p.touches.length; i++) {
    const t = p.touches[i];
    const pt = getCanvasTouchPoint(p, canvasSize, t.x, t.y);
    addHover(pt.x, pt.y);
  }

  state.pet.points = [];
  if (mouseIsDown && !activeDrags.has(MOUSE_POINTER_ID)) {
    state.pet.points.push(normalize(pm.x, pm.y));
  }
  for (let i = 0; i < p.touches.length; i++) {
    const t = p.touches[i];
    if (activeDrags.has(t.id)) continue;
    const pt = getCanvasTouchPoint(p, canvasSize, t.x, t.y);
    if (!isInsideCanvas(pt.x, pt.y)) continue;
    state.pet.points.push(normalize(pt.x, pt.y));
  }
}
