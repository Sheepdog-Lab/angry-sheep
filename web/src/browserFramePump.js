/**
 * Sends JPEG snapshots of #video to server.py so ArUco runs on the *same* camera
 * as the browser preview (OpenCV device indices often don't match getUserMedia).
 */

import { sendTrackingCommand, onMarkerWsOpen } from './markerStream.js';

const MAX_WIDTH = 960;
const INTERVAL_MS = 50;
const JPEG_QUALITY = 0.9;

let timer = null;
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

export function startBrowserFramePump() {
  stopBrowserFramePump();
  timer = window.setInterval(pumpOnce, INTERVAL_MS);
  pumpOnce();
}

export function stopBrowserFramePump() {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
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
