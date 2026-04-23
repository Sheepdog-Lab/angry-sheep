import {
  TOOL_COLORS,
  TOOL_HIT_RADIUS,
  TOOL_ROTATE_STEP,
  TOOL_BLOCK_ROTATE_STEP,
  TABLE_RADIUS,
  INITIAL_TOOLS,
} from './config.js';
import { hitTest } from './tools.js';
import * as Session from './session.js';
import { getGameMode, onGameModeChange } from './gameMode.js';
import { getCanvasPointer } from './tableProjection.js';

// -- State (matches shared contract) --
const state = {
  tools: [],
  voice: { active: false, sentiment: null },
  pet: { active: false, x: null, y: null },
};

let canvasSize = 0;
let p5Ref = null;

// Interaction state
let dragId = null;
let hoveredId = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let mouseIsDown = false;
let voiceActive = false;
let savedDigitalTools = [];

// -- Public API --

export function getState() {
  return state;
}

export function getHoveredId() {
  return hoveredId;
}

export function getDragId() {
  return dragId;
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

  // Voice indicator
  if (voiceActive) {
    p.fill(150, 255, 150, 180);
    p.noStroke();
    p.textSize(13);
    p.textAlign(p.LEFT, p.CENTER);
    p.text('♪ speaking kindly...', margin, margin + 12);
  }

  // Help hint (bottom-left)
  p.fill(255, 255, 255, 80);
  p.noStroke();
  p.textSize(11);
  p.textAlign(p.LEFT, p.BOTTOM);
  p.text(
    'Drag tools  |  Scroll: rotate  |  ← → or A D (or R) over tool / while dragging; blocks & dogs fine step  |  Dog auto-aim returns when far from flock  |  Hold V: speak  |  Calm: comb or click near sheep',
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

function resetInteractionState() {
  dragId = null;
  hoveredId = null;
  mouseIsDown = false;
  voiceActive = false;
  state.voice.active = false;
  state.voice.sentiment = null;
  state.pet.active = false;
  state.pet.x = null;
  state.pet.y = null;
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

// -- Event handlers --

/** Shared with mouse + touch so iPad can drag blocks / sheepdog. */
function pointerDownAt() {
  if (getGameMode() !== 'digital') return;
  const p = p5Ref;
  const { x: mx, y: my } = pointer(p);
  if (!isInsideCanvas(mx, my)) return;
  if (p.mouseButton !== p.LEFT) return;

  if (Session.getPhase() === 'win') {
    return;
  }

  mouseIsDown = true;

  const n = normalize(mx, my);

  // Check if clicking an existing tool → start drag
  const id = hitTest(state.tools, n.x, n.y);
  if (id !== null) {
    dragId = id;
    const tool = state.tools.find((t) => t.id === id);
    dragOffsetX = tool.x - n.x;
    dragOffsetY = tool.y - n.y;
  }
}

function pointerDragMove() {
  if (getGameMode() !== 'digital') return;
  if (dragId === null) return;
  const p = p5Ref;
  const { x: mx, y: my } = pointer(p);
  const n = normalize(mx, my);

  const tool = state.tools.find((t) => t.id === dragId);
  if (tool) {
    let tx = n.x + dragOffsetX;
    let ty = n.y + dragOffsetY;
    const dx = tx - 0.5;
    const dy = ty - 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxR = TABLE_RADIUS - TOOL_HIT_RADIUS;
    if (dist > maxR) {
      tx = 0.5 + (dx / dist) * maxR;
      ty = 0.5 + (dy / dist) * maxR;
    }
    tool.x = tx;
    tool.y = ty;
  }
}

function pointerUp() {
  if (getGameMode() !== 'digital') {
    resetInteractionState();
    return;
  }
  dragId = null;
  mouseIsDown = false;
  state.pet.active = false;
  state.pet.x = null;
  state.pet.y = null;
}

function onMousePressed() {
  if (getGameMode() !== 'digital') return;
  const p = p5Ref;
  if (p.mouseButton !== p.LEFT) return;
  pointerDownAt();
}

function onMouseDragged() {
  pointerDragMove();
}

function onMouseReleased() {
  pointerUp();
}

/** Touch: same drag path as mouse (return false → prevent scroll / delayed click). */
function onTouchStarted() {
  if (getGameMode() !== 'digital') return;
  if (Session.getPhase() === 'win') return;
  if (p5Ref.touches.length === 0) return;
  pointerDownAt();
  return false;
}

function onTouchMoved() {
  if (getGameMode() !== 'digital') return;
  if (dragId !== null) pointerDragMove();
  return false;
}

function onTouchEnded() {
  if (getGameMode() !== 'digital') return;
  if (dragId !== null) {
    pointerUp();
    return false;
  }
  if (p5Ref.touches.length === 0) pointerUp();
  return false;
}

/** p5 has no touchCancelled hook; browser still fires touchcancel on iOS. */
function onCanvasTouchCancel() {
  if (getGameMode() !== 'digital') return;
  pointerUp();
}

function rotateStepDeg(toolType) {
  if (toolType === 'block' || toolType === 'sheepdog') {
    return TOOL_BLOCK_ROTATE_STEP;
  }
  return TOOL_ROTATE_STEP;
}

function onMouseWheel(event) {
  if (getGameMode() !== 'digital') return;
  const p = p5Ref;
  const { x: mx, y: my } = pointer(p);
  const n = normalize(mx, my);
  const id = hitTest(state.tools, n.x, n.y);
  if (id !== null) {
    const tool = state.tools.find((t) => t.id === id);
    // Sheepdogs auto-aim toward the nearest sheep (tools.js), which overwrites
    // any manual angle every frame. Skip the write so the interaction is an
    // explicit no-op instead of silently broken. Still preventDefault so the
    // page doesn't scroll when the user spins the wheel over a dog.
    if (tool && tool.type === 'sheepdog') {
      const dir = event.delta > 0 ? 1 : -1;
      const step = rotateStepDeg(tool.type);
      tool.sheepdogManualAim = true;
      tool.angle_deg = (tool.angle_deg + dir * step) % 360;
    } else if (tool && tool.type !== 'sheepdog') {
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

  const steerKey =
    event.code === 'ArrowLeft' ||
    event.code === 'ArrowRight' ||
    event.code === 'KeyA' ||
    event.code === 'KeyD';
  if (steerKey) {
    const steerTypes = new Set(['block', 'sheepdog', 'grass', 'comb']);
    const dragged = dragId !== null ? state.tools.find((t) => t.id === dragId) : null;
    const hovered = hoveredId !== null ? state.tools.find((t) => t.id === hoveredId) : null;
    const steerTool =
      dragged && steerTypes.has(dragged.type)
        ? dragged
        : hovered && steerTypes.has(hovered.type)
          ? hovered
          : null;
    if (steerTool) {
      event.preventDefault();
      const dirRight =
        event.code === 'ArrowRight' || event.code === 'KeyD';
      const dir = dirRight ? 1 : -1;
      const step = rotateStepDeg(steerTool.type);
      if (steerTool.type === 'sheepdog') steerTool.sheepdogManualAim = true;
      steerTool.angle_deg = (steerTool.angle_deg + dir * step) % 360;
    }
    return;
  }

  if (event.key === 'r' || event.key === 'R') {
    if (hoveredId !== null) {
      const tool = state.tools.find((t) => t.id === hoveredId);
      if (tool && tool.type === 'sheepdog') {
        const step = rotateStepDeg(tool.type);
        tool.sheepdogManualAim = true;
        tool.angle_deg = (tool.angle_deg + step) % 360;
      } else if (tool && tool.type !== 'sheepdog') {
        const step = rotateStepDeg(tool.type);
        tool.angle_deg = (tool.angle_deg + step) % 360;
      }
    }
  } else if (event.key === 'v' || event.key === 'V') {
    voiceActive = true;
    state.voice.active = true;
    state.voice.sentiment = 'positive';
  }
}

function onKeyUp(event) {
  if (getGameMode() !== 'digital') return;
  if (event.key === 'v' || event.key === 'V') {
    voiceActive = false;
    state.voice.active = false;
    state.voice.sentiment = null;
  }
}

/**
 * Call each frame to update hoveredId and petting state.
 */
export function updateHover(p) {
  if (getGameMode() !== 'digital') {
    hoveredId = null;
    state.pet.active = false;
    state.pet.x = null;
    state.pet.y = null;
    return;
  }
  const { x: mx, y: my } = pointer(p);
  if (!isInsideCanvas(mx, my)) {
    hoveredId = null;
    return;
  }
  const n = normalize(mx, my);
  hoveredId = hitTest(state.tools, n.x, n.y);

  // Petting: mouse held down and not dragging a tool
  if (mouseIsDown && dragId === null) {
    state.pet.active = true;
    state.pet.x = n.x;
    state.pet.y = n.y;
  }
}
