/**
 * Browser camera preview + device switcher (MediaDevices API).
 * Changing the dropdown also tells server.py (via WebSocket) to use the same
 * camera *index* in OpenCV (order usually matches macOS Chrome/Safari).
 */

import { onMarkerWsOpen, sendTrackingCommand } from './markerStream.js';
import { startBrowserFramePump, stopBrowserFramePump } from './browserFramePump.js';

const STORAGE_KEY = 'angrySheepCameraDeviceId';
const PANEL_COLLAPSED_KEY = 'angrySheepCameraPanelCollapsed';

function initCameraPanelToggle() {
  const panel = document.getElementById('cameraPanel');
  const toggle = document.getElementById('cameraPanelToggle');
  if (!panel || !toggle) return;

  function applyCollapsed(collapsed) {
    panel.classList.toggle('camera-panel--collapsed', collapsed);
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.textContent = collapsed ? 'Show' : 'Hide';
    toggle.title = collapsed ? 'Show camera controls' : 'Hide camera controls';
    try {
      localStorage.setItem(PANEL_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (e) {
      /* private mode */
    }
  }

  let initialCollapsed = false;
  try {
    initialCollapsed = localStorage.getItem(PANEL_COLLAPSED_KEY) === '1';
  } catch (e) {
    /* ignore */
  }
  applyCollapsed(initialCollapsed);

  toggle.addEventListener('click', () => {
    applyCollapsed(!panel.classList.contains('camera-panel--collapsed'));
  });
}

function syncOpenCvToDropdown() {
  const sel = getSelectEl();
  if (!sel || sel.disabled || sel.options.length === 0) return;
  const ok = sendTrackingCommand({
    cmd: 'setCameraIndex',
    index: sel.selectedIndex,
  });
  if (!ok) {
    console.info('[camera] tracking WS not ready; will sync when connected');
  }
}

onMarkerWsOpen(() => {
  syncOpenCvToDropdown();
});

let currentStream = null;

function getVideoEl() {
  return document.getElementById('video');
}

function getSelectEl() {
  return document.getElementById('cameraSelect');
}

function stopCurrentStream() {
  stopBrowserFramePump();
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
  const video = getVideoEl();
  if (video) {
    video.srcObject = null;
  }
}

/**
 * @param {string} deviceId
 */
export async function startCamera(deviceId) {
  const video = getVideoEl();
  if (!video || !deviceId) return;

  stopCurrentStream();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
    });
    currentStream = stream;
    video.srcObject = stream;
    await video.play().catch(() => {});
    const onReady = () => startBrowserFramePump();
    video.addEventListener('loadeddata', onReady, { once: true });
    if (video.readyState >= 2 && video.videoWidth) {
      onReady();
    }
    try {
      localStorage.setItem(STORAGE_KEY, deviceId);
    } catch (e) {
      /* private mode */
    }
  } catch (err) {
    console.warn('[camera] startCamera failed:', err);
  }
}

function populateSelect(select, videoInputs) {
  select.innerHTML = '';
  videoInputs.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    const label = (d.label || '').trim();
    opt.textContent = label || `Camera ${i + 1}`;
    select.appendChild(opt);
  });
}

export async function initCameraSwitcher() {
  window.addEventListener(
    'pagehide',
    () => {
      stopCurrentStream();
    },
    { capture: true },
  );

  initCameraPanelToggle();

  const select = getSelectEl();
  const video = getVideoEl();
  if (!select || !video) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.textContent = 'Camera API not supported';
    opt.value = '';
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.muted = true;

  let permissionStream = null;
  try {
    permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch (e) {
    console.warn('[camera] permission denied:', e);
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.textContent = 'Camera access denied';
    opt.value = '';
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  if (permissionStream) {
    permissionStream.getTracks().forEach((t) => t.stop());
    permissionStream = null;
  }
  const videoInputs = devices.filter((d) => d.kind === 'videoinput');

  if (videoInputs.length === 0) {
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.textContent = 'No camera found';
    opt.value = '';
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  populateSelect(select, videoInputs);

  select.addEventListener('change', () => {
    const id = select.value;
    if (id) startCamera(id);
    syncOpenCvToDropdown();
  });

  let preferred = null;
  try {
    preferred = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    /* ignore */
  }

  const validPreferred =
    preferred && videoInputs.some((d) => d.deviceId === preferred);
  const startId = validPreferred ? preferred : videoInputs[0].deviceId;
  select.value = startId;
  await startCamera(startId);
  syncOpenCvToDropdown();
}
