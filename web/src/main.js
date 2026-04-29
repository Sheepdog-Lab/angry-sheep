import p5 from 'p5';
import {
  CANVAS_BG_COLOR,
  MASK_COLOR,
  MARKER_STREAM,
  TABLE_RADIUS,
  TERRAIN_TEXTURE_URL,
  SHEEP_TEXTURE_URL,
  ANGER_INDICATOR_URL,
  SHEEPDOG_TEXTURE_URL,
  HERDING_INDICATOR_URL,
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
  CALMING_VOICE_URL,
  SESSION,
} from './config.js';
import * as Input from './input.js';
import { drawPen, setPenSprite } from './pen.js';
import { tickIdleHerd } from './idleHerd.js';
import {
  drawTools,
  setGrassSprite,
  setSheepdogSprite,
  setHerdingIndicatorSprite,
  setBlockSprite,
  setCombSprite,
} from './tools.js';
import {
  updateFlock,
  drawFlock,
  drawFlockVictoryCelebration,
  setSheepSprite,
  setAngerIndicatorSprite,
  setCalmingCueSprites,
  getFlock,
  getFlockSnapshot,
  replaceFlockFromSnapshot,
  isAnySheepEating,
  isAnySheepBeingGroomed,
} from './sheep.js';
import {
  drawVictoryUnderlay,
  drawVictoryPenAccent,
  drawVictoryParticles,
} from './victoryCelebration.js';
import * as MP from './multiplayer.js';
import * as Session from './session.js';
import { initTuning } from './tuning.js';
import { connectMarkerStream, getMarkerStreamState } from './markerStream.js';
import { getMarkerCalibration, initMarkerCalibration } from './markerCalibration.js';
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
import { initSound, fadeAudio, setEatGrassActive, setBristlingActive, initMasterVolumeButton, initSoundPanel } from './sound.js';
import { initHintButtons } from './hintButtons.js';
import { getTopButtonRow, getBelowHerdColumn } from './topButtonRow.js';
import { initTableProjection } from './tableProjection.js';
import './browserFramePump.js';

initGameMode();
initMarkerCalibration();
initTableProjection();
initCameraSwitcher().catch((e) => console.warn('[camera] init:', e));

/** Latest host snapshot for online guests (`?room=...`). */
let latestGuestSnapshot = null;

let notifyViewportChange = () => {};
initFullscreenControls(() => {
  notifyViewportChange();
});

function drawCalibrationCircleTargets(p, canvasSize) {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const CALIBRATION_RADIUS_SCALE = 0.864; // keep in sync with server
  const CALIBRATION_GUIDE_INSET = 0.9; // 10% closer to center; must match server
  const r = TABLE_RADIUS * CALIBRATION_RADIUS_SCALE * CALIBRATION_GUIDE_INSET * canvasSize;
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
    padding: '6px 14px',
    background: '#8b1a1a',
    color: '#fff',
    border: '1px solid #b33',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'monospace',
  });
  resetBtn.addEventListener('click', () => Session.resetSession());
  getBelowHerdColumn().appendChild(resetBtn);
}

function initDemoVictoryButton() {
  const btn = document.createElement('button');
  btn.textContent = 'Demo Victory';
  Object.assign(btn.style, {
    padding: '6px 14px',
    background: '#b88a00',
    color: '#fff',
    border: '1px solid #e0b020',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'monospace',
  });
  btn.addEventListener('click', () => Session.forceVictory());
  getBelowHerdColumn().appendChild(btn);
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
  let angerIndicatorImg = null;
  /** @type {import('p5').Image | null} */
  let sheepdogImg = null;
  /** @type {import('p5').Image | null} */
  let herdingIndicatorImg = null;
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
  /** @type {import('p5').Image | null} */
  let calmingVoiceImg = null;

  /**
   * Missing/deleted files must not break preload or the draw loop.
   * p5 returns a placeholder image object; we also attach a failure hook
   * so a 404 does not become a hard render failure.
   * @param {string} url
   * @param {string} label
   * @returns {import('p5').Image | null}
   */
  const safeLoadImage = (url, label) => p.loadImage(
    url,
    undefined,
    () => {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[assets] Failed to load ${label}: ${url}`);
      }
    },
  );

  p.preload = () => {
    terrainImg = safeLoadImage(TERRAIN_TEXTURE_URL, 'terrain');
    sheepImg = safeLoadImage(SHEEP_TEXTURE_URL, 'sheep');
    angerIndicatorImg = safeLoadImage(ANGER_INDICATOR_URL, 'anger indicator');
    sheepdogImg = safeLoadImage(SHEEPDOG_TEXTURE_URL, 'sheepdog');
    herdingIndicatorImg = safeLoadImage(HERDING_INDICATOR_URL, 'herding indicator');
    grassImg = safeLoadImage(GRASS_TEXTURE_URL, 'grass tool');
    blockImg = safeLoadImage(BLOCKS_TEXTURE_URL, 'blocks');
    penImg = safeLoadImage(PEN_TEXTURE_URL, 'pen');
    victoryS1Img = safeLoadImage(VICTORY_S1_URL, 'victory sprite s1');
    victoryS2Img = safeLoadImage(VICTORY_S2_URL, 'victory sprite s2');
    victoryS3Img = safeLoadImage(VICTORY_S3_URL, 'victory sprite s3');
    victoryBannerImg = safeLoadImage(VICTORY_BANNER_URL, 'victory banner');
    terrainGrassClumpImg = safeLoadImage(TERRAIN_GRASS_CLUMP_URL, 'terrain grass clump');
    calmingFeedingImg = safeLoadImage(CALMING_FEEDING_URL, 'calming feeding');
    calmingPettingImg = safeLoadImage(CALMING_PETTING_URL, 'calming petting');
    calmingVoiceImg = safeLoadImage(CALMING_VOICE_URL, 'calming voice');
  };

  p.setup = () => {
    canvasSize = getGameStageSize();
    canvasEl = p.createCanvas(canvasSize, canvasSize);
    canvasEl.parent('gameStage');
    setSheepSprite(sheepImg);
    setAngerIndicatorSprite(angerIndicatorImg);
    setCalmingCueSprites({
      feeding: calmingFeedingImg,
      petting: calmingPettingImg,
      voice: calmingVoiceImg,
    });
    Session.setCrisisHintCueSprites({
      feeding: calmingFeedingImg,
      petting: calmingPettingImg,
      voice: calmingVoiceImg,
    });
    setSheepdogSprite(sheepdogImg);
    setHerdingIndicatorSprite(herdingIndicatorImg);
    setGrassSprite(grassImg);
    setCombSprite(calmingPettingImg);
    setBlockSprite(blockImg);
    setPenSprite(penImg);
    if (victoryBannerImg && victoryBannerImg.width > 2 && victoryBannerImg.height > 2) {
      stripVictoryShepherdBackdrop(victoryBannerImg);
    }
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
    if (getGameMode() === 'digital') {
      MP.initOnlineFromUrl({
        onGuest: () => Input.setGuestMultiplayerMode(true),
        onHost: () => Input.setGuestMultiplayerMode(false),
        onPromotedToHost: () => Input.setGuestMultiplayerMode(false),
        onSnapshot: (msg) => {
          latestGuestSnapshot = msg;
        },
      });
    }
    initSound();
    // Order matters for the top-right row (master volume + Tune).
    // The Reset-the-Game / Demo-Victory / Reset-the-Sound buttons mount
    // into a separate vertical column below the green Hold-to-Herd
    // button — see getBelowHerdColumn() in topButtonRow.js. They stack
    // top → bottom in append order: Red, Yellow, Blue.
    initResetButton();          // Red    (top of below-herd column)
    initDemoVictoryButton();    // Yellow (middle of below-herd column)
    initHintButtons();          // Blue   (bottom of below-herd column) + rows 2 + 3
    initMasterVolumeButton();   // bottom row: speaker / master volume popover
    initSoundPanel();           // bottom row: full per-track sound panel
    initTuning();               // bottom row: Tune
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
    if (MP.isOnlineGuest() && latestGuestSnapshot) {
      const sn = latestGuestSnapshot;
      // Apply flock/tools before phase so lockVictorySheepPositions sees host sheep positions.
      if (Array.isArray(sn.tools)) Input.replaceToolsFromSnapshot(sn.tools);
      if (Array.isArray(sn.flock)) replaceFlockFromSnapshot(sn.flock);
      if (typeof sn.phase === 'string') {
        Session.applyNetworkPhase(sn.phase, sn.frameCounter);
      }
    }

    Input.updateHover(p);
    const state = Input.getState();

    if (MP.isOnlineGuest()) {
      MP.guestSendInput(state.pet.points, state.voice.active);
    }

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

    // Update session state machine (host / solo only — guests follow snapshots)
    if (!MP.isOnlineGuest()) {
      Session.update();
    }

    const phase = Session.getPhase();
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
      if (!MP.isOnlineGuest()) {
        if (MP.isOnlineHost()) {
          const merged = MP.mergeGuestInputInto(state);
          tickIdleHerd(merged.tools, getFlock());
          updateFlock(merged);
        } else {
          tickIdleHerd(state.tools, getFlock());
          updateFlock(state);
        }
      }
      setEatGrassActive(isAnySheepEating());
      setBristlingActive(isAnySheepBeingGroomed());
    } else {
      setEatGrassActive(false);
      setBristlingActive(false);
    }

    if (MP.isOnlineHost() && p.frameCount % 2 === 0) {
      MP.hostSendSnapshot({
        phase: Session.getPhase(),
        frameCounter: Session.getFrameCounter(),
        tools: Input.getToolsSnapshot(),
        flock: getFlockSnapshot(),
      });
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

    const fcPhase = Session.getFrameCounter();
    const winFc =
      phase === 'win' && Number.isFinite(fcPhase) ? Math.max(0, fcPhase) : 0;
    if (phase === 'win') {
      drawVictoryUnderlay(p, canvasSize, winFc);
    }

    // Pen (always visible)
    drawPen(p, canvasSize);

    if (phase === 'win') {
      drawVictoryPenAccent(p, canvasSize, winFc);
    }

    // Win: global particles under flock; each sheep draws soft local accents above sprite.
    if (phase === 'win') {
      drawVictoryParticles(p, canvasSize, winFc);
      drawFlockVictoryCelebration(p, canvasSize, winFc);
    } else if (phase !== 'reset') {
      drawFlock(p, canvasSize);
      drawTools(p, state.tools, canvasSize, Input.getHoveredIds(), getFlock());
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

    // Session overlay (intro, hints, win, reset fade)
    Session.drawOverlay(p, canvasSize);

    // HUD only during playing; Reset the Game button stays visible always.
    if (phase === 'playing') {
      Input.drawHUD(p, canvasSize);
    }

    p.push();
    p.fill(255, 255, 255, 170);
    p.noStroke();
    p.textSize(11);
    p.textAlign(p.LEFT, p.TOP);
    const mpLine = MP.getMultiplayerStatus();
    p.text(
      `Mode: ${gameMode}  |  markers: ${markerState.markers.length}${gameMode === 'physical' ? `  |  flipX: ${markerCalibration.flipX} flipY: ${markerCalibration.flipY}` : ''}${mpLine ? `  |  Online: ${mpLine}` : ''}`,
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
