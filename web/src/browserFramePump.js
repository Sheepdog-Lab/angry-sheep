/**
 * Sends JPEG snapshots of #video to server.py so ArUco runs on the *same* camera
 * as the browser preview (OpenCV device indices often don't match getUserMedia).
 *
 * Uses requestVideoFrameCallback when available so each pump aligns with a new
 * camera frame (lower latency than fixed setInterval).
 */

import { sendTrackingCommand, onMarkerWsOpen } from './markerStream.js';

const MAX_WIDTH = 960;
/** Fallback cadence when video / RVFC is not ready yet (ms). */
const POLL_MS = 12;
const JPEG_QUALITY = 0.72;

let running = false;
/** @type {number | null} */
let pollTimer = null;
/** @type {number | null} */
let rvfcHandle = null;

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

function pumpOnce() {
  const v = document.getElementById('video');
  if (!v || v.readyState < 2 || !v.videoWidth) return;
  const vw = v.videoWidth;
  const vh = v.videoHeight;
  const w = Math.min(MAX_WIDTH, vw);
  const h = Math.round((vh * w) / vw);
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(v, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
  if (!b64) return;
  sendTrackingCommand({ cmd: 'frameJpeg', data: b64 });
}

function cancelRvfc() {
  const v = document.getElementById('video');
  if (v && rvfcHandle != null && typeof v.cancelVideoFrameCallback === 'function') {
    try {
      v.cancelVideoFrameCallback(rvfcHandle);
    } catch (_) {
      /* ignore */
    }
  }
  rvfcHandle = null;
}

function scheduleNext() {
  if (!running) return;
  const v = document.getElementById('video');
  if (
    v
    && v.readyState >= 2
    && v.videoWidth
    && typeof v.requestVideoFrameCallback === 'function'
  ) {
    rvfcHandle = v.requestVideoFrameCallback(() => {
      rvfcHandle = null;
      if (!running) return;
      try {
        pumpOnce();
      } catch (_) {
        /* ignore frame pump errors */
      }
      scheduleNext();
    });
    return;
  }
  pollTimer = window.setTimeout(() => {
    pollTimer = null;
    if (!running) return;
    pumpOnce();
    scheduleNext();
  }, POLL_MS);
}

export function startBrowserFramePump() {
  stopBrowserFramePump();
  running = true;
  pumpOnce();
  scheduleNext();
}

export function stopBrowserFramePump() {
  running = false;
  if (pollTimer != null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  cancelRvfc();
}

function tryStartIfVideoReady() {
  const v = document.getElementById('video');
  if (v && v.readyState >= 2 && v.videoWidth) {
    startBrowserFramePump();
  }
}

onMarkerWsOpen(() => {
  tryStartIfVideoReady();
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => stopBrowserFramePump());
}
