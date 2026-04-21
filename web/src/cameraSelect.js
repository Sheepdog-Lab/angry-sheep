/**
 * Browser camera preview + device switcher (MediaDevices API).
 * Camera on/off drives game mode: on → physical, off → digital.
 * Changing the dropdown also tells server.py (via WebSocket) to use the same
 * camera *index* in OpenCV (order usually matches macOS Chrome/Safari).
 */

import { onMarkerWsOpen, sendTrackingCommand } from './markerStream.js';
import { startBrowserFramePump, stopBrowserFramePump } from './browserFramePump.js';
import { setGameMode } from './gameMode.js';

const STORAGE_KEY = 'angrySheepCameraDeviceId';
const PANEL_COLLAPSED_KEY = 'angrySheepCameraPanelCollapsed';
const CAMERA_ENABLED_KEY = 'angrySheepCameraEnabled';
let currentStream = null;
let cameraActive = false;

/* ── UI helpers ── */

function syncPanelToggleVisibility() {
  const btn = document.getElementById('cameraPanelToggle');
  if (!btn) return;
  btn.style.display = cameraActive ? '' : 'none';
}

function syncCameraToggleButton() {
  const btn = document.getElementById('cameraToggle');
  if (!btn) return;
  btn.textContent = cameraActive ? 'Camera On' : 'Camera Off';
  btn.setAttribute('aria-pressed', cameraActive ? 'true' : 'false');
  syncPanelToggleVisibility();
}

function setCameraPanelCollapsed(collapsed) {
  const panel = document.getElementById('cameraPanel');
  const toggle = document.getElementById('cameraPanelToggle');
  if (!panel || !toggle) return;
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

function initCameraPanelToggle() {
  const panel = document.getElementById('cameraPanel');
  const toggle = document.getElementById('cameraPanelToggle');
  if (!panel || !toggle) return;

  let initialCollapsed = false;
  try {
    initialCollapsed = localStorage.getItem(PANEL_COLLAPSED_KEY) === '1';
  } catch (e) {
    /* ignore */
  }
  setCameraPanelCollapsed(initialCollapsed);

  toggle.addEventListener('click', () => {
    setCameraPanelCollapsed(!panel.classList.contains('camera-panel--collapsed'));
  });
}

/* ── OpenCV camera-index sync ── */

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

/* ── DOM accessors ── */

function getVideoEl() {
  return document.getElementById('video');
}

function getSelectEl() {
  return document.getElementById('cameraSelect');
}

/* ── Stream lifecycle ── */

function stopCurrentStream() {
  stopBrowserFramePump();
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
  const video = getVideoEl();
  if (video) {
    video.srcObject = null;
    video.classList.remove('webcam-feed');
  }
}

export function stopWebcam() {
  stopCurrentStream();
}

export function stopCamera() {
  stopCurrentStream();
  cameraActive = false;
  try {
    localStorage.setItem(CAMERA_ENABLED_KEY, '0');
  } catch (e) {
    /* private mode */
  }
  setGameMode('digital');
  syncCameraToggleButton();
  setCameraPanelCollapsed(true);
}

/**
 * @param {string} deviceId
 */
export async function startCamera(deviceId) {
  const video = getVideoEl();
  if (!video || !deviceId) return;

  stopCurrentStream();

  const videoConstraints = {
    deviceId: { exact: deviceId },
    facingMode: 'user',
    width: { ideal: 2560 },
    height: { ideal: 1440 },
    zoom: { ideal: 1 },
  };

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
  } catch (err) {
    console.warn('[camera] hi-res constraints failed, retrying basic:', err);
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, facingMode: 'user' },
        audio: false,
      });
    } catch (err2) {
      console.warn('[camera] startCamera failed:', err2);
      cameraActive = false;
      setGameMode('digital');
      syncCameraToggleButton();
      return;
    }
  }

  try {
    currentStream = stream;
    video.classList.add('webcam-feed');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play().catch(() => {});
    const onReady = () => startBrowserFramePump();
    video.addEventListener('loadeddata', onReady, { once: true });
    if (video.readyState >= 2 && video.videoWidth) {
      onReady();
    }

    // Listen for unexpected camera disconnect
    stream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (currentStream === stream) {
          stopCamera();
        }
      });
    });

    try {
      localStorage.setItem(STORAGE_KEY, deviceId);
      localStorage.setItem(CAMERA_ENABLED_KEY, '1');
    } catch (e) {
      /* private mode */
    }

    cameraActive = true;
    setGameMode('physical');
    syncCameraToggleButton();
    setCameraPanelCollapsed(false);
  } catch (err) {
    console.warn('[camera] startCamera attach failed:', err);
    stopCurrentStream();
    cameraActive = false;
    setGameMode('digital');
    syncCameraToggleButton();
  }
}

export function isCameraActive() {
  return cameraActive;
}

/* ── Dropdown population ── */

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

/* ── Initialisation ── */

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
    syncCameraToggleButton();
    return;
  }

  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  video.setAttribute('muted', '');
  video.muted = true;

  let permissionStream = null;
  try {
    permissionStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 2560 },
        height: { ideal: 1440 },
        zoom: { ideal: 1 },
      },
      audio: false,
    });
  } catch (e0) {
    try {
      permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (e) {
      console.warn('[camera] permission denied:', e);
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.textContent = 'Camera access denied';
    opt.value = '';
    select.appendChild(opt);
    select.disabled = true;
    syncCameraToggleButton();
    return;
    }
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
    syncCameraToggleButton();
    return;
  }

  populateSelect(select, videoInputs);

  select.addEventListener('change', () => {
    const id = select.value;
    if (id && cameraActive) startCamera(id);
    syncOpenCvToDropdown();
  });

  // Wire camera on/off toggle
  const cameraToggle = document.getElementById('cameraToggle');
  if (cameraToggle) {
    cameraToggle.addEventListener('click', () => {
      if (cameraActive) {
        stopCamera();
      } else {
        const id = select.value;
        if (id) startCamera(id);
      }
    });
  }

  // Restore preferred device
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

  // Check if camera was previously enabled
  let savedEnabled = null;
  try {
    savedEnabled = localStorage.getItem(CAMERA_ENABLED_KEY);
  } catch (e) {
    /* ignore */
  }

  if (savedEnabled === '0') {
    // User explicitly turned camera off last time — stay digital
    syncCameraToggleButton();
    syncOpenCvToDropdown();
  } else {
    // Auto-start camera (first visit or was previously on)
    await startCamera(startId);
    syncOpenCvToDropdown();
  }
}
