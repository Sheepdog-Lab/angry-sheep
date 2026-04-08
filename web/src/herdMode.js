// -- Wizard-of-oz Push vs. Herd mode --
//
// While `herdActive` is true, sheepdog contact CALMS sheep instead of
// stressing them. The hold-to-herd button on the HUD owns the lifetime
// of the flag (mousedown sets true; mouseup / mouseleave / touchend /
// touchcancel set false). The per-sheep update loop in sheep.js reads
// this flag each frame inside applyToolReactions().

let herdActive = false;

export function setHerdMode(active) {
  herdActive = !!active;
}

export function isHerdActive() {
  return herdActive;
}
