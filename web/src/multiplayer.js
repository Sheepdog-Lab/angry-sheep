/**
 * Online co-op: same `?room=...` on each laptop + a small relay (see server/mp-relay).
 * - **Host** runs the full simulation and broadcasts snapshots.
 * - **Guests** apply snapshots and may still **pet** (touch / mouse) and use **V / U / I**;
 *   that input is merged on the host (tools are host-only in v1).
 */

/** @type {'solo' | 'host' | 'guest'} */
let role = 'solo';
let roomId = '';
/** @type {WebSocket | null} */
let ws = null;
let clientId = '';

/** @type {Array<Record<string, unknown>>} */
let guestInbox = [];

/** @type {string} */
let lastStatus = '';

function defaultWsUrl() {
  const env = import.meta.env?.VITE_MP_WS;
  if (env && typeof env === 'string' && env.length > 0) return env;
  if (import.meta.env?.DEV) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/mp-ws`;
  }
  return '';
}

/** Shared lobby when using `?join` without a slug (override with `VITE_PUBLIC_ROOM`). */
const DEFAULT_PUBLIC_ROOM = 'asg-public';

function sanitizeRoomId(raw) {
  const s = String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 48);
  return s || DEFAULT_PUBLIC_ROOM;
}

/**
 * Resolve which relay room to use:
 * 1. `?room=foo` — explicit room (highest priority)
 * 2. `?join` or `?join=1` or `?join=true` — shared default (`VITE_PUBLIC_ROOM` or {@link DEFAULT_PUBLIC_ROOM})
 * 3. `?join=myteam` — same room for everyone using that slug
 * 4. Build-time `VITE_PUBLIC_ROOM` — auto-join when the app opens at `/` with no query (public deploy link)
 */
function resolveRoomId() {
  try {
    const params = new URLSearchParams(location.search);
    const explicit = (params.get('room') || '').trim();
    if (explicit) return sanitizeRoomId(explicit);

    if (params.has('join')) {
      const j = (params.get('join') || '').trim().toLowerCase();
      const fromEnv = (import.meta.env.VITE_PUBLIC_ROOM || '').trim();
      if (!j || j === '1' || j === 'true' || j === 'yes') {
        return sanitizeRoomId(fromEnv || DEFAULT_PUBLIC_ROOM);
      }
      return sanitizeRoomId(j);
    }

    const publicRoom = (import.meta.env.VITE_PUBLIC_ROOM || '').trim();
    if (publicRoom) return sanitizeRoomId(publicRoom);
  } catch {
    /* ignore */
  }
  return '';
}

export function getMultiplayerStatus() {
  return lastStatus;
}

export function isOnlineHost() {
  return role === 'host';
}

export function isOnlineGuest() {
  return role === 'guest';
}

export function isOnlineConnected() {
  return role === 'host' || role === 'guest';
}

export function getRoomId() {
  return roomId;
}

/**
 * Call once after DOM is ready (before p5 setup is fine).
 * @param {{
 *   onGuest?: () => void;
 *   onHost?: () => void;
 *   onPromotedToHost?: () => void;
 *   onSnapshot?: (msg: Record<string, unknown>) => void;
 * }} hooks
 */
export function initOnlineFromUrl(hooks = {}) {
  roomId = resolveRoomId();
  if (!roomId) {
    role = 'solo';
    lastStatus = '';
    return;
  }

  const url = defaultWsUrl();
  if (!url) {
    lastStatus =
      'Set VITE_MP_WS (relay URL), run mp:relay in dev, or use ?join / ?room=…';
    role = 'solo';
    console.warn('[mp]', lastStatus);
    return;
  }

  lastStatus = 'Connecting…';
  try {
    ws = new WebSocket(url);
  } catch (e) {
    lastStatus = 'WebSocket failed';
    role = 'solo';
    console.warn('[mp] connect', e);
    return;
  }

  ws.addEventListener('open', () => {
    ws.send(
      JSON.stringify({
        type: 'join',
        roomId,
        clientId: `web-${Math.random().toString(36).slice(2, 10)}`,
      }),
    );
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }

    if (msg.type === 'welcome') {
      clientId = msg.clientId || clientId;
      role = msg.isHost ? 'host' : 'guest';
      lastStatus = msg.isHost ? `Host · room “${roomId}”` : `Guest · room “${roomId}”`;
      if (role === 'guest' && hooks.onGuest) hooks.onGuest();
      if (role === 'host' && hooks.onHost) hooks.onHost();
      return;
    }

    if (msg.type === 'promoted' && msg.reason === 'host_left') {
      role = 'host';
      lastStatus = `Host · room “${roomId}” (you took over)`;
      if (hooks.onPromotedToHost) hooks.onPromotedToHost();
      return;
    }

    if (msg.type === 'guestInput' && role === 'host') {
      guestInbox.push(msg);
      return;
    }

    if (msg.type === 'snapshot' && role === 'guest') {
      if (hooks.onSnapshot) hooks.onSnapshot(msg);
      return;
    }
  });

  ws.addEventListener('close', () => {
    if (role !== 'solo') lastStatus = 'Disconnected';
    role = 'solo';
    ws = null;
  });

  ws.addEventListener('error', () => {
    lastStatus = 'Relay error (is mp:relay running?)';
  });
}

/**
 * Host: merge guest pet + voice into the input passed to `updateFlock`.
 * @param {{ tools: unknown[]; voice: { active: boolean; sentiment: string | null }; pet: { points: { x: number; y: number }[] } }} base
 */
export function mergeGuestInputInto(base) {
  const petPts = [...(base.pet?.points || [])];
  let voiceActive = !!base.voice?.active;
  let sentiment = base.voice?.sentiment;

  const batch = guestInbox;
  guestInbox = [];

  for (let i = 0; i < batch.length; i++) {
    const g = batch[i];
    const pts = g.petPoints;
    if (Array.isArray(pts)) {
      for (let j = 0; j < pts.length; j++) {
        const p = pts[j];
        if (p && typeof p.x === 'number' && typeof p.y === 'number') {
          petPts.push({ x: p.x, y: p.y });
        }
      }
    }
    if (g.voiceActive) {
      voiceActive = true;
      sentiment = 'positive';
    }
  }

  return {
    tools: base.tools,
    voice: { active: voiceActive, sentiment: sentiment },
    pet: { points: petPts },
  };
}

/**
 * Host: broadcast world state to guests (throttled).
 */
export function hostSendSnapshot(payload) {
  if (role !== 'host' || !ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type: 'snapshot', roomId, ...payload }));
  } catch (e) {
    console.warn('[mp] snapshot', e);
  }
}

/**
 * Guest: send local pet + voice to host (lightweight; each frame is OK).
 */
export function guestSendInput(petPoints, voiceActive) {
  if (role !== 'guest' || !ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(
      JSON.stringify({
        type: 'guestInput',
        roomId,
        clientId,
        petPoints: petPoints || [],
        voiceActive: !!voiceActive,
      }),
    );
  } catch (e) {
    console.warn('[mp] guestInput', e);
  }
}
