import { SHEEP, INITIAL_TOOLS, TOOL_SIZES } from './config.js';
import { spawnFlock } from './sheep.js';
import { setToolCount } from './input.js';
import { getTopButtonRow } from './topButtonRow.js';

let panel = null;
let visible = false;
let sliders = {};       // key → { slider, valueSpan, param }
let presetList = null;
let DEFAULT_SNAPSHOT = null;

const CATEGORIES = [
  {
    name: 'Sheep',
    color: '#f0f0e8',
    params: [
      { key: 'count',          label: 'Count',          min: 1,      max: 22,    step: 1,      respawn: true },
      { key: 'speed',          label: 'Speed',          min: 0.0002, max: 0.005, step: 0.0001 },
      { key: 'radius',         label: 'Size',           min: 0.008,  max: 0.04,  step: 0.001  },
      { key: 'stressPerPush',  label: 'Anger per push', min: 0.05,   max: 1.0,   step: 0.05   },
      { key: 'herdCalmRate',   label: 'Herd calm-rate', min: 0.05,   max: 1.0,   step: 0.05   },
      { key: 'crisisSpeedMult', label: 'Crisis speed',  min: 1.0,    max: 3.0,   step: 0.1    },
    ],
  },
  {
    name: 'Grass',
    color: '#4caf50',
    params: [
      { key: '_grassSize',     label: 'Grass size',     min: 0.008,  max: 0.08,  step: 0.002,  target: 'toolSize', toolType: 'grass' },
      { key: '_combSize',      label: 'Comb size',      min: 0.01,   max: 0.06,  step: 0.002,  target: 'toolSize', toolType: 'comb' },
    ],
  },
  {
    name: 'Tools',
    color: '#c4a35a',
    params: [
      { key: '_sheepdogSize',  label: 'Dog size',       min: 0.015,  max: 0.09,  step: 0.002,  target: 'toolSize', toolType: 'sheepdog' },
      { key: '_combCount',     label: 'Comb count',     min: 0,      max: 3,     step: 1,      tool: 'comb' },
      { key: '_blockCount',    label: 'Block count',    min: 0,      max: 10,    step: 1,      tool: 'block' },
      { key: '_blockSize',     label: 'Block size',     min: 0.03,   max: 0.56,  step: 0.005,  target: 'toolSize', toolType: 'block' },
      { key: 'dogShovelHalfFlat', label: 'Shovel width',       min: 0.02, max: 0.20, step: 0.005 },
      { key: 'dogShovelArmLen',   label: 'Shovel arm length', min: 0.01, max: 0.15, step: 0.005 },
    ],
  },
];

function getVal(param) {
  if (param.tool) return INITIAL_TOOLS.filter((t) => t.type === param.tool).length;
  if (param.target === 'toolSize') {
    const entry = TOOL_SIZES[param.toolType];
    // Block stores { w, h }; expose width to the slider and scale h proportionally on write.
    return typeof entry === 'object' ? entry.w : entry;
  }
  return SHEEP[param.key];
}

function setVal(param, val) {
  if (param.tool) {
    setToolCount(param.tool, val);
  } else if (param.target === 'toolSize') {
    const entry = TOOL_SIZES[param.toolType];
    if (typeof entry === 'object') {
      // Preserve aspect ratio when scaling { w, h } tools (e.g. block).
      const ratio = entry.h / entry.w;
      TOOL_SIZES[param.toolType] = { w: val, h: val * ratio };
    } else {
      TOOL_SIZES[param.toolType] = val;
    }
  } else {
    SHEEP[param.key] = val;
    if (param.respawn) spawnFlock(val);
  }
}

function snapshot() {
  const data = {};
  for (const cat of CATEGORIES) {
    for (const p of cat.params) {
      data[p.key] = getVal(p);
    }
  }
  return data;
}

function applySnapshot(data) {
  for (const cat of CATEGORIES) {
    for (const p of cat.params) {
      if (data[p.key] == null) continue;
      const val = data[p.key];
      setVal(p, val);
      const s = sliders[p.key];
      if (s) {
        s.slider.value = val;
        s.valueSpan.textContent = formatValue(val, p);
      }
    }
  }
}

// -- Presets persistence (localStorage) --

const STORAGE_KEY = 'angry-sheep-presets';

function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function savePresets(presets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

// -- Init --

export function initTuning() {
  // Capture hardcoded defaults before any user changes
  DEFAULT_SNAPSHOT = snapshot();

  // Toggle button
  const toggle = document.createElement('button');
  toggle.textContent = 'Tune';
  Object.assign(toggle.style, {
    padding: '6px 14px', background: '#333', color: '#fff',
    border: '1px solid #666', borderRadius: '4px', cursor: 'pointer',
    fontFamily: 'monospace', fontSize: '13px',
  });
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    visible = !visible;
    panel.style.display = visible ? 'block' : 'none';
    if (visible) document.dispatchEvent(new CustomEvent('panel-open', { detail: 'tune' }));
  });
  document.addEventListener('panel-open', (e) => {
    if (e.detail !== 'tune' && visible) {
      visible = false;
      panel.style.display = 'none';
    }
  });
  getTopButtonRow().appendChild(toggle);

  // Panel
  panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', bottom: '42px', left: '10px', zIndex: '10060',
    background: 'rgba(30,30,30,0.92)', color: '#ddd',
    padding: '12px 14px', borderRadius: '6px',
    fontFamily: 'monospace', fontSize: '12px',
    display: 'none', minWidth: '260px',
    maxHeight: 'calc(100vh - 60px)', overflowY: 'auto',
    border: '1px solid #555',
  });

  // Build categories
  for (const cat of CATEGORIES) {
    // Category header
    const header = document.createElement('div');
    Object.assign(header.style, {
      fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase',
      letterSpacing: '1px', color: cat.color,
      marginTop: '10px', marginBottom: '6px',
      borderBottom: `1px solid ${cat.color}33`, paddingBottom: '3px',
    });
    header.textContent = cat.name;
    panel.appendChild(header);

    for (const param of cat.params) {
      panel.appendChild(buildSlider(param));
    }
  }

  // Presets section
  const presetHeader = document.createElement('div');
  Object.assign(presetHeader.style, {
    fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase',
    letterSpacing: '1px', color: '#aaa',
    marginTop: '14px', marginBottom: '6px',
    borderBottom: '1px solid #aaa33', paddingBottom: '3px',
  });
  presetHeader.textContent = 'Presets';
  panel.appendChild(presetHeader);

  // Reset to defaults button
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset to defaults';
  Object.assign(resetBtn.style, {
    width: '100%', padding: '5px', marginBottom: '6px',
    background: 'transparent', color: '#aaa', border: '1px solid #666',
    borderRadius: '3px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '11px',
  });
  resetBtn.addEventListener('click', () => {
    if (DEFAULT_SNAPSHOT) applySnapshot(DEFAULT_SNAPSHOT);
  });
  panel.appendChild(resetBtn);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save current as preset';
  Object.assign(saveBtn.style, {
    width: '100%', padding: '5px', marginBottom: '6px',
    background: '#444', color: '#ddd', border: '1px solid #666',
    borderRadius: '3px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '11px',
  });
  saveBtn.addEventListener('click', () => {
    const name = prompt('Preset name:');
    if (!name) return;
    const presets = loadPresets();
    const existing = presets.findIndex((p) => p.name === name);
    if (existing >= 0) {
      presets[existing].data = snapshot();
    } else {
      presets.push({ name, data: snapshot() });
    }
    savePresets(presets);
    renderPresetList();
  });
  panel.appendChild(saveBtn);

  // Preset list container
  presetList = document.createElement('div');
  panel.appendChild(presetList);
  renderPresetList();

  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => {
    if (visible) {
      visible = false;
      panel.style.display = 'none';
    }
  });

  // Mount to <body>, not #fullscreenApp. #fullscreenApp has position:fixed
  // which creates a stacking context; nested z-index can't beat the camera
  // panel (z-index 10050) which sits at the body level. Mounting here lets
  // the panel's z-index: 10060 actually render above the camera preview.
  document.body.appendChild(panel);
}

function buildSlider(param) {
  const row = document.createElement('div');
  row.style.marginBottom = '6px';

  const label = document.createElement('div');
  label.style.display = 'flex';
  label.style.justifyContent = 'space-between';
  label.style.marginBottom = '2px';

  const nameSpan = document.createElement('span');
  nameSpan.textContent = param.label;

  const initVal = getVal(param);

  const valueSpan = document.createElement('span');
  valueSpan.style.color = '#999';
  valueSpan.textContent = formatValue(initVal, param);

  label.appendChild(nameSpan);
  label.appendChild(valueSpan);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = param.min;
  slider.max = param.max;
  slider.step = param.step;
  slider.value = initVal;
  Object.assign(slider.style, {
    width: '100%', accentColor: '#4caf50', cursor: 'pointer',
  });

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    valueSpan.textContent = formatValue(val, param);
    setVal(param, val);
  });

  sliders[param.key] = { slider, valueSpan, param };

  row.appendChild(label);
  row.appendChild(slider);
  return row;
}

function renderPresetList() {
  presetList.innerHTML = '';
  const presets = loadPresets();

  for (const preset of presets) {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '4px',
    });

    const loadBtn = document.createElement('button');
    loadBtn.textContent = preset.name;
    Object.assign(loadBtn.style, {
      flex: '1', padding: '4px 6px', marginRight: '4px',
      background: '#555', color: '#ddd', border: '1px solid #777',
      borderRadius: '3px', cursor: 'pointer', fontFamily: 'monospace',
      fontSize: '11px', textAlign: 'left',
    });
    loadBtn.addEventListener('click', () => applySnapshot(preset.data));

    const delBtn = document.createElement('button');
    delBtn.textContent = 'x';
    Object.assign(delBtn.style, {
      padding: '4px 7px', background: '#633', color: '#ddd',
      border: '1px solid #855', borderRadius: '3px', cursor: 'pointer',
      fontFamily: 'monospace', fontSize: '11px',
    });
    delBtn.addEventListener('click', () => {
      const list = loadPresets().filter((p) => p.name !== preset.name);
      savePresets(list);
      renderPresetList();
    });

    row.appendChild(loadBtn);
    row.appendChild(delBtn);
    presetList.appendChild(row);
  }
}

function formatValue(val, param) {
  if (param.step >= 1) return String(Math.round(val));
  if (param.step >= 0.01) return val.toFixed(2);
  return val.toFixed(4);
}
