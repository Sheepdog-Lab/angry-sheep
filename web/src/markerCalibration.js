import { getGameMode } from './gameMode.js';
import { sendTrackingCommand } from './markerStream.js';

let initialized = false;
let physicalFlipX = false;
let physicalFlipY = false;

function getStorageKey() {
  return 'angrySheepPhysicalMarkerFlip';
}

function saveFlipState() {
  try {
    localStorage.setItem(
      getStorageKey(),
      JSON.stringify({ flipX: physicalFlipX, flipY: physicalFlipY }),
    );
  } catch (e) {
    /* ignore storage issues */
  }
}

function loadFlipState() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    physicalFlipX = !!parsed.flipX;
    physicalFlipY = !!parsed.flipY;
  } catch (e) {
    /* ignore storage issues */
  }
}

function requestCalibrationCapture() {
  const ok = sendTrackingCommand({ cmd: 'captureCalibrationPoint' });
  if (ok) {
    console.info('[markers] calibration capture requested');
  }
  return ok;
}

function requestCalibrationReset() {
  const ok = sendTrackingCommand({ cmd: 'resetCalibration' });
  if (ok) {
    console.info('[markers] calibration reset requested');
  }
  return ok;
}

function onKeyDown(e) {
  const target = e.target;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

  if ((e.key === 'x' || e.key === 'X') && getGameMode() === 'physical') {
    physicalFlipX = !physicalFlipX;
    saveFlipState();
    e.preventDefault();
    return;
  }

  if ((e.key === 'y' || e.key === 'Y') && getGameMode() === 'physical') {
    physicalFlipY = !physicalFlipY;
    saveFlipState();
    e.preventDefault();
    return;
  }

  if (e.key !== 'c' && e.key !== 'C') return;
  const ok = requestCalibrationCapture();
  if (ok) {
    e.preventDefault();
  }
}

export function initMarkerCalibration() {
  if (initialized) return;
  initialized = true;
  loadFlipState();
  window.addEventListener('keydown', onKeyDown);

  const recalibrateButtons = [
    document.getElementById('recalibrateButton'),
    document.getElementById('recalibrateFullscreenButton'),
  ];

  recalibrateButtons.forEach((button) => {
    if (!button) return;
    button.addEventListener('click', () => {
      if (getGameMode() !== 'physical') return;
      requestCalibrationReset();
    });
  });
}

export function applyPhysicalMarkerFlip(x, y) {
  return {
    x: physicalFlipX ? 1 - x : x,
    y: physicalFlipY ? 1 - y : y,
  };
}

export function getMarkerCalibration() {
  return {
    flipX: physicalFlipX,
    flipY: physicalFlipY,
  };
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('keydown', onKeyDown);
    initialized = false;
  });
}
