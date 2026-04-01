// -- Canvas --
export const CANVAS_BG_COLOR = '#2d5a1b';
/** Served from `web/public/` (Vite → URL root). */
export const TERRAIN_TEXTURE_URL = '/terrain.png';
export const SHEEP_TEXTURE_URL = '/sheep.png';
export const SHEEPDOG_TEXTURE_URL = '/sheepdog.png';
export const BLOCKS_TEXTURE_URL = '/blocks.png';
export const GRASS_TEXTURE_URL = '/grass.png';
/** Decorative grass clumps on terrain (`web/public/terrain-grass-clump.png`). */
export const TERRAIN_GRASS_CLUMP_REV = 1;
export const TERRAIN_GRASS_CLUMP_URL = `/terrain-grass-clump.png?v=${TERRAIN_GRASS_CLUMP_REV}`;
/**
 * Bump `PEN_ASSET_REV` when you replace `web/public/pen.png` so browsers
 * fetch the new file (Vite does not hash `public/` URLs).
 */
export const PEN_ASSET_REV = 2;
export const PEN_TEXTURE_URL = `/pen.png?v=${PEN_ASSET_REV}`;
/** Bump when replacing any `web/public/victory-*.png` sprite. */
export const VICTORY_SPRITES_REV = 4;
const _v = VICTORY_SPRITES_REV;
export const VICTORY_S1_URL = `/victory-s1.png?v=${_v}`;
export const VICTORY_S2_URL = `/victory-s2.png?v=${_v}`;
export const VICTORY_S3_URL = `/victory-s3.png?v=${_v}`;
/** Shepherd + wooden sign; bottom of play area only (not mixed with sheep cluster). */
export const VICTORY_BANNER_URL = `/victory-banner.png?v=${_v}`;
export const MASK_COLOR = '#000000'; // black outside the table circle

// -- Pen / Corral (circular with gaps) --
export const PEN = {
  cx: 0.5,
  cy: 0.5,
  radius: 0.12375,       // normalized radius (0.099 × 1.25); matches capture + sprite scale
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

/** Ambient grass overlays — see `terrainGrass.js` (performance-tuned). */
export const AMBIENT_GRASS = {
  /** Primary clumps — main density (not 1:1 duplicate of a second full layer). */
  PRIMARY_GRASS_COUNT: 148,
  /** Sparse low-opacity patches for depth (much cheaper than a full duplicate set). */
  SECONDARY_GRASS_COUNT: 40,

  /** Height as a fraction of play diameter (2 × TABLE_RADIUS × canvas). */
  BASE_HEIGHT_FRAC: 0.027,
  SCALE_VARIATION: 0.28,
  ROTATION_VAR: 0.26,
  OPACITY_MIN: 0.44,
  OPACITY_MAX: 0.78,

  /** Patches with full gust FSM (~% of primary = WIND_GUST_ANIMATED_COUNT / PRIMARY_GRASS_COUNT). */
  WIND_GUST_ANIMATED_COUNT: 58,
  /** Cheap wind: max rotation amplitude (radians) — main visible breeze. */
  SIMPLE_WIND_SCALE: 0.052,
  /** Primary sin term — lower = slower, smoother arcs. */
  SIMPLE_WIND_FREQ: 0.012,
  /** Second wave is SIMPLE_WIND_FREQ × this — desynced motion, still one sin() each. */
  SIMPLE_WIND_SECOND_FREQ_MUL: 0.68,
  /** Blend of second sine (0 = single wave, ~0.5 = richer motion). */
  SIMPLE_WIND_WAVE_MIX: 0.4,
  /** Secondary layer cheap scale. */
  SECONDARY_SIMPLE_WIND_SCALE: 0.028,


  /** Peak rotation during a gust (radians). */
  SWAY_ANGLE_MAX: 0.104,
  SWAY_SHIFT_FRAC: 0.0054,
  /** Longer gusts = smoother arcs. */
  GUST_DURATION_MIN: 64,
  GUST_DURATION_MAX: 138,
  /** Shorter gaps = more frequent wind pulses. */
  GUST_GAP_MIN: 105,
  GUST_GAP_MAX: 360,
  /** When gust patch is idle: simple sine × this (still visible between gusts). */
  GUST_IDLE_SIMPLE_MULT: 0.4,
  PHASE_SPREAD_FRAMES: 720,
  EXCLUDE_TOP_FRAC: 0.065,
  EXCLUDE_BOTTOM_FRAC: 0.1,
  DISK_MARGIN: 0.96,

  // -- Secondary sparse layer (opacity / size — not a full duplicate pass) --
  SECONDARY_OPACITY_MIN: 0.16,
  SECONDARY_OPACITY_MAX: 0.4,
  SECONDARY_OFFSET_FRAC: 0.016,
  SECONDARY_SCALE_J_MULT: 0.88,
  /** Sheep reaction multiplier on secondary patches. */
  SECONDARY_SHEEP_SCALE: 0.42,

  // -- Sheep × grass (spatial + caps) --
  SHEEP_NEAR_RADIUS: 0.036,
  SHEEP_PUSH_INTENSITY: 0.068,
  SHEEP_VELOCITY_TILT: 0.048,
  SHEEP_SHIFT_FRAC: 0.013,
  /** Lower = faster return to rest after brush (more readable settle). */
  SHEEP_RECOVERY: 0.79,
  SHEEP_MAX_TILT: 0.13,
  SHEEP_MAX_SHIFT_FRAC: 0.022,
  SHEEP_FLATTEN_FROM_TILT: 0.35,
  /** Spatial grid resolution (cells per axis) for sheep proximity queries. */
  SHEEP_GRID_DIV: 10,
  /** Max grass patches that receive impulse per sheep per check (closest first). */
  SHEEP_MAX_REACT_PER_SHEEP: 6,
  /** Run sheep→grass impulse every N frames (1 = every frame). */
  SHEEP_CHECK_INTERVAL: 2,
};

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
  grass: 0.02,
};

export const TOOL_HIT_RADIUS = 0.035;
export const TOOL_ROTATE_STEP = 15; // degrees per scroll/keypress

// Fixed tools placed on the table at startup
export const INITIAL_TOOLS = [
  { type: 'block',    x: 0.25, y: 0.30, angle_deg: 0 },
  { type: 'block',    x: 0.72, y: 0.65, angle_deg: 45 },
  { type: 'block',    x: 0.35, y: 0.72, angle_deg: 90 },
  { type: 'block',    x: 0.78, y: 0.35, angle_deg: 30 },
  { type: 'block',    x: 0.22, y: 0.68, angle_deg: 60 },
  { type: 'block',    x: 0.60, y: 0.78, angle_deg: 15 },
  { type: 'block',    x: 0.40, y: 0.22, angle_deg: 120 },
  { type: 'block',    x: 0.18, y: 0.42, angle_deg: 75 },
  { type: 'block',    x: 0.80, y: 0.50, angle_deg: 135 },
  { type: 'block',    x: 0.55, y: 0.20, angle_deg: 160 },
  { type: 'sheepdog', x: 0.65, y: 0.25, angle_deg: 180 },
  { type: 'sheepdog', x: 0.30, y: 0.55, angle_deg: 0 },
  { type: 'grass',    x: 0.70, y: 0.45, angle_deg: 0 },
  { type: 'grass',    x: 0.40, y: 0.35, angle_deg: 0 },
];

// -- Sheep --
export const SHEEP = {
  count: 12,
  radius: 0.022,            // body size (normalized)
  color: '#f0f0e8',
  eyeColor: '#222222',
  speed: 0.0016,            // base wander speed per frame
  wanderJitter: 0.3,        // how much the wander angle drifts per frame
  /** ~fraction of flock that stays grazing until woken by interaction */
  grazerFraction: 0.25,
  /** per-sheep speed = SHEEP.speed * speedMult; range is randomized at spawn */
  speedMultMin: 0.86,
  speedMultMax: 1.14,
  flockSeparation: 0.06,    // min distance sheep try to keep from each other
  separationForce: 0.0004,
  tableMargin: 0.04,        // how far from table edge sheep try to stay
  edgePushForce: 0.002,
  // Tool interaction radii (normalized)
  dogFleeRadius: 0.10,      // sheep flee when sheepdog is within this range
  dogFleeForce: 0.004,
  grassAttractRadius: 0.12, // sheep attracted when grass is within this range
  grassAttractForce: 0.002,
  grazeFillRate: 0.008,     // fullness gained per frame while near grass (calm sheep fill fast)
  grazeDigestRate: 0.001,   // fullness lost per frame while away from grass
  blockDetectRadius: 0.05,  // sheep avoid blocks within this range
  blockRepelForce: 0.003,
  // Pen capture
  captureSettleTime: 60,    // frames a sheep must stay inside pen to be captured

  /**
   * Calm behavior once captured (normalized coords; forces combine with SHEEP.speed).
   * @see applyPenCalmWander in sheep.js
   */
  penInside: {
    /** Scales random walk impulse vs field sheep (lower = slower, calmer). */
    insidePenSpeedMultiplier: 0.26,
    /** `move()` speed cap = speed × insidePenSpeedMultiplier × this × speedMult. */
    penMaxSpeedMult: 3.4,
    /** Inward pull when past penInteriorComfort (fraction of pen radius from center). */
    penCenterBias: 0.00095,
    /** Extra inward push when approaching fence (starts at edgeAvoidStart). */
    penEdgeAvoidance: 0.0028,
    /** Below this normalized radius from pen center, center pull is very light. */
    penInteriorComfort: 0.4,
    /** Normalized distance from center where edge avoidance ramps up. */
    edgeAvoidStart: 0.58,
    /** Per behavior tick: chance to enter idle pause (0–1). */
    penIdleChance: 0.04,
    /** Angle jitter while wandering inside pen. */
    penWanderJitter: 0.11,
    /** Max turn when picking new wander direction after idle. */
    penTurnNoise: 0.48,
    /** Tiny drift while idling. */
    idleDrift: 0.00012,
    /** Velocity retention per frame (calmer = lower). */
    velocityDamping: 0.87,
    /** Min distance between captured sheep (normalized). */
    sheepSeparationInsidePen: 0.044,
    /** Separation impulse multiplier vs SHEEP.separationForce. */
    penSeparationForceMul: 1.65,
    /** Hard clamp: stay inside this fraction of pen radius from pen center. */
    penClampRadius: 0.88,
    /** Soft preferred band: extra center bias beyond this normalized radius. */
    penWanderRadius: 0.52,
  },
  // Pen avoidance & fence collision
  penAvoidRadius: 0.18,     // free sheep start avoiding pen at this distance from center
  penAvoidForce: 0.0015,    // mild outward nudge (weaker than tool forces)
  crisisPenEscapeForce: 0.006, // strong outward push for mad sheep inside pen
  penFenceThickness: 0.018, // collision activation zone around pen edge
  penFenceBounceForce: 0.005, // outward push at wall segments
  // Block drag anger
  blockDragStressRate: 0.015, // stress per frame when a dragged block is near
  // Stress & crisis
  stressPerPush: 0.15,      // stress added per sheepdog encounter
  crisisThreshold: 1.0,     // stress level that triggers crisis mode
  crisisSpeedMult: 2.7,     // speed multiplier during crisis
  crisisWanderJitter: 0.8,  // erratic movement jitter during crisis
  // De-escalation
  grassCalmRate: 0.008,     // stress reduction per frame when grass is near a crisis sheep
  grassCalmRadius: 0.08,    // grass must be this close to calm
  petCalmRate: 0.012,       // stress reduction per frame while being petted
  petRadius: 0.05,          // click must be this close to pet a sheep
  voiceCalmRate: 0.006,     // stress reduction per frame from positive voice
  // Multiplication
  splitStressPush: 3,       // number of additional dog pushes on crisis sheep before it splits
  splitMaxFlock: 22,        // don't split beyond this many total sheep
  // Hints
  crisisHintDelay: 60 * 3,  // frames of unresolved crisis before hint appears (~3s at 60fps)
};

// -- ArUco overlay (server.py WebSocket) --
// Optional: web/.env with VITE_MARKER_WS_URL=ws://192.168.1.5:8765
export const MARKER_STREAM = {
  wsUrl: import.meta.env.VITE_MARKER_WS_URL || 'ws://127.0.0.1:8765',
  /** Flip horizontal mapping if your webcam preview is mirrored vs physical table */
  mirrorX: false,
  dotRadiusPx: 10,
  showLabels: true,
  /**
   * Only accept these ArUco IDs (stops false positives like random 17 / 37 on noise).
   * null = accept any id. Keep in sync with printed markers + server ALLOWED_MARKER_IDS.
   */
  allowedMarkerIds: Object.freeze(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
  /** 0–1: higher = snappier, lower = less jitter (reduces flicker) */
  smoothAlpha: 0.22,
  /** Server ~30Hz: ~18 ≈ 0.6s grace before a dot disappears after a missed detect */
  holdMissFrames: 18,
  /** Ignore jumps larger than this (px in camera space) — kills spurious blips */
  maxJumpPx: 180,
};

// -- Session --
export const SESSION = {
  introDuration: 60 * 3,    // frames for intro animation (~3s)
  timerSeconds: 180,         // 3 minute session
  outroDuration: 60 * 5,    // frames for win/timeout screen (~5s)
  resetPause: 60 * 2,       // frames to pause before auto-reset (~2s)
};
