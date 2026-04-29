/**
 * Minimal WebSocket relay for Angry Sheep online co-op.
 *
 * - Clients join a `roomId` (share the same URL query `?room=...`).
 * - First client in the room is the **host** (runs the game sim in their tab).
 * - Host broadcasts `snapshot` JSON to everyone else.
 * - Guests send `guestInput` (pet points + voice); relay forwards only to the host.
 *
 * Run: `cd server/mp-relay && npm install && npm start`
 * Default port 8788 (override with MP_PORT=9000).
 */

import { WebSocketServer } from 'ws';

const PORT = Number(process.env.MP_PORT || 8788);

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map();

/** @type {Map<string, import('ws').WebSocket | null>} */
const hosts = new Map();

function safeRoom(id) {
  if (!id || typeof id !== 'string') return 'default';
  const s = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return s || 'default';
}

function ensureRoom(room) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  if (!hosts.has(room)) hosts.set(room, null);
}

function pickHost(room) {
  const set = rooms.get(room);
  if (!set || set.size === 0) {
    hosts.set(room, null);
    return null;
  }
  let h = hosts.get(room);
  if (h && set.has(h) && h.readyState === 1) return h;
  h = null;
  for (const c of set) {
    if (c.readyState === 1) {
      h = c;
      break;
    }
  }
  hosts.set(room, h);
  return h;
}

function broadcast(room, raw, except) {
  const set = rooms.get(room);
  if (!set) return;
  for (const c of set) {
    if (c === except) continue;
    if (c.readyState === 1) c.send(raw);
  }
}

function leave(ws) {
  const room = ws._mpRoom;
  if (!room) return;
  const set = rooms.get(room);
  if (set) set.delete(ws);
  if (hosts.get(room) === ws) {
    hosts.set(room, null);
    pickHost(room);
    const next = hosts.get(room);
    if (next && next.readyState === 1) {
      next.send(
        JSON.stringify({
          type: 'promoted',
          reason: 'host_left',
        }),
      );
    }
  }
  ws._mpRoom = undefined;
}

const wss = new WebSocketServer({ port: PORT });
console.info(`[mp-relay] listening on ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws) => {
  ws._mpRoom = undefined;

  ws.on('message', (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      leave(ws);
      const room = safeRoom(msg.roomId);
      ensureRoom(room);
      rooms.get(room).add(ws);
      ws._mpRoom = room;

      const set = rooms.get(room);
      const isFirst = set.size === 1;
      if (isFirst || !hosts.get(room) || hosts.get(room).readyState !== 1) {
        hosts.set(room, ws);
      }
      const host = hosts.get(room);
      const isHost = host === ws;

      ws.send(
        JSON.stringify({
          type: 'welcome',
          clientId: msg.clientId || `c${Math.random().toString(36).slice(2, 10)}`,
          isHost,
          roomId: room,
        }),
      );
      return;
    }

    const room = ws._mpRoom;
    if (!room) return;

    if (msg.type === 'guestInput') {
      const host = pickHost(room);
      if (host && host !== ws && host.readyState === 1) {
        host.send(buf.toString());
      }
      return;
    }

    if (msg.type === 'snapshot') {
      const host = hosts.get(room);
      if (ws !== host) return;
      broadcast(room, buf.toString(), ws);
      return;
    }
  });

  ws.on('close', () => leave(ws));
});
