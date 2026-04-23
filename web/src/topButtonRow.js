// -- Shared bottom-left HUD row container --
//
// The row 1 cluster (master volume in sound.js, Tune in tuning.js) all
// append into this single flex container. The container is left-anchored
// at the bottom, so adding buttons grows the strip rightward.
//
// Items appear in the order they are appended:
//   first append → leftmost
//   last  append → rightmost
// Callers should respect this when initializing.
//
// HUD elements mount into #fullscreenApp (the same element the fullscreen API
// targets) so they stay visible in fullscreen mode. #fullscreenApp covers the
// viewport; position:fixed children land consistently whether native fullscreen
// is active or not.

export function getHudHost() {
  return document.getElementById('fullscreenApp') || document.body;
}

let row = null;

export function getTopButtonRow() {
  if (row) return row;
  row = document.createElement('div');
  Object.assign(row.style, {
    position: 'fixed',
    bottom: '10px',
    left: '10px',
    zIndex: '1000',
    display: 'flex',
    gap: '6px',
  });
  getHudHost().appendChild(row);
  return row;
}

// Vertical column that sits directly above the green Hold-to-Herd button
// (mounted at bottom: 200, ~30px tall). The facilitator test buttons
// (Reset the Game, Demo Victory, Reset the Sound) stack here in append
// order: first append → topmost, last append → bottom.
let belowHerdColumn = null;

export function getBelowHerdColumn() {
  if (belowHerdColumn) return belowHerdColumn;
  belowHerdColumn = document.createElement('div');
  Object.assign(belowHerdColumn.style, {
    position: 'fixed',
    bottom: '244px',
    left: '10px',
    zIndex: '1000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '6px',
  });
  getHudHost().appendChild(belowHerdColumn);
  return belowHerdColumn;
}
