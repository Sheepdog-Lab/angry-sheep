import p5 from 'p5';
import {
  CANVAS_BG_COLOR,
  MARKER_STREAM,
  MASK_COLOR,
  TABLE_RADIUS,
  TERRAIN_TEXTURE_URL,
  SHEEP_TEXTURE_URL,
  SHEEPDOG_TEXTURE_URL,
  BLOCKS_TEXTURE_URL,
  GRASS_TEXTURE_URL,
  PEN_TEXTURE_URL,
  VICTORY_S1_URL,
  VICTORY_S2_URL,
  VICTORY_S3_URL,
  VICTORY_BANNER_URL,
  TERRAIN_GRASS_CLUMP_URL,
  SESSION,
} from './config.js';
import * as Input from './input.js';
import { drawPen, setPenSprite } from './pen.js';
import { drawPhysicalTools, drawTools, setGrassSprite, setSheepdogSprite, setBlockSprite } from './tools.js';
import { updateFlock, drawFlock, setSheepSprite, getFlock, isAnySheepEating } from './sheep.js';
import * as Session from './session.js';
import { initTuning } from './tuning.js';
import { connectMarkerStream, getMarkerStreamState } from './markerStream.js';
import { initMarkerCalibration } from './markerCalibration.js';
import { drawMarkerOverlay } from './markerOverlay.js';
import { initCameraSwitcher } from './cameraSelect.js';
import { getGameStageSize, initFullscreenControls } from './fullscreen.js';
import { getGameMode, initGameMode } from './gameMode.js';
import { buildPhysicalTools } from './physicalMode.js';
import { stripVictoryShepherdBackdrop } from './victoryShepherdBackdrop.js';
import {
  setTerrainGrassImage,
  initTerrainAmbientGrass,
  drawTerrainAmbientGrass,
  updateGrassSheepInteraction,
} from './terrainGrass.js';
import { initSoundPanel, fadeAudio, setEatGrassActive } from './sound.js';
import './browserFramePump.js';

initCameraSwitcher().catch((e) => console.warn('[camera] init:', e));
initMarkerCalibration();
initGameMode();

let notifyViewportChange = () => {};
initFullscreenControls(() => {
  notifyViewportChange();
});

new p5((p) => {
  let canvasSize;
  let canvasEl = null;
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
  /** @type {import('p5').Image | null} */
  let penImg = null;
  /** @type {import('p5').Image | null} */
  let victoryS1Img = null;
  /** @type {import('p5').Image | null} */
  let victoryS2Img = null;
  /** @type {import('p5').Image | null} */
  let victoryS3Img = null;
  /** @type {import('p5').Image | null} */
  let victoryBannerImg = null;
  /** @type {import('p5').Image | null} */
  let terrainGrassClumpImg = null;

  p.preload = () => {
    terrainImg = p.loadImage(TERRAIN_TEXTURE_URL);
    sheepImg = p.loadImage(SHEEP_TEXTURE_URL);
    sheepdogImg = p.loadImage(SHEEPDOG_TEXTURE_URL);
    grassImg = p.loadImage(GRASS_TEXTURE_URL);
    blockImg = p.loadImage(BLOCKS_TEXTURE_URL);
    penImg = p.loadImage(PEN_TEXTURE_URL);
    victoryS1Img = p.loadImage(VICTORY_S1_URL);
    victoryS2Img = p.loadImage(VICTORY_S2_URL);
    victoryS3Img = p.loadImage(VICTORY_S3_URL);
    victoryBannerImg = p.loadImage(VICTORY_BANNER_URL);
    terrainGrassClumpImg = p.loadImage(TERRAIN_GRASS_CLUMP_URL);
  };

  p.setup = () => {
    canvasSize = getGameStageSize();
    canvasEl = p.createCanvas(canvasSize, canvasSize);
    canvasEl.parent('gameStage');
    setSheepSprite(sheepImg);
    setSheepdogSprite(sheepdogImg);
    setGrassSprite(grassImg);
    setBlockSprite(blockImg);
    setPenSprite(penImg);
    stripVictoryShepherdBackdrop(victoryBannerImg);
    Session.setVictoryCelebrationSprites({
      s1: victoryS1Img,
      s2: victoryS2Img,
      s3: victoryS3Img,
      banner: victoryBannerImg,
    });
    Session.startSession();
    setTerrainGrassImage(terrainGrassClumpImg);
    initTerrainAmbientGrass(canvasSize);
    Input.init(p, canvasSize);
    initTuning();
    initSoundPanel();
    connectMarkerStream();

    notifyViewportChange = () => {
      const nextSize = getGameStageSize();
      if (nextSize === canvasSize) return;
      canvasSize = nextSize;
      p.resizeCanvas(canvasSize, canvasSize);
      Input.updateCanvasSize(canvasSize);
      initTerrainAmbientGrass(canvasSize);
    };
  };

  p.draw = () => {
    Input.updateHover(p);
    const state = Input.getState();
    const phase = Session.getPhase();
    const gameMode = getGameMode();
    const markerState = getMarkerStreamState();

    // Update session state machine
    Session.update();

    // Background audio fades in/out with the scene
    const fc = Session.getFrameCounter();
    if (phase === 'intro') {
      fadeAudio(Math.min(1, (fc / SESSION.introDuration) * 2));
    } else if (phase === 'playing') {
      fadeAudio(1);
    } else if (phase === 'reset') {
      fadeAudio(Math.max(0, 1 - fc / SESSION.resetPause));
    } else {
      fadeAudio(1);
    }

    // Only run sheep sim during playing phase
    if (gameMode === 'physical') {
      Input.setPhysicalTools(
        buildPhysicalTools(
          markerState.markers,
          canvasSize,
          markerState.frameW,
          markerState.frameH,
          MARKER_STREAM.mirrorX,
        ),
      );
    }

    if (phase === 'playing') {
      updateFlock(state);
      setEatGrassActive(isAnySheepEating());
    } else {
      setEatGrassActive(false);
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

    updateGrassSheepInteraction(
      getFlock(),
      canvasSize,
      phase === 'playing',
      p.frameCount,
    );
    drawTerrainAmbientGrass(p, canvasSize);

    // Pen (always visible)
    drawPen(p, canvasSize);

    // Sheep and tools (hidden on win — victory uses its own character sprites)
    if (phase !== 'reset' && phase !== 'win') {
      drawFlock(p, canvasSize);
      if (gameMode === 'physical') {
        drawPhysicalTools(p, state.tools, canvasSize);
      } else {
        drawTools(p, state.tools, canvasSize, Input.getHoveredId(), getFlock());
      }
    }

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

    // Physical ArUco markers stay visible even when calibration moves them
    // into the black overscan area around the play circle.
    if (phase !== 'win' && gameMode === 'digital') {
      drawMarkerOverlay(p, canvasSize);
    }

    // Session overlay (intro, timer, hints, win, timeout, reset fade)
    Session.drawOverlay(p, canvasSize);

    // HUD only during playing
    if (phase === 'playing') {
      Input.drawHUD(p, canvasSize);
    }

    p.push();
    p.fill(255, 255, 255, 170);
    p.noStroke();
    p.textSize(11);
    p.textAlign(p.LEFT, p.TOP);
    p.text(
      `Mode: ${gameMode}  |  markers: ${markerState.markers.length}  |  raw: ${markerState.rawMarkers.map((m) => m.id).join(', ') || 'none'}`,
      12,
      12,
    );
    p.pop();
  };

  p.windowResized = () => {
    notifyViewportChange();
  };
});
