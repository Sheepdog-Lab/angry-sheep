import p5 from 'p5';
import {
  CANVAS_BG_COLOR,
  MASK_COLOR,
  MARKER_STREAM,
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
  CALMING_FEEDING_URL,
  CALMING_PETTING_URL,
  SESSION,
} from './config.js';
import * as Input from './input.js';
import { drawPen, setPenSprite } from './pen.js';
import { drawTools, setGrassSprite, setSheepdogSprite, setBlockSprite } from './tools.js';
import {
  updateFlock,
  drawFlock,
  setSheepSprite,
  setCalmingCueSprites,
  getFlock,
  isAnySheepEating,
} from './sheep.js';
import * as Session from './session.js';
import { initTuning } from './tuning.js';
import { connectMarkerStream, getMarkerStreamState } from './markerStream.js';
import { getMarkerCalibration, initMarkerCalibration } from './markerCalibration.js';
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

initGameMode();
initMarkerCalibration();
initCameraSwitcher().catch((e) => console.warn('[camera] init:', e));

let notifyViewportChange = () => {};
initFullscreenControls(() => {
  notifyViewportChange();
});

function drawCalibrationCircleTargets(p, canvasSize) {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const r = TABLE_RADIUS * canvasSize;
  const points = [
    { x: cx, y: cy - r, label: '1' },
    { x: cx + r, y: cy, label: '2' },
    { x: cx, y: cy + r, label: '3' },
    { x: cx - r, y: cy, label: '4' },
  ];

  for (const point of points) {
    p.push();
    p.fill(255, 220, 90, 220);
    p.stroke(0, 0, 0, 220);
    p.strokeWeight(2);
    p.circle(point.x, point.y, 28);
    p.noStroke();
    p.fill(0);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(14);
    p.text(point.label, point.x, point.y);
    p.pop();
  }
}

let resetBtn = null;
function initResetButton() {
  resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset the Game';
  Object.assign(resetBtn.style, {
    position: 'fixed',
    top: '10px',
    right: '160px',
    zIndex: '1000',
    padding: '6px 14px',
    background: '#8b1a1a',
    color: '#fff',
    border: '1px solid #b33',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'monospace',
    display: 'none',
  });
  resetBtn.addEventListener('click', () => Session.resetSession());
  document.body.appendChild(resetBtn);
}

new p5((p) => {
  let canvasSize;
  let canvasEl = null;
  let calibrationConfirmedAtMs = null;
  let lastCalibrationLoaded = false;
  let lastCalibrationNoticeId = 0;
  let calibrationNoticeText = '';
  let calibrationNoticeAtMs = null;
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
  /** @type {import('p5').Image | null} */
  let calmingFeedingImg = null;
  /** @type {import('p5').Image | null} */
  let calmingPettingImg = null;

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
    calmingFeedingImg = p.loadImage(CALMING_FEEDING_URL);
    calmingPettingImg = p.loadImage(CALMING_PETTING_URL);
  };

  p.setup = () => {
    canvasSize = getGameStageSize();
    canvasEl = p.createCanvas(canvasSize, canvasSize);
    canvasEl.parent('gameStage');
    setSheepSprite(sheepImg);
    setCalmingCueSprites({ feeding: calmingFeedingImg, petting: calmingPettingImg });
    Session.setCrisisHintCueSprites({ feeding: calmingFeedingImg, petting: calmingPettingImg });
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
    initResetButton();
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
    const markerCalibration = getMarkerCalibration();
    const calibrationLoaded = !!markerState.calibration?.loaded;
    const calibrationActive = !!markerState.calibration?.active;
    const calibrationNoticeId = Number(markerState.calibration?.noticeId || 0);
    const calibrationMessage = markerState.calibration?.message || '';

    if (calibrationLoaded && !lastCalibrationLoaded) {
      calibrationConfirmedAtMs = p.millis();
    }
    if (!calibrationLoaded) {
      calibrationConfirmedAtMs = null;
    }
    lastCalibrationLoaded = calibrationLoaded;

    if (calibrationNoticeId && calibrationNoticeId !== lastCalibrationNoticeId && calibrationMessage) {
      calibrationNoticeText = calibrationMessage;
      calibrationNoticeAtMs = p.millis();
      lastCalibrationNoticeId = calibrationNoticeId;
    }

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
        buildPhysicalTools(markerState.markers),
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
      drawTools(p, state.tools, canvasSize, Input.getHoveredId(), getFlock());
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

    if (gameMode === 'physical' && (!calibrationLoaded || calibrationActive)) {
      drawCalibrationCircleTargets(p, canvasSize);
    }

    // Physical ArUco markers stay visible even when calibration moves them
    // into the black overscan area around the play circle.
    if (phase !== 'win' && gameMode === 'physical') {
      drawMarkerOverlay(p, canvasSize);
    }

    // Session overlay (intro, hints, win, reset fade)
    Session.drawOverlay(p, canvasSize);

    // HUD + reset button only during playing
    if (phase === 'playing') {
      Input.drawHUD(p, canvasSize);
    }
    if (resetBtn) resetBtn.style.display = phase === 'playing' ? '' : 'none';

    p.push();
    p.fill(255, 255, 255, 170);
    p.noStroke();
    p.textSize(11);
    p.textAlign(p.LEFT, p.TOP);
    p.text(
      `Mode: ${gameMode}  |  markers: ${markerState.markers.length}  |  raw: ${markerState.rawMarkers.map((m) => m.id).join(', ') || 'none'}${gameMode === 'physical' ? `  |  flipX: ${markerCalibration.flipX} flipY: ${markerCalibration.flipY}` : ''}`,
      12,
      12,
    );
    p.pop();

    if (
      gameMode === 'physical' &&
      calibrationLoaded &&
      !calibrationActive &&
      calibrationConfirmedAtMs !== null &&
      (p.millis() - calibrationConfirmedAtMs) <= 10000
    ) {
      p.push();
      p.fill(70, 220, 120, 220);
      p.stroke(10, 60, 20, 220);
      p.strokeWeight(2);
      p.rectMode(p.CENTER);
      p.rect(canvasSize / 2, 36, 250, 38, 10);
      p.noStroke();
      p.fill(10, 30, 14);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(16);
      p.text('Calibration complete', canvasSize / 2, 36);
      p.pop();
    }

    if (
      gameMode === 'physical' &&
      calibrationNoticeText &&
      calibrationNoticeAtMs !== null &&
      (p.millis() - calibrationNoticeAtMs) <= 2500
    ) {
      p.push();
      p.fill(30, 30, 30, 220);
      p.stroke(255, 255, 255, 90);
      p.strokeWeight(1.5);
      p.rectMode(p.CENTER);
      p.rect(canvasSize / 2, 74, Math.min(canvasSize - 40, 520), 42, 10);
      p.noStroke();
      p.fill(255);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(14);
      p.text(calibrationNoticeText, canvasSize / 2, 74);
      p.pop();
    }
  };

  p.windowResized = () => {
    notifyViewportChange();
  };
});
