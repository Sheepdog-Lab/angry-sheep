// -- Background audio + SFX manager with per-track volume control --

import { getTopButtonRow, getHudHost } from './topButtonRow.js';

const TRACKS = [
  { id: 'farm',  label: 'Farm ambience',   src: '/farm-sound.mp3',  defaultVol: 1.0, gain: 2.0 },
  { id: 'grass', label: 'Grass rustling',   src: '/grass-rustled.mp3', defaultVol: 0.10 },
  { id: 'kids',  label: 'Kids music',       src: '/bg-kids-music.mp3', defaultVol: 0.05 },
];

const SFX_DEFS = [
  { id: 'madSheep',   label: 'Sheep goes mad',    src: '/sfx-mad-sheep.mp3',    defaultVol: 0.25 },
  { id: 'smallWin',   label: 'Sheep captured',     src: '/sfx-small-win.mp3',    defaultVol: 0.30 },
  { id: 'kidsLaugh',  label: 'Kids laughing',      src: '/sfx-kids-laughing.mp3', defaultVol: 0.25 },
  { id: 'trumpet',    label: 'Trumpet',            src: '/sfx-trumpet.mp3',      defaultVol: 0.40 },
  { id: 'grassHint',  label: 'Grass hint',         src: '/sfx-grass-hint.mp3',   defaultVol: 0.30 },
  { id: 'encourageHint', label: 'Encourage hint',  src: '/sfx-encourage-hint.mp3', defaultVol: 0.30 },
];

/** SFX that play together share a combined TEST button. */
const SFX_GROUPS = [
  { ids: ['trumpet', 'kidsLaugh'],  testLabel: 'TEST Win' },
];

/** SFX pools — each play picks a random clip from the set. */
const SFX_POOL_DEFS = [
  {
    id: 'kidVoice', label: 'Kind words', defaultVol: 0.50,
    srcs: [
      '/sfx-kid-voice-1.mp3', '/sfx-kid-voice-2.mp3', '/sfx-kid-voice-3.mp3',
      '/sfx-kid-voice-4.mp3', '/sfx-kid-voice-5.mp3', '/sfx-kid-voice-6.mp3',
    ],
  },
];

/** Eat-grass is a singleton loop — only one instance plays at a time. */
const EAT_GRASS = { id: 'eatGrass', label: 'Eat grass', src: '/sfx-eat-grass.mp3', defaultVol: 0.05 };

const STORAGE_KEY = 'angry-sheep-sound';

/** @type {Map<string, { audio: HTMLAudioElement, volume: number, muted: boolean }>} */
const players = new Map();
/** @type {Map<string, { src: string, volume: number, muted: boolean }>} */
const sfxPlayers = new Map();
/** Track next index for pool SFX sequential playback. */
const poolIndex = new Map();
/** Single looping eat-grass audio. */
let eatGrassAudio = null;
let eatGrassVolume = 0.5;
let eatGrassMuted = false;
let eatGrassPlaying = false;
let muted = false;
let playing = false;
let masterVolume = 1.0;

// -- Persistence --

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { return {}; }
}

function saveSettings() {
  const data = { muted, master: masterVolume };
  for (const [id, p] of players) {
    data[id] = p.volume;
    data[id + '_m'] = p.muted;
  }
  for (const [id, s] of sfxPlayers) {
    data['sfx_' + id] = s.volume;
    data['sfx_' + id + '_m'] = s.muted;
  }
  data['sfx_' + EAT_GRASS.id] = eatGrassVolume;
  data['sfx_' + EAT_GRASS.id + '_m'] = eatGrassMuted;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// -- Audio lifecycle --

/** Shared AudioContext for tracks that need gain > 1. */
let audioCtx = null;

let playersInited = false;

function initPlayers() {
  if (playersInited) return;
  playersInited = true;
  const saved = loadSettings();
  muted = saved.muted ?? false;
  masterVolume = saved.master ?? 1.0;

  for (const track of TRACKS) {
    const audio = new Audio(track.src);
    audio.loop = true;
    audio.preload = 'auto';
    const volume = saved[track.id] ?? track.defaultVol;
    const trackMuted = saved[track.id + '_m'] ?? false;

    let gainNode = null;
    const maxGain = track.gain ?? 1.0;
    if (maxGain > 1.0) {
      // Route through Web Audio GainNode to amplify beyond 1.0
      if (!audioCtx) audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(audio);
      gainNode = audioCtx.createGain();
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      audio.volume = 1; // volume is controlled via gainNode instead
    } else {
      audio.volume = (muted || trackMuted) ? 0 : volume;
    }

    players.set(track.id, { audio, volume, muted: trackMuted, gainNode, maxGain });
  }

  for (const def of SFX_DEFS) {
    const volume = saved['sfx_' + def.id] ?? def.defaultVol;
    const trackMuted = saved['sfx_' + def.id + '_m'] ?? false;
    sfxPlayers.set(def.id, { src: def.src, volume, muted: trackMuted });
    // Preload
    const preload = new Audio(def.src);
    preload.preload = 'auto';
    preload.volume = 0;
    preload.load();
  }

  for (const def of SFX_POOL_DEFS) {
    const volume = saved['sfx_' + def.id] ?? def.defaultVol;
    const trackMuted = saved['sfx_' + def.id + '_m'] ?? false;
    sfxPlayers.set(def.id, { srcs: def.srcs, volume, muted: trackMuted });
    for (const s of def.srcs) {
      const preload = new Audio(s);
      preload.preload = 'auto';
      preload.volume = 0;
      preload.load();
    }
  }

  // Eat-grass singleton loop
  eatGrassVolume = saved['sfx_' + EAT_GRASS.id] ?? EAT_GRASS.defaultVol;
  eatGrassMuted = saved['sfx_' + EAT_GRASS.id + '_m'] ?? false;
  eatGrassAudio = new Audio(EAT_GRASS.src);
  eatGrassAudio.loop = true;
  eatGrassAudio.preload = 'auto';
  eatGrassAudio.volume = 0;

  // Register gesture listeners early so we never miss the first user click.
  const onGesture = () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    for (const [, p] of players) p.audio.play().catch(() => {});
    document.removeEventListener('click', onGesture);
    document.removeEventListener('touchstart', onGesture);
    document.removeEventListener('keydown', onGesture);
  };
  document.addEventListener('click', onGesture);
  document.addEventListener('touchstart', onGesture);
  document.addEventListener('keydown', onGesture);
}

/** Current fade multiplier applied on top of user volume (0 = silent, 1 = full). */
let fadeMul = 0;

function applyVolumes() {
  for (const [, p] of players) {
    const vol = (muted || p.muted || p._tempMute) ? 0 : p.volume * fadeMul * masterVolume;
    if (p.gainNode) {
      // GainNode controls volume; audio.volume stays at 1
      p.gainNode.gain.value = vol * p.maxGain;
    } else {
      p.audio.volume = vol;
    }
  }
  if (eatGrassPlaying && eatGrassAudio) {
    eatGrassAudio.volume = eatGrassVolume * masterVolume;
  }
}

/** Start all background tracks (safe to call repeatedly). */
function startAll() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  for (const [, p] of players) p.audio.play().catch(() => {});
}

/**
 * Smoothly drive background audio volume each frame.
 * @param {number} t - fade multiplier 0–1 (0 = silent, 1 = full user volume)
 */
export function fadeAudio(t) {
  fadeMul = Math.max(0, Math.min(1, t));

  if (fadeMul > 0 && !playing) {
    playing = true;
    startAll();
  }

  applyVolumes();

  // Keep tracks playing at volume 0 instead of pausing, so they resume
  // reliably without needing a fresh user gesture (browser autoplay policy).
}

/** Temporarily silence a background track (e.g. during victory). */
export function muteTrackTemp(id, mute) {
  const p = players.get(id);
  if (!p) return;
  p._tempMute = mute;
  applyVolumes();
}

// -- Eat-grass loop --

/**
 * Turn the eat-grass loop on or off. Only one track plays regardless of
 * how many sheep are eating.
 * @param {boolean} active
 */
export function setEatGrassActive(active) {
  if ((muted || eatGrassMuted) || !eatGrassAudio) {
    if (eatGrassPlaying) {
      eatGrassAudio?.pause();
      eatGrassPlaying = false;
    }
    return;
  }
  if (active && !eatGrassPlaying) {
    eatGrassAudio.volume = eatGrassVolume * masterVolume;
    eatGrassAudio.play().catch(() => {});
    eatGrassPlaying = true;
  } else if (!active && eatGrassPlaying) {
    eatGrassAudio.pause();
    eatGrassAudio.currentTime = 0;
    eatGrassPlaying = false;
  }
}

// -- SFX --

/**
 * Play a one-shot sound effect. Overlapping calls create new Audio instances.
 * @param {string} id - one of the SFX_DEFS ids
 */
export function playSfx(id) {
  const entry = sfxPlayers.get(id);
  if (!entry || muted || entry.muted) return;
  let src;
  if (entry.srcs) {
    const i = poolIndex.get(id) || 0;
    src = entry.srcs[i];
    poolIndex.set(id, (i + 1) % entry.srcs.length);
  } else {
    src = entry.src;
  }
  const audio = new Audio(src);
  audio.volume = entry.volume * masterVolume;
  audio.play().catch(() => {});
}

/**
 * Initialize the audio engine without showing any UI panel.
 * Safe to call multiple times — the underlying initPlayers() is idempotent.
 */
export function initSound() {
  initPlayers();
}

/**
 * Recover from stalled audio: resume the AudioContext if suspended and
 * rewind/replay all background tracks (and the eat-grass loop if active).
 * Volumes are not changed — applyVolumes() re-asserts the current mix at the end.
 */
export function restartAudio() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  for (const [, p] of players) {
    try { p.audio.pause(); p.audio.currentTime = 0; } catch {}
    p.audio.play().catch(() => {});
  }
  if (eatGrassPlaying && eatGrassAudio) {
    try { eatGrassAudio.pause(); eatGrassAudio.currentTime = 0; } catch {}
    eatGrassAudio.play().catch(() => {});
  }
  applyVolumes();
}

// -- UI --

let panel = null;
let visible = false;
/** Registered UI rows for reset. @type {{ setVolume: (v:number)=>void, setMuted: (m:boolean)=>void }[]} */
const uiRows = [];
let globalMuteBtn = null;
let updateGlobalMuteLabel = null;
let masterSlider = null;
let masterValLabel = null;

const BTN_STYLE = {
  padding: '2px 6px', border: '1px solid #666', borderRadius: '3px',
  cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px',
  lineHeight: '1', flexShrink: '0',
};

function resetToDefaults() {
  muted = false;
  if (updateGlobalMuteLabel) updateGlobalMuteLabel();
  masterVolume = 1.0;
  if (masterSlider) masterSlider.value = masterVolume;
  if (masterValLabel) masterValLabel.textContent = Math.round(masterVolume * 100) + '%';

  let idx = 0;
  for (const track of TRACKS) {
    const p = players.get(track.id);
    p.volume = track.defaultVol;
    p.muted = false;
    uiRows[idx].setVolume(track.defaultVol);
    uiRows[idx].setMuted(false);
    idx++;
  }

  // eat-grass
  eatGrassVolume = EAT_GRASS.defaultVol;
  eatGrassMuted = false;
  if (eatGrassAudio && eatGrassPlaying) eatGrassAudio.volume = eatGrassVolume;
  uiRows[idx].setVolume(EAT_GRASS.defaultVol);
  uiRows[idx].setMuted(false);
  idx++;

  // Reset grouped SFX first, then ungrouped — matches UI row order
  const _groupedIds = new Set(SFX_GROUPS.flatMap((g) => g.ids));
  for (const def of SFX_DEFS.filter((d) => _groupedIds.has(d.id))) {
    const s = sfxPlayers.get(def.id);
    s.volume = def.defaultVol;
    s.muted = false;
    uiRows[idx].setVolume(def.defaultVol);
    uiRows[idx].setMuted(false);
    idx++;
  }
  for (const def of SFX_DEFS.filter((d) => !_groupedIds.has(d.id))) {
    const s = sfxPlayers.get(def.id);
    s.volume = def.defaultVol;
    s.muted = false;
    uiRows[idx].setVolume(def.defaultVol);
    uiRows[idx].setMuted(false);
    idx++;
  }

  for (const def of SFX_POOL_DEFS) {
    const s = sfxPlayers.get(def.id);
    s.volume = def.defaultVol;
    s.muted = false;
    uiRows[idx].setVolume(def.defaultVol);
    uiRows[idx].setMuted(false);
    idx++;
  }

  applyVolumes();
  saveSettings();
}

export function initSoundPanel() {
  initPlayers();

  // Toggle button
  const toggle = document.createElement('button');
  toggle.textContent = 'Sound';
  Object.assign(toggle.style, {
    position: 'fixed', top: '10px', right: '80px', zIndex: '1000',
    padding: '6px 14px', background: '#333', color: '#fff',
    border: '1px solid #666', borderRadius: '4px', cursor: 'pointer',
    fontFamily: 'monospace', fontSize: '13px',
  });
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    visible = !visible;
    panel.style.display = visible ? 'block' : 'none';
    if (visible) document.dispatchEvent(new CustomEvent('panel-open', { detail: 'sound' }));
  });
  document.addEventListener('panel-open', (e) => {
    if (e.detail !== 'sound' && visible) {
      visible = false;
      panel.style.display = 'none';
    }
  });
  document.body.appendChild(toggle);

  // Panel
  panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', top: '42px', right: '80px', zIndex: '999',
    background: 'rgba(30,30,30,0.92)', color: '#ddd',
    padding: '12px 14px', borderRadius: '6px',
    fontFamily: 'monospace', fontSize: '12px',
    display: 'none', minWidth: '240px',
    maxHeight: 'calc(100vh - 60px)', overflowY: 'auto',
    border: '1px solid #555',
  });

  // Master volume — single control that scales everything
  const masterRow = document.createElement('div');
  masterRow.style.marginBottom = '10px';
  const masterTop = document.createElement('div');
  Object.assign(masterTop.style, {
    display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px',
  });
  const masterLabel = document.createElement('span');
  masterLabel.textContent = 'Master';
  masterLabel.style.flex = '1';
  masterLabel.style.fontWeight = 'bold';
  masterLabel.style.color = '#fff';
  masterValLabel = document.createElement('span');
  masterValLabel.style.color = '#999';
  masterValLabel.style.minWidth = '32px';
  masterValLabel.style.textAlign = 'right';
  masterValLabel.textContent = Math.round(masterVolume * 100) + '%';
  masterTop.appendChild(masterLabel);
  masterTop.appendChild(masterValLabel);
  masterSlider = document.createElement('input');
  masterSlider.type = 'range';
  masterSlider.min = 0;
  masterSlider.max = 1;
  masterSlider.step = 0.01;
  masterSlider.value = masterVolume;
  Object.assign(masterSlider.style, {
    width: '100%', accentColor: '#fff', cursor: 'pointer',
  });
  masterSlider.addEventListener('input', () => {
    masterVolume = parseFloat(masterSlider.value);
    masterValLabel.textContent = Math.round(masterVolume * 100) + '%';
    applyVolumes();
    saveSettings();
  });
  masterRow.appendChild(masterTop);
  masterRow.appendChild(masterSlider);
  panel.appendChild(masterRow);

  // Top buttons row: global mute + reset
  const topRow = document.createElement('div');
  Object.assign(topRow.style, {
    display: 'flex', gap: '6px', marginBottom: '10px',
  });

  globalMuteBtn = document.createElement('button');
  updateGlobalMuteLabel = () => { globalMuteBtn.textContent = muted ? 'Unmute all' : 'Mute all'; };
  updateGlobalMuteLabel();
  Object.assign(globalMuteBtn.style, {
    flex: '1', padding: '5px',
    background: 'transparent', color: '#aaa', border: '1px solid #666',
    borderRadius: '3px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '11px',
  });
  globalMuteBtn.addEventListener('click', () => {
    muted = !muted;
    updateGlobalMuteLabel();
    applyVolumes();
    if (muted && eatGrassPlaying) {
      eatGrassAudio?.pause();
      eatGrassPlaying = false;
    }
    saveSettings();
  });

  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset';
  Object.assign(resetBtn.style, {
    flex: '1', padding: '5px',
    background: 'transparent', color: '#aaa', border: '1px solid #666',
    borderRadius: '3px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '11px',
  });
  resetBtn.addEventListener('click', resetToDefaults);

  topRow.appendChild(globalMuteBtn);
  topRow.appendChild(resetBtn);
  panel.appendChild(topRow);

  // -- Background Music --
  panel.appendChild(buildSectionHeader('Background', '#8bc34a'));

  for (const track of TRACKS) {
    const p = players.get(track.id);
    const { el, setVolume, setMuted } = buildTrackRow({
      label: track.label,
      volume: p.volume,
      isMuted: p.muted,
      onVolume(val) {
        p.volume = val;
        applyVolumes();
        saveSettings();
      },
      onMute(m) {
        p.muted = m;
        applyVolumes();
        saveSettings();
      },
      onTest(vol) {
        const maxGain = track.gain ?? 1.0;
        if (maxGain > 1.0 && audioCtx) {
          const a = new Audio(track.src);
          a.volume = 1;
          const src = audioCtx.createMediaElementSource(a);
          const g = audioCtx.createGain();
          g.gain.value = vol * maxGain * masterVolume;
          src.connect(g);
          g.connect(audioCtx.destination);
          a.play().catch(() => {});
          setTimeout(() => { a.pause(); a.currentTime = 0; }, 3000);
        } else {
          const a = new Audio(track.src);
          a.volume = vol * masterVolume;
          a.play().catch(() => {});
          setTimeout(() => { a.pause(); a.currentTime = 0; }, 3000);
        }
      },
    });
    uiRows.push({ setVolume, setMuted });
    panel.appendChild(el);
  }

  // -- Sound Effects --
  panel.appendChild(buildSectionHeader('Sound Effects', '#ff9800'));

  // Eat-grass
  {
    const { el, setVolume, setMuted } = buildTrackRow({
      label: EAT_GRASS.label,
      volume: eatGrassVolume,
      isMuted: eatGrassMuted,
      onVolume(val) {
        eatGrassVolume = val;
        if (eatGrassAudio && eatGrassPlaying) eatGrassAudio.volume = val * masterVolume;
        saveSettings();
      },
      onMute(m) {
        eatGrassMuted = m;
        if (m && eatGrassPlaying) {
          eatGrassAudio?.pause();
          eatGrassAudio.currentTime = 0;
          eatGrassPlaying = false;
        }
        saveSettings();
      },
      onTest(vol) {
        const a = new Audio(EAT_GRASS.src);
        a.volume = vol * masterVolume;
        a.play().catch(() => {});
        setTimeout(() => { a.pause(); a.currentTime = 0; }, 3000);
      },
    });
    uiRows.push({ setVolume, setMuted });
    panel.appendChild(el);
  }

  // One-shot SFX — grouped test buttons for paired sounds
  for (const group of SFX_GROUPS) {
    const defs = group.ids.map((id) => SFX_DEFS.find((d) => d.id === id));

    for (const def of defs) {
      const s = sfxPlayers.get(def.id);
      const { el, setVolume, setMuted } = buildTrackRow({
        label: def.label,
        volume: s.volume,
        isMuted: s.muted,
        onVolume(val) {
          s.volume = val;
          saveSettings();
        },
        onMute(m) {
          s.muted = m;
          saveSettings();
        },
        onTest: null, // no individual test for grouped SFX
      });
      uiRows.push({ setVolume, setMuted });
      panel.appendChild(el);
    }

    // Shared test button for the group
    const testBtn = document.createElement('button');
    testBtn.textContent = group.testLabel;
    Object.assign(testBtn.style, {
      width: '100%', padding: '4px', marginBottom: '10px',
      background: '#444', color: '#ddd', border: '1px solid #666',
      borderRadius: '3px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '11px',
    });
    testBtn.addEventListener('click', () => {
      for (const def of defs) {
        const s = sfxPlayers.get(def.id);
        const a = new Audio(def.src);
        a.volume = s.volume * masterVolume;
        a.play().catch(() => {});
      }
    });
    panel.appendChild(testBtn);
  }

  // Ungrouped SFX — individual rows with inline TEST buttons
  const groupedIds = new Set(SFX_GROUPS.flatMap((g) => g.ids));
  for (const def of SFX_DEFS) {
    if (groupedIds.has(def.id)) continue;
    const s = sfxPlayers.get(def.id);
    const { el, setVolume, setMuted } = buildTrackRow({
      label: def.label,
      volume: s.volume,
      isMuted: s.muted,
      onVolume(val) {
        s.volume = val;
        saveSettings();
      },
      onMute(m) {
        s.muted = m;
        saveSettings();
      },
      onTest(vol) {
        const a = new Audio(def.src);
        a.volume = vol * masterVolume;
        a.play().catch(() => {});
      },
    });
    uiRows.push({ setVolume, setMuted });
    panel.appendChild(el);
  }

  // Pool SFX — single control, TEST plays a random clip
  for (const def of SFX_POOL_DEFS) {
    const s = sfxPlayers.get(def.id);
    const { el, setVolume, setMuted } = buildTrackRow({
      label: def.label,
      volume: s.volume,
      isMuted: s.muted,
      onVolume(val) {
        s.volume = val;
        saveSettings();
      },
      onMute(m) {
        s.muted = m;
        saveSettings();
      },
      onTest(vol) {
        const i = poolIndex.get(def.id) || 0;
        const a = new Audio(def.srcs[i]);
        poolIndex.set(def.id, (i + 1) % def.srcs.length);
        a.volume = vol * masterVolume;
        a.play().catch(() => {});
      },
    });
    uiRows.push({ setVolume, setMuted });
    panel.appendChild(el);
  }

  // Click inside panel should not close it
  panel.addEventListener('click', (e) => e.stopPropagation());

  // Click anywhere outside closes the panel
  document.addEventListener('click', () => {
    if (visible) {
      visible = false;
      panel.style.display = 'none';
    }
  });

  document.body.appendChild(panel);
}

// -- UI helpers --

function buildSectionHeader(text, color) {
  const header = document.createElement('div');
  Object.assign(header.style, {
    fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase',
    letterSpacing: '1px', color,
    marginTop: '12px', marginBottom: '8px',
    borderBottom: `1px solid ${color}33`, paddingBottom: '3px',
  });
  header.textContent = text;
  return header;
}

/**
 * Build a full track row: label + mute/test buttons + volume slider.
 * Returns { el, setVolume, setMuted } so reset can drive UI externally.
 */
function buildTrackRow({ label, volume, isMuted, onVolume, onMute, onTest }) {
  const row = document.createElement('div');
  row.style.marginBottom = '8px';

  // Top line: label, value, mute + test buttons
  const top = document.createElement('div');
  Object.assign(top.style, {
    display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px',
  });

  const nameSpan = document.createElement('span');
  nameSpan.textContent = label;
  nameSpan.style.flex = '1';
  nameSpan.style.overflow = 'hidden';
  nameSpan.style.textOverflow = 'ellipsis';
  nameSpan.style.whiteSpace = 'nowrap';

  const valSpan = document.createElement('span');
  valSpan.style.color = '#999';
  valSpan.style.minWidth = '32px';
  valSpan.style.textAlign = 'right';
  valSpan.textContent = Math.round(volume * 100) + '%';

  // Mute button
  const muteBtn = document.createElement('button');
  const applyMuteUI = (m) => {
    muteBtn.textContent = m ? 'OFF' : 'ON';
    muteBtn.style.background = m ? '#633' : '#353';
    muteBtn.style.color = m ? '#f88' : '#8f8';
  };
  applyMuteUI(isMuted);
  Object.assign(muteBtn.style, BTN_STYLE);
  muteBtn.title = 'Mute / unmute this track';
  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    applyMuteUI(isMuted);
    onMute(isMuted);
  });

  top.appendChild(nameSpan);
  top.appendChild(valSpan);
  top.appendChild(muteBtn);

  // Test play button (omitted when onTest is null, e.g. grouped SFX)
  if (onTest) {
    const testBtn = document.createElement('button');
    testBtn.textContent = 'TEST';
    Object.assign(testBtn.style, { ...BTN_STYLE, background: '#444', color: '#ddd' });
    testBtn.title = 'Preview this sound';
    testBtn.addEventListener('click', () => {
      onTest(volume);
    });
    top.appendChild(testBtn);
  }

  // Slider
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.01;
  slider.value = volume;
  Object.assign(slider.style, {
    width: '100%', accentColor: '#8bc34a', cursor: 'pointer',
  });

  slider.addEventListener('input', () => {
    volume = parseFloat(slider.value);
    valSpan.textContent = Math.round(volume * 100) + '%';
    onVolume(volume);
  });

  row.appendChild(top);
  row.appendChild(slider);

  return {
    el: row,
    setVolume(v) {
      volume = v;
      slider.value = v;
      valSpan.textContent = Math.round(v * 100) + '%';
      onVolume(v);
    },
    setMuted(m) {
      isMuted = m;
      applyMuteUI(m);
      onMute(m);
    },
  };
}

/**
 * Speaker button in the top-right row that toggles a master-volume popover.
 * The popover closes when clicking outside.
 */
export function initMasterVolumeButton() {
  initPlayers();

  const btn = document.createElement('button');
  btn.textContent = '🔊'; // speaker icon
  btn.setAttribute('aria-label', 'Master volume');
  btn.title = 'Master volume';
  Object.assign(btn.style, {
    padding: '6px 12px', background: '#333', color: '#fff',
    border: '1px solid #666', borderRadius: '4px', cursor: 'pointer',
    fontFamily: 'monospace', fontSize: '14px', lineHeight: '1',
  });
  getTopButtonRow().appendChild(btn);

  const popover = document.createElement('div');
  Object.assign(popover.style, {
    position: 'fixed', top: '48px', right: '10px', zIndex: '1001',
    background: 'rgba(30,30,30,0.92)', color: '#ddd',
    padding: '10px 12px', borderRadius: '6px',
    fontFamily: 'monospace', fontSize: '12px',
    border: '1px solid #555', minWidth: '200px',
    display: 'none',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px',
  });
  const label = document.createElement('span');
  label.textContent = 'Master';
  label.style.flex = '1';
  label.style.fontWeight = 'bold';
  label.style.color = '#fff';
  const valLabel = document.createElement('span');
  valLabel.style.color = '#999';
  valLabel.style.minWidth = '36px';
  valLabel.style.textAlign = 'right';
  valLabel.textContent = Math.round(masterVolume * 100) + '%';
  header.appendChild(label);
  header.appendChild(valLabel);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.01;
  slider.value = masterVolume;
  Object.assign(slider.style, {
    width: '100%', accentColor: '#fff', cursor: 'pointer',
  });
  slider.addEventListener('input', () => {
    masterVolume = parseFloat(slider.value);
    valLabel.textContent = Math.round(masterVolume * 100) + '%';
    applyVolumes();
    saveSettings();
  });

  popover.appendChild(header);
  popover.appendChild(slider);
  getHudHost().appendChild(popover);

  let popVisible = false;
  const setVisible = (v) => {
    popVisible = v;
    popover.style.display = v ? 'block' : 'none';
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = !popVisible;
    setVisible(next);
    if (next) document.dispatchEvent(new CustomEvent('panel-open', { detail: 'master' }));
  });
  document.addEventListener('panel-open', (e) => {
    if (e.detail !== 'master' && popVisible) setVisible(false);
  });
  popover.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => {
    if (popVisible) setVisible(false);
  });
}
