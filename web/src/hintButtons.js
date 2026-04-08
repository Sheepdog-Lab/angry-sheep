// -- Top-of-screen hint sound buttons --
//
// A small horizontal strip of press-to-play buttons for facilitator hints,
// plus a Sound reset button to recover from stalled audio.

import { playSfx, restartAudio } from './sound.js';

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

export function initHintButtons() {
  // Second row in the top-right cluster — sits below the existing
  // Reset / Tune row so the four hint buttons line up to the right of
  // the play circle without covering the sheep table.
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed',
    top: '48px',
    right: '10px',
    zIndex: '1000',
    display: 'flex',
    gap: '6px',
  });

  const make = (label, onClick, extra = {}) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, BTN, extra);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    bar.appendChild(b);
    return b;
  };

  make('Grass hint',    () => playSfx('grassHint'));
  make('Speaking hint', () => playSfx('encourageHint'));
  make('Kind words',    () => playSfx('kidVoice'));
  make('Sound reset',   () => restartAudio(), {
    background: '#2a4a6b',
    border: '1px solid #4a7ab0',
  });

  document.body.appendChild(bar);
}
