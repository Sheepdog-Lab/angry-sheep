const STORAGE_KEY = 'angrySheepMarkerCalibration';
const OFFSET_STEP = 10;
const SCALE_STEP = 0.05;
const ROTATION_FINE_STEP = 5;
const MIN_SCALE = 0.1;

let offsetX = 0;
let offsetY = 0;
let scale = 1;
let flipX = false;
let flipY = false;
let rotation = 0;
let initialized = false;

function saveCalibration() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ offsetX, offsetY, scale, flipX, flipY, rotation }),
    );
  } catch (e) {
    /* ignore storage issues */
  }
}

function loadCalibration() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed.offsetX === 'number') offsetX = parsed.offsetX;
    if (typeof parsed.offsetY === 'number') offsetY = parsed.offsetY;
    if (typeof parsed.scale === 'number') scale = Math.max(MIN_SCALE, parsed.scale);
    if (typeof parsed.flipX === 'boolean') flipX = parsed.flipX;
    if (typeof parsed.flipY === 'boolean') flipY = parsed.flipY;
    if (typeof parsed.rotation === 'number') rotation = (((parsed.rotation % 360) + 360) % 360);
  } catch (e) {
    /* ignore bad storage */
  }
}

function onKeyDown(e) {
  let changed = false;

  switch (e.key) {
    case 'ArrowUp':
      offsetY -= OFFSET_STEP;
      changed = true;
      break;
    case 'ArrowDown':
      offsetY += OFFSET_STEP;
      changed = true;
      break;
    case 'ArrowLeft':
      offsetX -= OFFSET_STEP;
      changed = true;
      break;
    case 'ArrowRight':
      offsetX += OFFSET_STEP;
      changed = true;
      break;
    case 'i':
    case 'I':
      scale += SCALE_STEP;
      changed = true;
      break;
    case 'o':
    case 'O':
      scale = Math.max(MIN_SCALE, scale - SCALE_STEP);
      changed = true;
      break;
    case 'x':
    case 'X':
      flipX = !flipX;
      changed = true;
      break;
    case 'y':
    case 'Y':
      flipY = !flipY;
      changed = true;
      break;
    case 'r':
    case 'R':
      rotation = (rotation + 90) % 360;
      changed = true;
      break;
    case '[':
      rotation = (((rotation - ROTATION_FINE_STEP) % 360) + 360) % 360;
      changed = true;
      break;
    case ']':
      rotation = (rotation + ROTATION_FINE_STEP) % 360;
      changed = true;
      break;
    default:
      break;
  }

  if (!changed) return;
  e.preventDefault();
  saveCalibration();
}

export function initMarkerCalibration() {
  if (initialized) return;
  initialized = true;
  loadCalibration();
  window.addEventListener('keydown', onKeyDown);
}

export function applyMarkerCalibration(x, y, canvasSize) {
  let tx = x;
  let ty = y;

  if (flipX) tx = canvasSize - tx;
  if (flipY) ty = canvasSize - ty;

  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const dx = tx - cx;
  const dy = ty - cy;

  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  tx = cx + (dx * cos) - (dy * sin);
  ty = cy + (dx * sin) + (dy * cos);

  return {
    x: (tx * scale) + offsetX,
    y: (ty * scale) + offsetY,
  };
}

export function getMarkerCalibration() {
  return { offsetX, offsetY, scale, flipX, flipY, rotation };
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('keydown', onKeyDown);
    initialized = false;
  });
}
