function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

/** @param {Element | null} el */
function getRequestFullscreenFn(el) {
  if (!el) return null;
  const e = /** @type {Element & Record<string, unknown>} */ (el);
  if (typeof e.requestFullscreen === 'function') return () => e.requestFullscreen();
  if (typeof e.webkitRequestFullscreen === 'function') return () => e.webkitRequestFullscreen();
  if (typeof e.webkitRequestFullScreen === 'function') return () => e.webkitRequestFullScreen();
  if (typeof e.msRequestFullscreen === 'function') return () => e.msRequestFullscreen();
  return null;
}

function exitFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  return Promise.resolve();
}

/** True when browser fullscreen is active and our game root is inside it. */
function isNativeFullscreenFor(root) {
  const fs = getFullscreenElement();
  return !!(fs && (fs === root || fs.contains(root)));
}

/** When the Fullscreen API fails (common on iOS Safari), we still expand the game edge-to-edge. */
let immersiveFallback = false;

/**
 * Reliable tap on iPad: touchend (passive: false) + deduped click.
 * @param {HTMLElement | null} el
 * @param {(ev: Event) => void} handler
 */
function bindTap(el, handler) {
  if (!el) return;
  let ateTouch = false;
  el.addEventListener(
    'touchend',
    (e) => {
      ateTouch = true;
      e.preventDefault();
      handler(e);
      window.setTimeout(() => {
        ateTouch = false;
      }, 450);
    },
    { passive: false },
  );
  el.addEventListener('click', (e) => {
    if (ateTouch) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    handler(e);
  });
}

export function initFullscreenControls(onChange = () => {}) {
  const root = document.getElementById('fullscreenApp');
  const enterBtn = document.getElementById('enterFullscreenButton');
  const exitBtn = document.getElementById('exitFullscreenButton');

  if (!root || !enterBtn || !exitBtn) {
    return;
  }

  const syncState = () => {
    const native = isNativeFullscreenFor(root);
    const isActive = native || immersiveFallback;
    document.body.classList.toggle('is-fullscreen', isActive);
    enterBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    exitBtn.hidden = !isActive;
    onChange(isActive);
  };

  bindTap(enterBtn, () => {
    immersiveFallback = false;
    const candidates = [root, document.documentElement, document.body];

    const verifyOrFallback = () => {
      requestAnimationFrame(() => {
        const fs = getFullscreenElement();
        if (fs && (fs === root || fs.contains(root))) {
          immersiveFallback = false;
          syncState();
        } else {
          immersiveFallback = true;
          syncState();
        }
      });
    };

    const attempt = (i) => {
      if (i >= candidates.length) {
        immersiveFallback = true;
        syncState();
        return;
      }
      const el = candidates[i];
      const fn = getRequestFullscreenFn(el);
      if (!fn) {
        attempt(i + 1);
        return;
      }
      try {
        const ret = fn();
        if (ret && typeof ret.then === 'function') {
          ret.then(verifyOrFallback).catch(() => attempt(i + 1));
        } else {
          verifyOrFallback();
        }
      } catch {
        attempt(i + 1);
      }
    };

    attempt(0);
  });

  bindTap(exitBtn, () => {
    immersiveFallback = false;
    try {
      if (getFullscreenElement()) {
        const p = exitFullscreen();
        if (p && typeof p.then === 'function') {
          p.then(() => syncState()).catch(() => syncState());
        } else {
          syncState();
        }
      } else {
        syncState();
      }
    } catch {
      syncState();
    }
  });

  document.addEventListener('fullscreenchange', syncState);
  document.addEventListener('webkitfullscreenchange', syncState);

  const onViewportResize = () => onChange();
  window.addEventListener('resize', onViewportResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportResize);
  }

  syncState();
}

export function getGameStageSize() {
  const stage = document.getElementById('gameStage');
  const width = stage?.clientWidth || window.innerWidth;
  const height = stage?.clientHeight || window.innerHeight;
  const targetSize = Math.min(width, height, 1080);
  return Math.max(320, Math.floor(targetSize));
}
