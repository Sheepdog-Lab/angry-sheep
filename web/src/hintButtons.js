// -- Bottom-left HUD button rows --
//
// Bottom row (bottom: 10) holds master volume and Tune (appended from
// other modules into the shared flex container in topButtonRow.js).
// Row 2 (bottom: 48): facilitator hint sounds, column stacked upward.
// Row 3 (bottom: 200): the wizard-of-oz Hold-to-Herd toggle.

import { playSfx, restartAudio } from './sound.js';
import { setHerdMode } from './herdMode.js';
import { getBelowHerdColumn, getHudHost } from './topButtonRow.js';

const BTN = {
  padding: '6px 14px',
  background: '#333',
  color: '#fff',
  border: '1px solid #666',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: '13px',
};

function makeRow(bottom, { column = false } = {}) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    position: 'fixed',
    bottom: `${bottom}px`,
    left: '10px',
    zIndex: '1000',
    display: 'flex',
    flexDirection: column ? 'column' : 'row',
    alignItems: column ? 'flex-start' : 'stretch',
    gap: '6px',
  });
  return row;
}

export function initHintButtons() {
  // -- Reset the Sound (mounted into the below-herd column) --
  // Stacks under Reset the Game and Demo Victory (appended earlier
  // from main.js). See getBelowHerdColumn() in topButtonRow.js.
  const soundResetBtn = document.createElement('button');
  soundResetBtn.textContent = 'Reset the Sound';
  Object.assign(soundResetBtn.style, BTN, {
    background: '#2a4a6b',
    border: '1px solid #4a7ab0',
  });
  soundResetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    restartAudio();
  });
  getBelowHerdColumn().appendChild(soundResetBtn);

  // -- Row 2: facilitator hint sounds (stacked vertically) --
  const hintRow = makeRow(48, { column: true });
  const makeHint = (label, onClick) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, BTN);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    hintRow.appendChild(b);
  };
  makeHint('Grass hint (G)',    () => playSfx('grassHint'));
  makeHint('Speaking hint (S)', () => playSfx('encourageHint'));
  makeHint('Grooming hint (B)', () => playSfx('groomingHint'));
  makeHint('Kind words (K)',    () => playSfx('kidVoice'));
  getHudHost().appendChild(hintRow);

  // -- Row 3: Hold to Herd --
  // Pressed and held while a kid is speaking kind words. While held,
  // sheepdog contact in sheep.js calms instead of stressing. Auto-releases
  // on mouseup, mouseleave (drag-off safety), touchend, touchcancel,
  // or window blur (in case the keyup never reaches us).
  // Sits below the stacked hint column (4 buttons × ~30px + gaps ≈ 138px).
  const herdRow = makeRow(200);
  const herdBtn = document.createElement('button');
  herdBtn.textContent = 'Hold to Herd (H)';
  Object.assign(herdBtn.style, BTN, {
    background: '#2a6b4a',
    border: '1px solid #4aa07a',
    userSelect: 'none',
  });

  // Track mouse and key holds independently so releasing one doesn't
  // cancel the other. The button stays active while either is held.
  let mouseHeld = false;
  let keyHeld = false;
  const refreshHerd = () => {
    const active = mouseHeld || keyHeld;
    setHerdMode(active);
    herdBtn.style.background = active ? '#4aa07a' : '#2a6b4a';
  };

  const onPress = (e) => {
    e.stopPropagation();
    e.preventDefault();
    mouseHeld = true;
    refreshHerd();
  };
  const onRelease = (e) => {
    if (e) e.stopPropagation();
    mouseHeld = false;
    refreshHerd();
  };
  herdBtn.addEventListener('mousedown', onPress);
  herdBtn.addEventListener('mouseup', onRelease);
  herdBtn.addEventListener('mouseleave', onRelease);
  herdBtn.addEventListener('touchstart', onPress, { passive: false });
  herdBtn.addEventListener('touchend', onRelease);
  herdBtn.addEventListener('touchcancel', onRelease);
  herdRow.appendChild(herdBtn);
  getHudHost().appendChild(herdRow);

  // -- Hotkeys: G / S / K one-shot, H hold-to-herd --
  // Skip when typing in form fields, and ignore when modifier keys are
  // held so browser shortcuts (Cmd+S, Ctrl+R, etc.) still work.
  const isTypingTarget = (target) =>
    target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === 'g') {
      playSfx('grassHint');
    } else if (k === 's') {
      playSfx('encourageHint');
    } else if (k === 'k') {
      playSfx('kidVoice');
    } else if (k === 'b') {
      playSfx('groomingHint');
    } else if (k === 'h') {
      keyHeld = true;
      refreshHerd();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'h') {
      keyHeld = false;
      refreshHerd();
    }
  });

  // Safety: if the window loses focus while H is held, the keyup may
  // never arrive. Force-release on blur.
  window.addEventListener('blur', () => {
    if (keyHeld) {
      keyHeld = false;
      refreshHerd();
    }
  });
}
