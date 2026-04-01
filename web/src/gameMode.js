const STORAGE_KEY = 'angrySheepGameMode';

let gameMode = 'digital';
let changeListeners = [];

function persistMode() {
  try {
    localStorage.setItem(STORAGE_KEY, gameMode);
  } catch (e) {
    /* ignore storage issues */
  }
}

function notifyModeChange() {
  for (const cb of changeListeners) {
    try {
      cb(gameMode);
    } catch (e) {
      /* ignore listener errors */
    }
  }
}

export function initGameMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'digital' || saved === 'physical') {
      gameMode = saved;
    }
  } catch (e) {
    /* ignore storage issues */
  }

  const button = document.getElementById('gameModeToggle');
  if (!button) return;

  const syncButton = () => {
    button.textContent = `Mode: ${gameMode === 'digital' ? 'Digital' : 'Physical'}`;
    button.setAttribute('aria-pressed', gameMode === 'physical' ? 'true' : 'false');
  };

  syncButton();
  button.addEventListener('click', () => {
    setGameMode(gameMode === 'digital' ? 'physical' : 'digital');
    syncButton();
  });

  onGameModeChange(syncButton);
}

export function getGameMode() {
  return gameMode;
}

export function setGameMode(mode) {
  if (mode !== 'digital' && mode !== 'physical') return;
  if (gameMode === mode) return;
  gameMode = mode;
  persistMode();
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
