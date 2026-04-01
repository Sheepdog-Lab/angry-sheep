let gameMode = 'digital';
let changeListeners = [];

function notifyModeChange() {
  document.body?.setAttribute('data-game-mode', gameMode);
  for (const cb of changeListeners) {
    try {
      cb(gameMode);
    } catch (e) {
      /* ignore listener errors */
    }
  }
}

export function initGameMode() {
  document.body?.setAttribute('data-game-mode', gameMode);
}

export function getGameMode() {
  return gameMode;
}

export function setGameMode(mode) {
  if (mode !== 'digital' && mode !== 'physical') return;
  if (gameMode === mode) return;
  gameMode = mode;
  notifyModeChange();
}

export function onGameModeChange(cb) {
  changeListeners.push(cb);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    changeListeners = [];
  });
}
