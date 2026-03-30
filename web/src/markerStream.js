import { MARKER_STREAM } from './config.js';

let socket = null;
let reconnectTimer = null;
let connected = false;
let frameW = 640;
let frameH = 480;

/** @type {Map<number, { x: number, y: number, miss: number, id: number }>} */
const stableById = new Map();

const wsOpenCallbacks = [];

/** Register a callback when the tracking WebSocket connects (and immediately if already open). */
export function onMarkerWsOpen(cb) {
  wsOpenCallbacks.push(cb);
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      cb();
    } catch (e) {
      /* ignore */
    }
  }
}

/** Tell Python OpenCV which camera index to use (same order as the browser dropdown). */
export function sendTrackingCommand(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectMarkerStream();
  }, 2000);
}

function applySmoothing(rawMarkers) {
  const { smoothAlpha, holdMissFrames, maxJumpPx, allowedMarkerIds } = MARKER_STREAM;
  const a = Math.min(1, Math.max(0.05, smoothAlpha));
  const seen = new Set();

  if (allowedMarkerIds) {
    for (const id of stableById.keys()) {
      if (!allowedMarkerIds.has(id)) {
        stableById.delete(id);
      }
    }
  }

  for (const m of rawMarkers) {
    const id = m.id;
    const mx = m.x;
    const my = m.y;
    if (typeof id !== 'number' || typeof mx !== 'number' || typeof my !== 'number') continue;
    if (allowedMarkerIds && !allowedMarkerIds.has(id)) {
      continue;
    }

    seen.add(id);
    const prev = stableById.get(id);
    if (!prev) {
      stableById.set(id, { x: mx, y: my, miss: 0, id });
      continue;
    }

    const dx = mx - prev.x;
    const dy = my - prev.y;
    const jump = Math.hypot(dx, dy);
    let nx = prev.x * (1 - a) + mx * a;
    let ny = prev.y * (1 - a) + my * a;

    if (jump > maxJumpPx) {
      nx = mx;
      ny = my;
    }

    stableById.set(id, { x: nx, y: ny, miss: 0, id });
  }

  for (const [id, v] of stableById.entries()) {
    if (seen.has(id)) continue;
    v.miss += 1;
    if (v.miss > holdMissFrames) {
      stableById.delete(id);
    }
  }
}

function stableMarkersForDraw() {
  return Array.from(stableById.values());
}

/**
 * Start WebSocket client (idempotent). Call once from p5 setup.
 */
export function connectMarkerStream() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const url = MARKER_STREAM.wsUrl;
  try {
    socket = new WebSocket(url);
  } catch (e) {
    console.warn('[markers] WebSocket:', e);
    scheduleReconnect();
    return;
  }

  socket.addEventListener('open', () => {
    connected = true;
    console.info('[markers] connected', url);
    wsOpenCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        /* ignore */
      }
    });
  });

  socket.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data && typeof data === 'object' && data.cmd !== undefined) {
        return;
      }
      let list = [];
      if (Array.isArray(data)) {
        list = data;
      } else {
        const w = data.width;
        const h = data.height;
        if (typeof w === 'number' && typeof h === 'number') {
          frameW = w;
          frameH = h;
        }
        list = Array.isArray(data.markers) ? data.markers : [];
      }
      applySmoothing(list);
    } catch (e) {
      /* ignore bad frames */
    }
  });

  socket.addEventListener('close', () => {
    connected = false;
    socket = null;
    scheduleReconnect();
  });

  socket.addEventListener('error', () => {
    connected = false;
  });
}

export function getMarkerStreamState() {
  return {
    connected,
    frameW,
    frameH,
    markers: stableMarkersForDraw(),
  };
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.close();
      socket = null;
    }
    connected = false;
    stableById.clear();
  });
}
