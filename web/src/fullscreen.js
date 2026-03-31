function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function requestElementFullscreen(el) {
  if (!el) return Promise.resolve();
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  return Promise.resolve();
}

function exitFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  return Promise.resolve();
}

export function initFullscreenControls(onChange = () => {}) {
  const root = document.getElementById('fullscreenApp');
  const enterBtn = document.getElementById('enterFullscreenButton');
  const exitBtn = document.getElementById('exitFullscreenButton');

  if (!root || !enterBtn || !exitBtn) {
    return;
  }

  const syncState = () => {
    const isActive = getFullscreenElement() === root;
    document.body.classList.toggle('is-fullscreen', isActive);
    enterBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    exitBtn.hidden = !isActive;
    onChange(isActive);
  };

  enterBtn.addEventListener('click', async () => {
    try {
      await requestElementFullscreen(root);
    } catch (err) {
      console.warn('[fullscreen] request failed:', err);
    }
    syncState();
  });

  exitBtn.addEventListener('click', async () => {
    try {
      await exitFullscreen();
    } catch (err) {
      console.warn('[fullscreen] exit failed:', err);
    }
    syncState();
  });

  document.addEventListener('fullscreenchange', syncState);
  document.addEventListener('webkitfullscreenchange', syncState);
  syncState();
}

export function getGameStageSize() {
  const stage = document.getElementById('gameStage');
  const width = stage?.clientWidth || window.innerWidth;
  const height = stage?.clientHeight || window.innerHeight;
  const targetSize = Math.min(width, height, 1080);
  return Math.max(320, Math.floor(targetSize));
}
