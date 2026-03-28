// -- Canvas --
export const CANVAS_BG_COLOR = '#2d5a1b';
export const MASK_COLOR = '#000000'; // black outside the table circle

// -- Pen / Corral (circular with gaps) --
export const PEN = {
  cx: 0.5,
  cy: 0.5,
  radius: 0.09,          // normalized radius of the pen circle
  strokeColor: '#8b5e3c',
  strokeWeight: 0.008,
  fillColor: '#3a7a22',
  // Gaps defined as angles in degrees where the pen wall is open.
  // Each gap is [startAngle, endAngle] going clockwise from 3-o'clock.
  gaps: [
    [350, 10],   // right opening
    [80, 100],   // bottom-right opening
    [170, 190],  // left opening
    [260, 280],  // top-left opening
  ],
};

// -- Table --
export const TABLE_RADIUS = 0.48; // normalized radius of the play circle

// -- Tool types --
export const TOOL_TYPES = ['block', 'sheepdog', 'grass'];

export const TOOL_COLORS = {
  block: '#c4a35a',
  sheepdog: '#e8923e',
  grass: '#4caf50',
};

export const TOOL_SIZES = {
  block: { w: 0.07, h: 0.025 },
  sheepdog: 0.03,
  grass: 0.022,
};

export const TOOL_HIT_RADIUS = 0.035;
export const TOOL_ROTATE_STEP = 15; // degrees per scroll/keypress

// Fixed tools placed on the table at startup
export const INITIAL_TOOLS = [
  { type: 'block',    x: 0.25, y: 0.30, angle_deg: 0 },
  { type: 'block',    x: 0.72, y: 0.65, angle_deg: 45 },
  { type: 'block',    x: 0.35, y: 0.72, angle_deg: 90 },
  { type: 'sheepdog', x: 0.65, y: 0.25, angle_deg: 180 },
  { type: 'sheepdog', x: 0.30, y: 0.55, angle_deg: 0 },
  { type: 'grass',    x: 0.70, y: 0.45, angle_deg: 0 },
  { type: 'grass',    x: 0.40, y: 0.35, angle_deg: 0 },
];

// -- Sheep --
export const SHEEP = {
  count: 5,
  radius: 0.018,            // body size (normalized)
  color: '#f0f0e8',
  eyeColor: '#222222',
  speed: 0.0012,            // base wander speed per frame
  maxSpeed: 0.002,
  wanderJitter: 0.3,        // how much the wander angle drifts per frame
  flockSeparation: 0.06,    // min distance sheep try to keep from each other
  separationForce: 0.0004,
  tableMargin: 0.04,        // how far from table edge sheep try to stay
  edgePushForce: 0.002,
  // Tool interaction radii (normalized)
  dogFleeRadius: 0.10,      // sheep flee when sheepdog is within this range
  dogFleeForce: 0.004,
  grassAttractRadius: 0.12, // sheep attracted when grass is within this range
  grassAttractForce: 0.002,
  blockDetectRadius: 0.05,  // sheep avoid blocks within this range
  blockRepelForce: 0.003,
  // Pen capture
  captureSettleTime: 60,    // frames a sheep must stay inside pen to be captured
  // Stress & crisis
  stressPerPush: 0.35,      // stress added per sheepdog encounter
  stressDecay: 0.001,       // passive stress decay per frame when no dogs nearby
  crisisThreshold: 1.0,     // stress level that triggers crisis mode
  crisisSpeedMult: 1.8,     // speed multiplier during crisis
  crisisWanderJitter: 0.8,  // erratic movement jitter during crisis
  // De-escalation
  grassCalmRate: 0.008,     // stress reduction per frame when grass is near a crisis sheep
  grassCalmRadius: 0.08,    // grass must be this close to calm
  petCalmRate: 0.012,       // stress reduction per frame while being petted
  petRadius: 0.05,          // click must be this close to pet a sheep
  voiceCalmRate: 0.006,     // stress reduction per frame from positive voice
  // Multiplication
  splitStressPush: 3,       // number of additional dog pushes on crisis sheep before it splits
  splitMaxFlock: 10,        // don't split beyond this many total sheep
  // Hints
  crisisHintDelay: 60 * 3,  // frames of unresolved crisis before hint appears (~3s at 60fps)
};

// -- Session --
export const SESSION = {
  introDuration: 60 * 3,    // frames for intro animation (~3s)
  timerSeconds: 180,         // 3 minute session
  outroDuration: 60 * 5,    // frames for win/timeout screen (~5s)
  resetPause: 60 * 2,       // frames to pause before auto-reset (~2s)
};
