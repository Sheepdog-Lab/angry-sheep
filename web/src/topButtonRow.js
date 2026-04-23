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
    top: '10px',
    right: '10px',
    zIndex: '1000',
    display: 'flex',
    gap: '6px',
  });
  getHudHost().appendChild(row);
  return row;
}

// Vertical column that sits directly under the green Hold-to-Herd button
// (mounted at top: 200, ~30px tall). The facilitator test buttons
// (Reset the Game, Demo Victory, Reset the Sound) stack here in append
// order: first append → topmost, last append → bottom.
let belowHerdColumn = null;

export function getBelowHerdColumn() {
  if (belowHerdColumn) return belowHerdColumn;
  belowHerdColumn = document.createElement('div');
  Object.assign(belowHerdColumn.style, {
    position: 'fixed',
    top: '244px',
    right: '10px',
    zIndex: '1000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px',
  });
  getHudHost().appendChild(belowHerdColumn);
  return belowHerdColumn;
}
