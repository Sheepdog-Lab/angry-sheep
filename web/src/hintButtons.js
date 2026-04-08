// -- Top-right HUD button rows --
//
// Row 1 (top: 10) lives partly in other modules:
//   [Reset the Game (main.js)] [Sound reset (here)] [Tune (tuning.js)]
// We position Sound reset to slot in between, so all of row 1 is aligned.
//
// Row 2 (top: 48): facilitator hint sounds.
// Row 3 (top: 86): the wizard-of-oz Hold-to-Herd toggle.

import { playSfx, restartAudio } from './sound.js';
import { setHerdMode } from './herdMode.js';
import { getTopButtonRow, getHudHost } from './topButtonRow.js';

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

function makeRow(top) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    position: 'fixed',
    top: `${top}px`,
    right: '10px',
    zIndex: '1000',
    display: 'flex',
    gap: '6px',
  });
  return row;
}

export function initHintButtons() {
  // -- Row 1: Reset the Sound (mounted into the shared top button row) --
  // The shared flex container in topButtonRow.js auto-aligns this with
  // Reset the Game (mounted by main.js) and Tune (mounted by tuning.js).
  // Visual order is determined by append order — see main.js setup().
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
  getTopButtonRow().appendChild(soundResetBtn);

  // -- Row 2: facilitator hint sounds --
  const hintRow = makeRow(48);
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
  makeHint('Kind words (K)',    () => playSfx('kidVoice'));
  getHudHost().appendChild(hintRow);

  // -- Row 3: Hold to Herd --
  // Pressed and held while a kid is speaking kind words. While held,
  // sheepdog contact in sheep.js calms instead of stressing. Auto-releases
  // on mouseup, mouseleave (drag-off safety), touchend, touchcancel,
  // or window blur (in case the keyup never reaches us).
  const herdRow = makeRow(86);
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
