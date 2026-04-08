// -- Shared top-right HUD row container --
//
// Row 1 of the top-right cluster has buttons created in three different
// modules (Reset the Game in main.js, Reset the Sound in hintButtons.js,
// Tune in tuning.js). Rather than guess pixel widths to align them,
// they all append into this single flex container. The container is
// right-anchored, so adding buttons grows the strip leftward.
//
// Items appear in the order they are appended:
//   first append → leftmost
//   last  append → rightmost
// Callers should respect this when initializing.
//
// HUD elements mount into #fullscreenApp (the same element the
// fullscreen API is called on) so they stay visible in fullscreen mode.
// Outside fullscreen, #fullscreenApp covers the viewport, so position:
// fixed children land in the same visual spot either way.

export function getHudHost() {
  return document.getElementById('fullscreenApp') || document.body;
}

let row = null;

export function getTopButtonRow() {
  if (row) return row;
  row = document.createElement('div');
  Object.assign(row.style, {
    position: 'fixed',
    top: '10px',
    right: '10px',
    zIndex: '1000',
    display: 'flex',
    gap: '6px',
  });
  getHudHost().appendChild(row);
  return row;
}
