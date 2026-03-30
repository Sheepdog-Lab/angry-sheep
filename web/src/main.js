import p5 from 'p5';
import {
  CANVAS_BG_COLOR,
  MASK_COLOR,
  TABLE_RADIUS,
  TERRAIN_TEXTURE_URL,
  SHEEP_TEXTURE_URL,
  SHEEPDOG_TEXTURE_URL,
  BLOCKS_TEXTURE_URL,
  GRASS_TEXTURE_URL,
} from './config.js';
import * as Input from './input.js';
import { drawPen } from './pen.js';
import { drawTools, setGrassSprite, setSheepdogSprite, setBlockSprite } from './tools.js';
import { updateFlock, drawFlock, setSheepSprite, getFlock } from './sheep.js';
import * as Session from './session.js';
import { initTuning } from './tuning.js';
import { connectMarkerStream } from './markerStream.js';
import { drawMarkerOverlay } from './markerOverlay.js';
import { initCameraSwitcher } from './cameraSelect.js';
import './browserFramePump.js';

initCameraSwitcher().catch((e) => console.warn('[camera] init:', e));

new p5((p) => {
  let canvasSize;
  /** @type {import('p5').Image | null} */
  let terrainImg = null;
  /** @type {import('p5').Image | null} */
  let sheepImg = null;
  /** @type {import('p5').Image | null} */
  let sheepdogImg = null;
  /** @type {import('p5').Image | null} */
  let grassImg = null;
  /** @type {import('p5').Image | null} */
  let blockImg = null;

  p.preload = () => {
    terrainImg = p.loadImage(TERRAIN_TEXTURE_URL);
    sheepImg = p.loadImage(SHEEP_TEXTURE_URL);
    sheepdogImg = p.loadImage(SHEEPDOG_TEXTURE_URL);
    grassImg = p.loadImage(GRASS_TEXTURE_URL);
    blockImg = p.loadImage(BLOCKS_TEXTURE_URL);
  };

  p.setup = () => {
    canvasSize = Math.min(p.windowWidth, p.windowHeight);
    p.createCanvas(canvasSize, canvasSize);
    setSheepSprite(sheepImg);
    setSheepdogSprite(sheepdogImg);
    setGrassSprite(grassImg);
    setBlockSprite(blockImg);
    Session.startSession(p);
    initTuning();
    connectMarkerStream();
  };

  p.draw = () => {
    Input.updateHover(p);
    const state = Input.getState();
    const phase = Session.getPhase();

    // Update session state machine
    Session.update();

    // Only run sheep sim during playing phase
    if (phase === 'playing') {
      updateFlock(state);
    }

    // -- Render --
    if (terrainImg && terrainImg.width > 0) {
      const iw = terrainImg.width;
      const ih = terrainImg.height;
      const scale = Math.max(canvasSize / iw, canvasSize / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      p.push();
      p.imageMode(p.CENTER);
      p.image(terrainImg, canvasSize / 2, canvasSize / 2, dw, dh);
      p.pop();
    } else {
      p.background(CANVAS_BG_COLOR);
    }

    // Pen (always visible)
    drawPen(p, canvasSize);

    // Sheep and tools (visible during intro fade-in, playing, and outro)
    if (phase !== 'reset') {
      drawFlock(p, canvasSize);
      drawTools(p, state.tools, canvasSize, Input.getHoveredId(), getFlock());
    }

    // Physical ArUco markers from server.py (camera → WebSocket)
    drawMarkerOverlay(p, canvasSize);

    // Black mask
    const ctx = p.drawingContext;
    const cx = canvasSize / 2;
    const cy = canvasSize / 2;
    const r = TABLE_RADIUS * canvasSize;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvasSize, canvasSize);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fillStyle = MASK_COLOR;
    ctx.fill();
    ctx.restore();

    // Subtle circle edge
    p.noFill();
    p.stroke(255, 255, 240, 40);
    p.strokeWeight(1.5);
    p.ellipse(cx, cy, r * 2);

    // Session overlay (intro, timer, hints, win, timeout, reset fade)
    Session.drawOverlay(p, canvasSize);

    // HUD only during playing
    if (phase === 'playing') {
      Input.drawHUD(p, canvasSize);
    }
  };

  p.windowResized = () => {
    canvasSize = Math.min(p.windowWidth, p.windowHeight);
    p.resizeCanvas(canvasSize, canvasSize);
    Input.updateCanvasSize(canvasSize);
  };
});
