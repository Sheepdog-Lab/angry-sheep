import { TOOL_COLORS, TOOL_HIT_RADIUS, TOOL_ROTATE_STEP, TABLE_RADIUS, INITIAL_TOOLS } from './config.js';
import { hitTest } from './tools.js';
import * as Session from './session.js';

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

// -- Public API --

export function getState() {
  return state;
}

export function getHoveredId() {
  return hoveredId;
}

export function init(p, size) {
  p5Ref = p;
  canvasSize = size;

  // Place fixed tools on the table
  state.tools = INITIAL_TOOLS.map((t, i) => ({
    ...t,
    id: i,
  }));

  p.mousePressed = onMousePressed;
  p.mouseDragged = onMouseDragged;
  p.mouseReleased = onMouseReleased;
  p.mouseWheel = onMouseWheel;

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function updateCanvasSize(size) {
  canvasSize = size;
}

export function setToolCount(type, count) {
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
  p.text('Drag tools  |  Scroll: rotate  |  Hold V: speak  |  Hold click near sheep: pet', margin, s - margin);
}

// -- Internal helpers --

function normalize(px, py) {
  return { x: px / canvasSize, y: py / canvasSize };
}

function isInsideCanvas(px, py) {
  return px >= 0 && px <= canvasSize && py >= 0 && py <= canvasSize;
}

// -- Event handlers --

function onMousePressed() {
  const p = p5Ref;
  if (!isInsideCanvas(p.mouseX, p.mouseY)) return;
  if (p.mouseButton !== p.LEFT) return;

  if (Session.getPhase() === 'win') {
    return;
  }

  mouseIsDown = true;

  const n = normalize(p.mouseX, p.mouseY);

  // Check if clicking an existing tool → start drag
  const id = hitTest(state.tools, n.x, n.y);
  if (id !== null) {
    dragId = id;
    const tool = state.tools.find((t) => t.id === id);
    dragOffsetX = tool.x - n.x;
    dragOffsetY = tool.y - n.y;
  }
  // Otherwise, mouseIsDown with no dragId → petting (handled in updateHover)
}

function onMouseDragged() {
  if (dragId === null) return;
  const p = p5Ref;
  const n = normalize(p.mouseX, p.mouseY);

  const tool = state.tools.find((t) => t.id === dragId);
  if (tool) {
    tool.x = Math.max(0, Math.min(1, n.x + dragOffsetX));
    tool.y = Math.max(0, Math.min(1, n.y + dragOffsetY));
  }
}

function onMouseReleased() {
  dragId = null;
  mouseIsDown = false;
  state.pet.active = false;
  state.pet.x = null;
  state.pet.y = null;
}

function onMouseWheel(event) {
  const p = p5Ref;
  const n = normalize(p.mouseX, p.mouseY);
  const id = hitTest(state.tools, n.x, n.y);
  if (id !== null) {
    const tool = state.tools.find((t) => t.id === id);
    if (tool) {
      const dir = event.delta > 0 ? 1 : -1;
      tool.angle_deg = (tool.angle_deg + dir * TOOL_ROTATE_STEP) % 360;
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

  if (event.key === 'r' || event.key === 'R') {
    if (hoveredId !== null) {
      const tool = state.tools.find((t) => t.id === hoveredId);
      if (tool) {
        tool.angle_deg = (tool.angle_deg + TOOL_ROTATE_STEP) % 360;
      }
    }
  } else if (event.key === 'v' || event.key === 'V') {
    voiceActive = true;
    state.voice.active = true;
    state.voice.sentiment = 'positive';
  }
}

function onKeyUp(event) {
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
  if (!isInsideCanvas(p.mouseX, p.mouseY)) {
    hoveredId = null;
    return;
  }
  const n = normalize(p.mouseX, p.mouseY);
  hoveredId = hitTest(state.tools, n.x, n.y);

  // Petting: mouse held down and not dragging a tool
  if (mouseIsDown && dragId === null) {
    state.pet.active = true;
    state.pet.x = n.x;
    state.pet.y = n.y;
  }
}
