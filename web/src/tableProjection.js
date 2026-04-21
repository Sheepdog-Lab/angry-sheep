/**
 * Glass-table projection: flip/mirror only `#gameStage` (the play circle / canvas).
 * `body.table-projection` is a state flag for webcam CSS and canvas pointer remap — no transform on body.
 */

const STORAGE_KEY = 'tableProjection';
const LEGACY_STORAGE_KEY = 'angrySheepFloorProjection';

function readStoredOn() {
  try {
    let v = localStorage.getItem(STORAGE_KEY);
    if (v === null) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy === '1') {
        localStorage.setItem(STORAGE_KEY, '1');
        v = '1';
      }
    }
    return v === '1';
  } catch (e) {
    return false;
  }
}

function writeStored(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch (e) {
    /* private mode */
  }
}

function syncBodyClass(on) {
  document.body.classList.toggle('table-projection', !!on);
}

function syncGameStageClass(on) {
  const stage = document.getElementById('gameStage');
  if (stage) {
    stage.classList.toggle('table-projection-visual', !!on);
  }
}

function syncToggleButtons(on) {
  const btn = document.getElementById('tableProjectionButton');
  if (btn) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('table-projection-button--on', !!on);
    btn.textContent = on ? 'Table Projection\n● ON' : 'Table Projection\n○ OFF';
    btn.title = on
      ? 'Table projection is ON (green play area corrected). Tap to turn off.'
      : 'Table projection is OFF (gray). Tap to turn on for the glass table.';
  }
}

/** @param {boolean} on */
function setTableProjection(on) {
  syncBodyClass(on);
  syncGameStageClass(on);
  writeStored(on);
  syncToggleButtons(on);
}

export function enableTableProjection() {
  setTableProjection(true);
}

export function disableTableProjection() {
  setTableProjection(false);
}

export function isTableProjectionEnabled() {
  return document.body.classList.contains('table-projection');
}

/**
 * Remap p5 mouse into canvas space for `#gameStage` transform rotate(180deg) scaleY(-1)
 * about the center (inverse maps screen → logical: x' = S - x, y' = y).
 * @param {import('p5')} p
 * @param {number} canvasSize
 */
export function getCanvasPointer(p, canvasSize) {
  if (!isTableProjectionEnabled()) {
    return { x: p.mouseX, y: p.mouseY };
  }
  return {
    x: canvasSize - p.mouseX,
    y: p.mouseY,
  };
}

function wireToggleButton(id) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener('click', () => {
    setTableProjection(!isTableProjectionEnabled());
  });
}

/** Call once from main (after DOM). Sets class from localStorage and wires toggles. */
export function initTableProjection() {
  setTableProjection(readStoredOn());
  wireToggleButton('tableProjectionButton');
}

if (typeof window !== 'undefined') {
  window.enableTableProjection = enableTableProjection;
  window.disableTableProjection = disableTableProjection;
}
