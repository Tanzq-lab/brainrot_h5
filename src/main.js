(function () {
  'use strict';

  const cfg = window.BRAINROT_CONFIG;
  const storage = window.BrainrotStorage;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const toastEl = document.getElementById('toast');
  const modalEl = document.getElementById('confirm-modal');
  const modalNameEl = document.getElementById('modal-brainrot-name');
  const deleteCancelBtn = document.getElementById('delete-cancel');
  const deleteConfirmBtn = document.getElementById('delete-confirm');
  const debugPanel = document.getElementById('debug-panel');
  const bootOverlayEl = document.getElementById('boot-overlay');
  const bootProgressFillEl = document.getElementById('boot-progress-fill');
  const bootProgressLabelEl = document.getElementById('boot-progress-label');

  const DPR_LIMIT = getCanvasDprLimit();
  const BOOT_IMAGE_TIMEOUT = 3500;
  const BOOT_TOTAL_TIMEOUT = 6000;
  const RESIZE_DEBOUNCE_MS = 80;
  const keyState = new Set();
  const CAMERA_LERP = 9.5;
  const WORLD_CAMERA_ZOOM = 0.5;
  const FIGMA_LAYOUT_VERSION = 'figma_node_4_9_v2';
  const BOOT_SPLASH_DURATION = 1500;
  const MIN_NOTICE_TIME = 1000;
  const TILE_IMG_PATH = 'assets/images/RobloxOverlayImg.png';
  const SLOT_COLLECT_COOLDOWN_SECONDS = Number.isFinite(cfg.collectCooldownSeconds)
    ? Math.max(0, Number(cfg.collectCooldownSeconds))
    : 3;

  const FIGMA = {
    world: { w: 2900, h: 1757 },
    room: { x: 256, y: 438, w: 1563, h: 915 },
    shopFloor: { x: 309, y: 539, w: 1407, h: 730 },
    roomCorridor: { x: 1716, y: 749, w: 103, h: 322 },
    collection: { x: 1871, y: 648, w: 256, h: 512 },
    conveyor: { x: 2644, y: 1, w: 256, h: 1756 },
    slots: [
      { x: 372, y: 555, w: 143, h: 163, itemX: 352, itemY: 425 },
      { x: 635, y: 555, w: 143, h: 163, itemX: 618, itemY: 425 },
      { x: 902, y: 555, w: 143, h: 163, itemX: 884, itemY: 425 },
      { x: 1168, y: 555, w: 143, h: 163, itemX: 1150, itemY: 431 },
      { x: 1431, y: 555, w: 143, h: 163, itemX: 1416, itemY: 431 },
      { x: 367, y: 1144, w: 143, h: 163, itemX: 350, itemY: 1021 },
      { x: 640, y: 1144, w: 143, h: 163, itemX: 623, itemY: 1021 },
      { x: 897, y: 1144, w: 143, h: 163, itemX: 879, itemY: 1021 },
      { x: 1150, y: 1144, w: 143, h: 163, itemX: 1135, itemY: 1021 },
      { x: 1425, y: 1144, w: 143, h: 163, itemX: 1408, itemY: 1021 }
    ],
    conveyorItems: [
      { x: 2674, y: 12, w: 170, h: 279 },
      { x: 2676, y: 321, w: 170, h: 279 },
      { x: 2687, y: 679, w: 170, h: 279 },
      { x: 2690, y: 1012, w: 170, h: 279 },
      { x: 2690, y: 1396, w: 170, h: 279 }
    ],
    playerSpawn: { x: 986, y: 904 },
    hud: {
      joystick: { outerX: 84, outerY: 612, outerW: 132, outerH: 132, centerX: 150, centerY: 678, ringX: 103, ringY: 631, ringW: 94, knobSize: 38 },
      coin: { w: 216, h: 62, right: 32, bottom: 32, icon: 38 }
    }
  };

  const tileImage = new Image();
  let tileImageReady = false;
  tileImage.onload = () => { tileImageReady = true; };
  tileImage.onerror = () => { console.warn('[BrainrotUI] RobloxOverlayImg 加载失败，使用纯色兜底'); };
  tileImage.src = TILE_IMG_PATH;

  const PLAYER_CHARACTER_SCALE = 0.3;
  const PLAYER_WALK_SPEED = 9.5;
  const PLAYER_WALK_SWING = 0.24;
  const PLAYER_WALK_BOB = 4;
  const PLAYER_SPAWN_HALO_VISIBLE_SECONDS = 3;
  const PLAYER_SPAWN_HALO_FADE_SECONDS = 0.8;
  const PLAYER_ASSET_PATHS = {
    head: 'assets/images/Player/head.png',
    body: 'assets/images/Player/body.png',
    arm: 'assets/images/Player/arm.png',
    leg: 'assets/images/Player/leg.png'
  };


  const FAKE_PLAYER_CONFIG = {
    firstSpawnDelayMin: 8,
    firstSpawnDelayMax: 30,
    spawnIntervalMin: 45,
    spawnIntervalMax: 75,
    lifeSecondsMin: 150,
    lifeSecondsMax: 240,
    spawnPauseMin: 2,
    spawnPauseMax: 5,
    exitTimeout: 12,
    maxCount: 4,
    arriveDistance: 34,
    interestArriveDistance: 52,
    localArriveDistance: 24,
    slotTourMin: 1,
    slotTourMax: 3,
    slotActionMin: 1.0,
    slotActionMax: 2.4,
    conveyorActionMin: 0.8,
    conveyorActionMax: 1.5,
    collectActionMin: 0.6,
    collectActionMax: 1.2,
    pauseMin: 0.45,
    pauseMax: 1.2,
    wanderPauseMin: 0.35,
    wanderPauseMax: 0.85,
    wanderStepsMin: 1,
    wanderStepsMax: 2,
    orbitRadiusMin: 42,
    orbitRadiusMax: 74,
    spawnAreaJitter: 26,
    behaviorWeights: {
      wander: 30,
      buyBrainrot: 30,
      fakeCollectMoney: 20,
      visitSlot: 20
    }
  };

  function loadSpriteImage(src) {
    const img = new Image();
    img.ready = false;
    img.onload = () => { img.ready = true; };
    img.onerror = () => { console.warn('[PlayerSprite] 资源加载失败:', src); };
    img.src = src;
    return img;
  }

  const playerSprites = {
    head: loadSpriteImage(PLAYER_ASSET_PATHS.head),
    body: loadSpriteImage(PLAYER_ASSET_PATHS.body),
    arm: loadSpriteImage(PLAYER_ASSET_PATHS.arm),
    leg: loadSpriteImage(PLAYER_ASSET_PATHS.leg)
  };

  const brainrotSprites = new Map();

  function getBrainrotSprite(template) {
    if (!template || !template.imageSrc) return null;
    if (!brainrotSprites.has(template.id)) {
      brainrotSprites.set(template.id, loadSpriteImage(template.imageSrc));
    }
    return brainrotSprites.get(template.id);
  }

  let layout = null;
  let selectedDeleteSlot = null;
  let toastTimer = 0;
  let lastFrameTime = nowMs();
  let booted = false;
  let resizeTimer = 0;
  let lastCanvasWidth = 0;
  let lastCanvasHeight = 0;
  let lastCanvasDpr = 0;
  const optionalBootImages = [];
  let autosaveTimer = 0;
  let debugVisible = false;
  let didValidateSpawn = false;

  const loaded = storage.loadState();
  const game = {
    coins: loaded.coins,
    player: {
      x: loaded.player.x,
      y: loaded.player.y,
      r: 24,
      walkTime: 0,
      isMoving: false,
      moveX: 0,
      moveY: 0,
      spawnHaloAge: 0
    },
    camera: { x: 0, y: 0 },
    slots: loaded.slots,
    conveyorItems: [],
    conveyorNextTemplateIndex: loaded.conveyor.nextTemplateIndex,
    purchaseAnimations: [],
    floatingTexts: [],
    fakePlayers: [],
    fakePlayerNextId: 1,
    fakePlayerSpawnTimer: 0,
    fakePlayerNextSpawnIn: 0,
    fakePlayersInitialized: false,
    layoutVersion: loaded.layoutVersion || null,
    joystick: {
      active: false,
      pointerId: null,
      baseX: 0,
      baseY: 0,
      knobX: 0,
      knobY: 0,
      dx: 0,
      dy: 0,
      radius: 58
    }
  };

  const BOOT_IMAGE_PATHS = [
    'assets/images/boot/splash-landscape.png',
    'assets/images/boot/splash-portrait.png',
    'assets/images/boot/age-rating.png',
    TILE_IMG_PATH,
    PLAYER_ASSET_PATHS.head,
    PLAYER_ASSET_PATHS.body,
    PLAYER_ASSET_PATHS.arm,
    PLAYER_ASSET_PATHS.leg
  ];

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function nowMs() {
    return window.performance && typeof window.performance.now === 'function'
      ? window.performance.now()
      : Date.now();
  }

  function requestNextFrame(callback) {
    const raf = window.requestAnimationFrame || function (cb) {
      return window.setTimeout(function () { cb(nowMs()); }, 16);
    };
    return raf.call(window, callback);
  }

  function getCanvasDprLimit() {
    const ua = navigator.userAgent || '';
    const androidMatch = ua.match(/Android\s+(\d+)/i);
    const androidMajor = androidMatch ? Number(androidMatch[1]) : 0;
    const isOldAndroid = androidMajor > 0 && androidMajor <= 8;
    const memory = Number(navigator.deviceMemory) || 0;
    const cores = Number(navigator.hardwareConcurrency) || 0;
    const isWeakDevice = (memory > 0 && memory <= 2) || (cores > 0 && cores <= 4);
    return isOldAndroid || isWeakDevice ? 1.35 : 2;
  }

  function bootLog(step, data) {
    window.__brainrotBootLog = window.__brainrotBootLog || [];
    window.__brainrotBootLog.push({ step, at: Date.now(), data: data || null });
    if (window.__brainrotBootDebug) console.log('[BrainrotBoot]', step, data || '');
  }

  function setBootProgress(value) {
    const progress = clamp(Number.isFinite(value) ? value : 0, 0, 1);
    if (bootProgressFillEl) bootProgressFillEl.style.width = (progress * 100).toFixed(1) + '%';
    if (bootProgressLabelEl) bootProgressLabelEl.textContent = '加载中 ' + Math.round(progress * 100) + '%';
  }

  function finishBootOverlay() {
    if (!bootOverlayEl) {
      document.documentElement.classList.remove('booting');
      return;
    }
    bootOverlayEl.classList.add('is-hidden');
    document.documentElement.classList.remove('booting');
    window.setTimeout(() => {
      bootOverlayEl.setAttribute('aria-hidden', 'true');
    }, 300);
  }

  function preloadBootImage(src, timeoutMs) {
    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const timer = window.setTimeout(() => {
        console.warn('[BootOverlay] image timeout:', src);
        done('timeout');
      }, timeoutMs || BOOT_IMAGE_TIMEOUT);
      const done = (status) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(status || 'ok');
      };
      img.onload = () => done('ok');
      img.onerror = () => {
        console.warn('[BootOverlay] image failed:', src);
        done('error');
      };
      img.src = src;
      if (img.complete) done('cached');
    });
  }

  function preloadBootImageWithProgress(src, onDone) {
    return preloadBootImage(src, BOOT_IMAGE_TIMEOUT).then((status) => {
      onDone(src, status);
      return status;
    });
  }

  function prewarmNonBlockingImages(paths) {
    Array.from(new Set(paths || [])).forEach((src) => {
      if (!src) return;
      const img = new Image();
      img.onload = function () { img.ready = true; };
      img.onerror = function () { console.warn('[BootOverlay] optional image failed:', src); };
      img.src = src;
      optionalBootImages.push(img);
    });
  }

  async function runBootOverlay() {
    const startedAt = Number(window.__brainrotBootNoticeAt) || Date.now();
    const imagePaths = Array.from(new Set(BOOT_IMAGE_PATHS));
    let loadedCount = 0;
    setBootProgress(0);
    bootLog('boot_preload_start', { count: imagePaths.length, dprLimit: DPR_LIMIT });

    prewarmNonBlockingImages((cfg.brainrots || []).map((brainrot) => brainrot && brainrot.imageSrc).filter(Boolean));

    const preloadAll = Promise.all(imagePaths.map(async (src) => {
      await preloadBootImageWithProgress(src, (path, status) => {
        if (status === 'timeout') bootLog('boot_image_timeout', { src: path });
        if (status === 'error') bootLog('boot_image_error', { src: path });
      });
      loadedCount += 1;
      setBootProgress(loadedCount / imagePaths.length);
    }));

    await Promise.race([
      preloadAll,
      delay(BOOT_TOTAL_TIMEOUT).then(() => {
        bootLog('boot_preload_total_timeout', { loadedCount, count: imagePaths.length });
      })
    ]);

    const elapsed = Date.now() - startedAt;
    const minVisibleTime = Math.max(BOOT_SPLASH_DURATION, MIN_NOTICE_TIME);
    if (elapsed < minVisibleTime) {
      await delay(minVisibleTime - elapsed);
    }

    setBootProgress(1);
    finishBootOverlay();
  }

  function clamp(v, min, max) {
    if (max < min) return min;
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }


  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
  }

  function chance(weight) {
    return Math.random() < weight;
  }

  function money(value) {
    const v = Math.floor(value);
    if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return String(v);
  }

  function getTemplate(templateId) {
    return cfg.brainrots.find((b) => b.id === templateId) || cfg.brainrots[0];
  }

  function getConveyorBrainrotIds() {
    if (Array.isArray(cfg.conveyorBrainrotIds) && cfg.conveyorBrainrotIds.length) {
      return cfg.conveyorBrainrotIds.slice();
    }
    return cfg.brainrots
      .filter((item) => item && item.id && item.id !== cfg.starterTemplateId)
      .map((item) => item.id);
  }

  function getQualityColor(quality) {
    switch (quality) {
      case '传说': return '#ffd86a';
      case '史诗': return '#ff72df';
      case '稀有': return '#5ee7ff';
      default: return '#b6ff64';
    }
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1200);
  }

  function addFloatText(text, x, y, color) {
    game.floatingTexts.push({ text, x, y, color: color || '#fff', life: 0.9, maxLife: 0.9 });
  }

  function getSlotCollectCooldown(slot) {
    return Math.max(0, Number(slot && slot.collectCooldown) || 0);
  }

  function getViewportSize() {
    const doc = document.documentElement || document.body;
    return {
      w: Math.max(1, window.innerWidth || (doc && doc.clientWidth) || canvas.clientWidth || 1),
      h: Math.max(1, window.innerHeight || (doc && doc.clientHeight) || canvas.clientHeight || 1)
    };
  }

  function resize() {
    const viewport = getViewportSize();
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
    const w = viewport.w;
    const h = viewport.h;
    const pixelW = Math.max(1, Math.floor(w * dpr));
    const pixelH = Math.max(1, Math.floor(h * dpr));

    if (pixelW !== lastCanvasWidth || pixelH !== lastCanvasHeight || dpr !== lastCanvasDpr) {
      canvas.width = pixelW;
      canvas.height = pixelH;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      lastCanvasWidth = pixelW;
      lastCanvasHeight = pixelH;
      lastCanvasDpr = dpr;
    }

    if (ctx.setTransform) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      ctx.scale(dpr, dpr);
    }
    computeLayout(w, h);
  }

  function scheduleResize() {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0;
      resize();
    }, RESIZE_DEBOUNCE_MS);
  }

  function computeLayout(w, h) {
    const slots = FIGMA.slots.map((slot, index) => ({
      index,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      cx: slot.x + slot.w / 2,
      cy: slot.y + slot.h / 2,
      itemX: slot.itemX,
      itemY: slot.itemY,
      itemW: 170,
      itemH: 279
    }));

    const wallRects = [
      { x: 256, y: 438, w: 1563, h: 101, name: 'figma-room-top-wall' },
      { x: 256, y: 1269, w: 1563, h: 84, name: 'figma-room-bottom-wall' },
      { x: 256, y: 438, w: 53, h: 915, name: 'figma-room-left-wall' },
      { x: 1716, y: 438, w: 103, h: 311, name: 'figma-room-right-up-wall' },
      { x: 1716, y: 1071, w: 103, h: 282, name: 'figma-room-right-down-wall' }
    ];

    layout = {
      w,
      h,
      scale: 1,
      worldScale: WORLD_CAMERA_ZOOM,
      map: { x: 0, y: 0, w: FIGMA.world.w, h: FIGMA.world.h },
      room: FIGMA.room,
      floor: FIGMA.shopFloor,
      roomCorridor: FIGMA.roomCorridor,
      home: FIGMA.room,
      mid: FIGMA.collection,
      conveyor: FIGMA.conveyor,
      conveyorSlots: FIGMA.conveyorItems.map((r, index) => ({ ...r, index, cx: r.x + r.w / 2, cy: r.y + r.h / 2 })),
      slots,
      walls: wallRects,
      entrance: FIGMA.roomCorridor,
      spawn: FIGMA.playerSpawn,
      joystick: computeHudJoystick(w, h),
      coinHud: computeHudCoin(w, h)
    };

    if (!game.joystick.active) {
      game.joystick.baseX = layout.joystick.x;
      game.joystick.baseY = layout.joystick.y;
      game.joystick.knobX = layout.joystick.x;
      game.joystick.knobY = layout.joystick.y;
      game.joystick.radius = layout.joystick.radius;
    }

    if (!didValidateSpawn) {
      didValidateSpawn = true;
      if (game.layoutVersion !== FIGMA_LAYOUT_VERSION || !isPlayerPositionValid(game.player.x, game.player.y)) {
        placePlayerAtSpawn();
        game.layoutVersion = FIGMA_LAYOUT_VERSION;
        saveNow();
      }
      snapCameraToPlayer();
    } else {
      game.player.x = clamp(game.player.x, game.player.r, layout.map.w - game.player.r);
      game.player.y = clamp(game.player.y, game.player.r, layout.map.h - game.player.r);
      if (collidesWithWalls(game.player.x, game.player.y, game.player.r)) placePlayerAtSpawn();
      snapCameraToPlayer(false);
    }
    rebuildConveyorPositions(false);
  }

  function computeHudJoystick(w, h) {
    const centerX = Math.max(92, FIGMA.hud.joystick.centerX);
    const centerY = Math.min(h - 72, Math.max(96, h - (768 - FIGMA.hud.joystick.centerY)));
    return { x: centerX, y: centerY, radius: FIGMA.hud.joystick.outerW / 2 };
  }

  function computeHudCoin(w, h) {
    const hud = FIGMA.hud.coin;
    return {
      w: hud.w,
      h: hud.h,
      x: Math.max(16, w - hud.w - hud.right),
      y: Math.max(16, h - hud.h - hud.bottom),
      icon: hud.icon
    };
  }

  function placePlayerAtSpawn() {
    game.player.x = layout.spawn.x;
    game.player.y = layout.spawn.y;
    game.player.spawnHaloAge = 0;
  }

  function isPlayerPositionValid(x, y) {
    if (!layout || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const r = game.player.r;
    if (x < r || y < r || x > layout.map.w - r || y > layout.map.h - r) return false;
    return !collidesWithWalls(x, y, r);
  }

  function getCameraViewport() {
    const zoom = layout && layout.worldScale ? layout.worldScale : 1;
    return { w: layout.w / zoom, h: layout.h / zoom };
  }

  function clampCamera(x, y) {
    const view = getCameraViewport();
    return {
      x: clamp(x, 0, Math.max(0, layout.map.w - view.w)),
      y: clamp(y, 0, Math.max(0, layout.map.h - view.h))
    };
  }

  function snapCameraToPlayer(force) {
    if (!layout) return;
    const view = getCameraViewport();
    const target = clampCamera(game.player.x - view.w / 2, game.player.y - view.h / 2);
    if (force === false) {
      const view = getCameraViewport();
      game.camera.x = clamp(game.camera.x, 0, Math.max(0, layout.map.w - view.w));
      game.camera.y = clamp(game.camera.y, 0, Math.max(0, layout.map.h - view.h));
    } else {
      game.camera.x = target.x;
      game.camera.y = target.y;
    }
  }

  function updateCamera(dt) {
    const view = getCameraViewport();
    const target = clampCamera(game.player.x - view.w / 2, game.player.y - view.h / 2);
    const t = 1 - Math.exp(-CAMERA_LERP * dt);
    game.camera.x = lerp(game.camera.x, target.x, t);
    game.camera.y = lerp(game.camera.y, target.y, t);
    const clamped = clampCamera(game.camera.x, game.camera.y);
    game.camera.x = clamped.x;
    game.camera.y = clamped.y;
  }

  function initConveyor() {
    const saved = loaded.conveyor && Array.isArray(loaded.conveyor.items) ? loaded.conveyor.items : [];
    const defaults = [0.086, 0.262, 0.466, 0.655, 0.874];
    if (saved.length) {
      game.conveyorItems = saved.slice(0, cfg.conveyorVisibleCount).map((item, index) => ({
        id: 'cv_' + Date.now() + '_' + index + '_' + Math.random().toString(16).slice(2),
        templateId: item.empty ? null : item.templateId,
        empty: Boolean(item.empty),
        yRatio: Number.isFinite(item.yRatio) ? item.yRatio : defaults[index % defaults.length],
        x: 0,
        y: 0,
        hitSize: 0,
        rect: null
      }));
    }

    if (game.conveyorItems.length < cfg.conveyorVisibleCount) {
      game.conveyorItems = [];
      const conveyorIds = getConveyorBrainrotIds();
      for (let i = 0; i < cfg.conveyorVisibleCount; i += 1) {
        const templateId = conveyorIds.length ? conveyorIds[i % conveyorIds.length] : cfg.brainrots[i % cfg.brainrots.length].id;
        game.conveyorItems.push({
          id: 'cv_' + i,
          templateId,
          empty: false,
          yRatio: defaults[i],
          x: 0,
          y: 0,
          hitSize: 0,
          rect: null
        });
      }
      game.conveyorNextTemplateIndex = conveyorIds.length ? cfg.conveyorVisibleCount % conveyorIds.length : 0;
    }
  }

  function rebuildConveyorPositions() {
    if (!layout || !game.conveyorItems.length) return;
    for (const item of game.conveyorItems) positionConveyorItem(item);
  }

  function positionConveyorItem(item) {
    const conv = layout.conveyor;
    const y = conv.y + item.yRatio * conv.h;
    const anchors = layout.conveyorSlots;
    let x = anchors[0].x;
    const centerY = y;
    if (centerY <= anchors[0].cy) {
      x = anchors[0].x;
    } else if (centerY >= anchors[anchors.length - 1].cy) {
      x = anchors[anchors.length - 1].x;
    } else {
      for (let i = 0; i < anchors.length - 1; i += 1) {
        const a = anchors[i];
        const b = anchors[i + 1];
        if (centerY >= a.cy && centerY <= b.cy) {
          const t = (centerY - a.cy) / Math.max(1, b.cy - a.cy);
          x = lerp(a.x, b.x, t);
          break;
        }
      }
    }
    item.x = x + 85;
    item.y = y;
    item.hitSize = 170;
    item.rect = { x, y: y - 139.5, w: 170, h: 279 };
  }

  function takeNextTemplateId() {
    const conveyorIds = getConveyorBrainrotIds();
    if (!conveyorIds.length) return cfg.brainrots[0].id;
    const id = conveyorIds[game.conveyorNextTemplateIndex % conveyorIds.length];
    game.conveyorNextTemplateIndex = (game.conveyorNextTemplateIndex + 1) % conveyorIds.length;
    return id;
  }

  function findFirstAvailableSlot() {
    for (const slot of game.slots) {
      if (!slot.reserved && !slot.templateId) return slot;
    }
    return null;
  }

  function purchaseConveyorItem(item) {
    if (!item || item.empty || !item.templateId) return;
    const template = getTemplate(item.templateId);
    const targetSlot = findFirstAvailableSlot();
    if (!targetSlot) {
      showToast('格子已满');
      addFloatText('格子已满', item.x, item.y - 18, '#ff668a');
      return;
    }
    if (game.coins < template.price) {
      showToast('金币不足，无法购买');
      addFloatText('金币不足', item.x, item.y - 18, '#ff668a');
      return;
    }

    game.coins -= template.price;
    targetSlot.reserved = true;
    targetSlot.templateId = null;

    const to = { x: layout.mid.x + layout.mid.w / 2, y: layout.mid.y + layout.mid.h / 2 };
    game.purchaseAnimations.push({
      templateId: template.id,
      slotIndex: targetSlot.index,
      fromX: item.x,
      fromY: item.y,
      toX: to.x,
      toY: to.y,
      t: 0,
      duration: cfg.purchaseAnimDuration
    });

    item.empty = true;
    item.templateId = null;
    showToast('购买成功：' + template.name);
    addFloatText('-' + money(template.price), item.x, item.y - 22, '#ffdf5e');
    saveNow();
  }

  function completePurchaseAnimation(anim) {
    const slot = game.slots[anim.slotIndex];
    if (!slot) return;
    slot.reserved = false;
    slot.templateId = anim.templateId;
    slot.collectCooldown = 0;
    const rect = layout.slots[anim.slotIndex];
    addFloatText('入库！', rect.cx, rect.cy - 16, '#7effb2');
    saveNow();
  }

  function update(dt) {
    updatePlayer(dt);
    updateFakePlayers(dt);
    updateCamera(dt);
    updateConveyor(dt);
    updateProduction(dt);
    updateCollectionCooldowns(dt);
    updateCollection();
    updateAnimations(dt);
    updateFloatingTexts(dt);
    autosaveTimer += dt;
    if (autosaveTimer >= cfg.autosaveInterval) {
      autosaveTimer = 0;
      saveNow();
    }
  }

  function updatePlayer(dt) {
    game.player.spawnHaloAge = Math.min(PLAYER_SPAWN_HALO_VISIBLE_SECONDS + PLAYER_SPAWN_HALO_FADE_SECONDS + 1, game.player.spawnHaloAge + dt);

    let dx = game.joystick.dx;
    let dy = game.joystick.dy;
    if (keyState.has('arrowleft') || keyState.has('a')) dx -= 1;
    if (keyState.has('arrowright') || keyState.has('d')) dx += 1;
    if (keyState.has('arrowup') || keyState.has('w')) dy -= 1;
    if (keyState.has('arrowdown') || keyState.has('s')) dy += 1;

    const inputLen = Math.hypot(dx, dy);
    if (inputLen > 1) {
      dx /= inputLen;
      dy /= inputLen;
    }

    const isMoving = Math.hypot(dx, dy) > 0.02;
    game.player.isMoving = isMoving;
    game.player.moveX = isMoving ? dx : 0;
    game.player.moveY = isMoving ? dy : 0;
    if (isMoving) {
      game.player.walkTime += dt * PLAYER_WALK_SPEED;
    } else {
      // 站立时保持静止，不做呼吸 / idle 动画。
      game.player.walkTime = 0;
    }

    const speed = cfg.playerSpeed * dt;
    tryMovePlayer(dx * speed, 0);
    tryMovePlayer(0, dy * speed);
  }

  function tryMovePlayer(dx, dy) {
    if (!layout || (dx === 0 && dy === 0)) return;
    const r = game.player.r;
    const nextX = clamp(game.player.x + dx, r, layout.map.w - r);
    const nextY = clamp(game.player.y + dy, r, layout.map.h - r);
    if (!collidesWithWalls(nextX, nextY, r)) {
      game.player.x = nextX;
      game.player.y = nextY;
    }
  }

  function collidesWithWalls(x, y, radius) {
    if (!layout) return false;
    return layout.walls.some((rect) => circleRectOverlap(x, y, radius, rect));
  }

  function circleRectOverlap(cx, cy, r, rect) {
    const nearestX = clamp(cx, rect.x, rect.x + rect.w);
    const nearestY = clamp(cy, rect.y, rect.y + rect.h);
    return Math.hypot(cx - nearestX, cy - nearestY) < r;
  }

  function updateFakePlayers(dt) {
    if (!layout) return;
    if (!game.fakePlayersInitialized) {
      game.fakePlayersInitialized = true;
      game.fakePlayerSpawnTimer = 0;
      game.fakePlayerNextSpawnIn = randomRange(FAKE_PLAYER_CONFIG.firstSpawnDelayMin, FAKE_PLAYER_CONFIG.firstSpawnDelayMax);
    }

    game.fakePlayerSpawnTimer += dt;
    if (game.fakePlayerSpawnTimer >= game.fakePlayerNextSpawnIn) {
      game.fakePlayerSpawnTimer = 0;
      if (game.fakePlayers.length < FAKE_PLAYER_CONFIG.maxCount) spawnFakePlayer();
      game.fakePlayerNextSpawnIn = randomRange(FAKE_PLAYER_CONFIG.spawnIntervalMin, FAKE_PLAYER_CONFIG.spawnIntervalMax);
    }

    for (let i = game.fakePlayers.length - 1; i >= 0; i -= 1) {
      const fake = game.fakePlayers[i];
      updateFakePlayer(fake, dt);
      if (fake.state === 'removed') game.fakePlayers.splice(i, 1);
    }
  }

  function spawnFakePlayer() {
    if (!layout || game.fakePlayers.length >= FAKE_PLAYER_CONFIG.maxCount) return;
    const spawn = getRandomFakeSpawnPoint();
    const id = game.fakePlayerNextId++;
    const fake = {
      id,
      name: '玩家' + id,
      x: spawn.point.x,
      y: spawn.point.y,
      r: game.player.r,
      walkTime: 0,
      isMoving: false,
      moveX: 0,
      moveY: 0,
      age: 0,
      lifeSeconds: randomRange(FAKE_PLAYER_CONFIG.lifeSecondsMin, FAKE_PLAYER_CONFIG.lifeSecondsMax),
      state: 'spawnPause',
      stateTime: 0,
      targetX: spawn.point.x,
      targetY: spawn.point.y,
      path: [],
      slotVisitsLeft: 0,
      wanderStepsLeft: 0,
      lastSlotIndex: -1,
      lastMajorBehavior: null,
      majorBehavior: null,
      spawnAreaId: spawn.area.id,
      spawnArea: spawn.area,
      interestX: spawn.point.x,
      interestY: spawn.point.y,
      actionKind: 'pause',
      actionDuration: randomRange(FAKE_PLAYER_CONFIG.spawnPauseMin, FAKE_PLAYER_CONFIG.spawnPauseMax),
      actionElapsed: 0,
      orbitAngle: randomRange(0, Math.PI * 2),
      orbitRadius: randomRange(FAKE_PLAYER_CONFIG.orbitRadiusMin, FAKE_PLAYER_CONFIG.orbitRadiusMax),
      orbitDir: chance(0.5) ? 1 : -1,
      orbitSpeed: randomRange(1.45, 2.25),
      paceAxis: chance(0.5) ? 1 : -1,
      localTargetTimer: 0,
      exitTimer: 0,
      postConveyorNext: null
    };
    game.fakePlayers.push(fake);
  }

  function updateFakePlayer(fake, dt) {
    fake.age += dt;
    fake.stateTime += dt;

    if (fake.age >= fake.lifeSeconds && fake.state !== 'exit' && fake.state !== 'removed') {
      startFakeExit(fake);
    }

    switch (fake.state) {
      case 'spawnPause':
        updateFakeSpawnPause(fake, dt);
        break;
      case 'moveSlot':
        updateFakeMoveToSlot(fake, dt);
        break;
      case 'slotAction':
        updateFakeSlotAction(fake, dt);
        break;
      case 'wander':
        updateFakeWander(fake, dt);
        break;
      case 'moveConveyor':
        updateFakeMoveToConveyor(fake, dt);
        break;
      case 'conveyorAction':
        updateFakeConveyorAction(fake, dt);
        break;
      case 'moveCollect':
        updateFakeMoveToCollect(fake, dt);
        break;
      case 'collectAction':
        updateFakeCollectAction(fake, dt);
        break;
      case 'pause':
        updateFakePause(fake, dt);
        break;
      case 'exit':
        updateFakeExit(fake, dt);
        break;
      case 'choose':
      default:
        chooseFakeBehavior(fake);
        break;
    }
  }


  function updateFakeSpawnPause(fake, dt) {
    fake.actionElapsed += dt;
    fake.isMoving = false;
    fake.walkTime = 0;
    fake.path = [];
    if (fake.actionElapsed >= fake.actionDuration) {
      fake.state = 'choose';
      fake.stateTime = 0;
      fake.actionElapsed = 0;
    }
  }

  function startFakeExit(fake) {
    const point = getFakeExitPoint(fake);
    fake.state = 'exit';
    fake.stateTime = 0;
    fake.exitTimer = 0;
    setFakePath(fake, buildFakeRoute(fake, point));
  }

  function updateFakeExit(fake, dt) {
    fake.exitTimer += dt;
    const arrived = moveFakeAlongPath(fake, dt, FAKE_PLAYER_CONFIG.arriveDistance);
    if (arrived || fake.exitTimer >= FAKE_PLAYER_CONFIG.exitTimeout) {
      fake.state = 'removed';
      fake.isMoving = false;
      fake.path = [];
    }
  }

  function chooseFakeBehavior(fake) {
    if (fake.age >= fake.lifeSeconds) return startFakeExit(fake);
    const behavior = pickFakeMajorBehavior(fake.lastMajorBehavior);
    fake.lastMajorBehavior = behavior;
    fake.majorBehavior = behavior;
    if (behavior === 'wander') return startFakeWander(fake);
    if (behavior === 'buyBrainrot') return startFakeConveyorTrip(fake);
    if (behavior === 'fakeCollectMoney') return startFakeCollectMoney(fake);
    return startSlotTour(fake, randomInt(FAKE_PLAYER_CONFIG.slotTourMin, FAKE_PLAYER_CONFIG.slotTourMax));
  }

  function pickFakeMajorBehavior(previous) {
    const weights = FAKE_PLAYER_CONFIG.behaviorWeights;
    const entries = Object.keys(weights)
      .filter((key) => key !== previous || Object.keys(weights).length <= 1)
      .map((key) => ({ key, weight: Math.max(0, Number(weights[key]) || 0) }))
      .filter((entry) => entry.weight > 0);
    const pool = entries.length ? entries : Object.keys(weights).map((key) => ({ key, weight: Math.max(1, Number(weights[key]) || 1) }));
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) return entry.key;
    }
    return pool[pool.length - 1].key;
  }

  function startSlotTour(fake, visits) {
    fake.state = 'moveSlot';
    fake.stateTime = 0;
    fake.slotVisitsLeft = Math.max(1, visits || randomInt(FAKE_PLAYER_CONFIG.slotTourMin, FAKE_PLAYER_CONFIG.slotTourMax));
    pickNextFakeSlotTarget(fake);
  }

  function pickNextFakeSlotTarget(fake) {
    const point = getRandomSlotInterestPoint(fake.lastSlotIndex);
    fake.lastSlotIndex = point.index;
    fake.interestX = point.interestX;
    fake.interestY = point.interestY;
    fake.targetX = point.x;
    fake.targetY = point.y;
    fake.state = 'moveSlot';
    fake.stateTime = 0;
    setFakePath(fake, buildFakeRoute(fake, point));
  }

  function updateFakeMoveToSlot(fake, dt) {
    const arrived = moveFakeAlongPath(fake, dt, FAKE_PLAYER_CONFIG.interestArriveDistance);
    if (arrived || fake.stateTime >= 8) startFakeSlotAction(fake);
  }

  function startFakeSlotAction(fake) {
    fake.state = 'slotAction';
    fake.stateTime = 0;
    fake.actionElapsed = 0;
    fake.actionDuration = randomRange(FAKE_PLAYER_CONFIG.slotActionMin, FAKE_PLAYER_CONFIG.slotActionMax);
    const roll = Math.random();
    fake.actionKind = roll < 0.44 ? 'orbit' : roll < 0.78 ? 'pace' : roll < 0.92 ? 'localWander' : 'pause';
    fake.orbitAngle = randomRange(0, Math.PI * 2);
    fake.orbitRadius = randomRange(FAKE_PLAYER_CONFIG.orbitRadiusMin, FAKE_PLAYER_CONFIG.orbitRadiusMax);
    fake.orbitDir = chance(0.5) ? 1 : -1;
    fake.orbitSpeed = randomRange(1.45, 2.25);
    fake.paceAxis = chance(0.5) ? 1 : -1;
    fake.localTargetTimer = 0;
  }

  function updateFakeSlotAction(fake, dt) {
    fake.actionElapsed += dt;
    updateFakeLocalAction(fake, dt, fake.interestX, fake.interestY);
    if (fake.actionElapsed >= fake.actionDuration) {
      fake.slotVisitsLeft -= 1;
      if (fake.slotVisitsLeft > 0) {
        pickNextFakeSlotTarget(fake);
      } else {
        fake.state = 'choose';
        fake.stateTime = 0;
      }
    }
  }

  function startFakeConveyorTrip(fake) {
    const point = getRandomConveyorInterestPoint();
    fake.state = 'moveConveyor';
    fake.stateTime = 0;
    fake.interestX = point.interestX;
    fake.interestY = point.interestY;
    fake.targetX = point.x;
    fake.targetY = point.y;
    fake.postConveyorNext = chance(0.58) ? 'slot' : 'wander';
    setFakePath(fake, buildFakeRoute(fake, point));
  }

  function updateFakeMoveToConveyor(fake, dt) {
    const arrived = moveFakeAlongPath(fake, dt, FAKE_PLAYER_CONFIG.interestArriveDistance);
    if (arrived || fake.stateTime >= 10) startFakeConveyorAction(fake);
  }

  function startFakeConveyorAction(fake) {
    fake.state = 'conveyorAction';
    fake.stateTime = 0;
    fake.actionElapsed = 0;
    fake.actionDuration = randomRange(FAKE_PLAYER_CONFIG.conveyorActionMin, FAKE_PLAYER_CONFIG.conveyorActionMax);
    fake.actionKind = chance(0.55) ? 'pause' : 'pace';
    fake.orbitRadius = randomRange(28, 48);
    fake.paceAxis = chance(0.5) ? 1 : -1;
  }

  function updateFakeConveyorAction(fake, dt) {
    fake.actionElapsed += dt;
    updateFakeLocalAction(fake, dt, fake.interestX, fake.interestY);
    if (fake.actionElapsed >= fake.actionDuration) {
      if (fake.postConveyorNext === 'slot') {
        startSlotTour(fake, 1);
      } else {
        startFakeWander(fake);
      }
    }
  }

  function startFakeCollectMoney(fake) {
    const point = getRandomCollectInterestPoint();
    fake.state = 'moveCollect';
    fake.stateTime = 0;
    fake.interestX = point.interestX;
    fake.interestY = point.interestY;
    fake.targetX = point.x;
    fake.targetY = point.y;
    setFakePath(fake, buildFakeRoute(fake, point));
  }

  function updateFakeMoveToCollect(fake, dt) {
    const arrived = moveFakeAlongPath(fake, dt, FAKE_PLAYER_CONFIG.interestArriveDistance);
    if (arrived || fake.stateTime >= 8) startFakeCollectAction(fake);
  }

  function startFakeCollectAction(fake) {
    fake.state = 'collectAction';
    fake.stateTime = 0;
    fake.actionElapsed = 0;
    fake.actionDuration = randomRange(FAKE_PLAYER_CONFIG.collectActionMin, FAKE_PLAYER_CONFIG.collectActionMax);
    fake.actionKind = chance(0.62) ? 'pause' : 'pace';
    fake.orbitRadius = randomRange(24, 42);
    fake.paceAxis = chance(0.5) ? 1 : -1;
  }

  function updateFakeCollectAction(fake, dt) {
    fake.actionElapsed += dt;
    updateFakeLocalAction(fake, dt, fake.interestX, fake.interestY);
    if (fake.actionElapsed >= fake.actionDuration) {
      fake.state = 'choose';
      fake.stateTime = 0;
    }
  }

  function startFakeWander(fake) {
    const point = getRandomWalkPoint();
    fake.state = 'wander';
    fake.stateTime = 0;
    fake.wanderStepsLeft = randomInt(FAKE_PLAYER_CONFIG.wanderStepsMin, FAKE_PLAYER_CONFIG.wanderStepsMax);
    fake.targetX = point.x;
    fake.targetY = point.y;
    setFakePath(fake, buildFakeRoute(fake, point));
  }

  function updateFakeWander(fake, dt) {
    const arrived = moveFakeAlongPath(fake, dt, FAKE_PLAYER_CONFIG.arriveDistance);
    if (arrived || fake.stateTime >= 7) {
      fake.wanderStepsLeft -= 1;
      if (fake.wanderStepsLeft > 0) {
        const point = getRandomWalkPoint();
        fake.stateTime = 0;
        fake.targetX = point.x;
        fake.targetY = point.y;
        setFakePath(fake, buildFakeRoute(fake, point));
      } else {
        startFakePause(fake, randomRange(FAKE_PLAYER_CONFIG.wanderPauseMin, FAKE_PLAYER_CONFIG.wanderPauseMax));
      }
    }
  }

  function startFakePause(fake, duration) {
    fake.state = 'pause';
    fake.stateTime = 0;
    fake.actionDuration = duration || randomRange(FAKE_PLAYER_CONFIG.pauseMin, FAKE_PLAYER_CONFIG.pauseMax);
    fake.actionElapsed = 0;
    fake.isMoving = false;
    fake.walkTime = 0;
    fake.path = [];
  }

  function updateFakePause(fake, dt) {
    fake.actionElapsed += dt;
    fake.isMoving = false;
    fake.walkTime = 0;
    if (fake.actionElapsed >= fake.actionDuration) {
      fake.state = 'choose';
      fake.stateTime = 0;
    }
  }

  function updateFakeLocalAction(fake, dt, centerX, centerY) {
    if (fake.actionKind === 'pause') {
      fake.isMoving = false;
      fake.walkTime = 0;
      return;
    }

    let targetX = centerX;
    let targetY = centerY;

    if (fake.actionKind === 'orbit') {
      fake.orbitAngle += fake.orbitDir * dt * fake.orbitSpeed;
      targetX = centerX + Math.cos(fake.orbitAngle) * fake.orbitRadius;
      targetY = centerY + Math.sin(fake.orbitAngle) * fake.orbitRadius * 0.62;
    } else if (fake.actionKind === 'pace') {
      const t = fake.actionDuration > 0 ? fake.actionElapsed / fake.actionDuration : 0;
      const wave = Math.sin(t * Math.PI * 2.25);
      targetX = centerX + wave * fake.orbitRadius * fake.paceAxis;
      targetY = centerY + Math.cos(t * Math.PI * 1.5) * 14;
    } else {
      fake.localTargetTimer -= dt;
      if (fake.localTargetTimer <= 0) {
        fake.localTargetTimer = randomRange(0.65, 1.15);
        const p = findNearbyValidPoint(centerX, centerY, Math.max(18, fake.orbitRadius * 0.35), fake.orbitRadius);
        fake.localX = p.x;
        fake.localY = p.y;
      }
      targetX = fake.localX || centerX;
      targetY = fake.localY || centerY;
    }

    if (!isActorPositionValid(targetX, targetY, fake.r)) {
      const fallback = findNearbyValidPoint(centerX, centerY, 24, Math.max(42, fake.orbitRadius));
      targetX = fallback.x;
      targetY = fallback.y;
    }
    moveFakeToward(fake, targetX, targetY, dt, FAKE_PLAYER_CONFIG.localArriveDistance);
  }

  function setFakePath(fake, points) {
    fake.path = (Array.isArray(points) ? points : [])
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ x: p.x, y: p.y }));
    if (!fake.path.length) fake.path = [{ x: fake.targetX, y: fake.targetY }];
  }

  function moveFakeAlongPath(fake, dt, arriveDistance) {
    if (!fake.path || !fake.path.length) return true;
    const target = fake.path[0];
    const arrived = moveFakeToward(fake, target.x, target.y, dt, arriveDistance);
    if (arrived) fake.path.shift();
    return !fake.path.length;
  }

  function buildFakeRoute(fake, finalPoint) {
    const final = { x: finalPoint.x, y: finalPoint.y };
    const points = [];
    const corridor = getEntrancePoint(10);
    const goingAcrossRightWall = final.x > layout.room.x + layout.room.w + 80 || fake.x > layout.room.x + layout.room.w + 80;
    if (goingAcrossRightWall) points.push(corridor);
    points.push(final);
    return points;
  }

  function moveFakeToward(fake, targetX, targetY, dt, arriveDistance) {
    const safeArriveDistance = Math.max(4, Number(arriveDistance) || FAKE_PLAYER_CONFIG.arriveDistance);
    const dx = targetX - fake.x;
    const dy = targetY - fake.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= safeArriveDistance) {
      fake.isMoving = false;
      fake.moveX = 0;
      fake.moveY = 0;
      return true;
    }
    const nx = dx / Math.max(0.0001, dist);
    const ny = dy / Math.max(0.0001, dist);
    const speed = cfg.playerSpeed * dt;
    const step = Math.min(speed, Math.max(0, dist - safeArriveDistance * 0.55));
    if (step <= 0.01) {
      fake.isMoving = false;
      fake.moveX = 0;
      fake.moveY = 0;
      return true;
    }
    fake.isMoving = true;
    fake.moveX = nx;
    fake.moveY = ny;
    fake.walkTime += dt * PLAYER_WALK_SPEED;
    const beforeX = fake.x;
    const beforeY = fake.y;
    tryMoveFake(fake, nx * step, 0);
    tryMoveFake(fake, 0, ny * step);
    if (Math.hypot(fake.x - beforeX, fake.y - beforeY) < 0.05 && dist <= safeArriveDistance + 20) {
      return true;
    }
    return Math.hypot(targetX - fake.x, targetY - fake.y) <= safeArriveDistance;
  }

  function tryMoveFake(fake, dx, dy) {
    if (!layout || (dx === 0 && dy === 0)) return;
    const r = fake.r;
    const nextX = clamp(fake.x + dx, r, layout.map.w - r);
    const nextY = clamp(fake.y + dy, r, layout.map.h - r);
    if (!collidesWithWalls(nextX, nextY, r)) {
      fake.x = nextX;
      fake.y = nextY;
    }
  }

  function getEntrancePoint(jitter) {
    const entrance = layout && layout.entrance ? layout.entrance : FIGMA.roomCorridor;
    const base = { x: entrance.x + entrance.w / 2, y: entrance.y + entrance.h / 2 };
    const spread = Math.max(0, Number(jitter) || 0);
    for (let i = 0; i < 12; i += 1) {
      const p = {
        x: base.x + randomRange(-spread, spread),
        y: base.y + randomRange(-spread, spread)
      };
      if (isActorPositionValid(p.x, p.y, game.player.r)) return p;
    }
    return base;
  }

  function getFakeSpawnAreas() {
    const floor = layout && layout.floor ? layout.floor : FIGMA.shopFloor;
    const entrance = layout && layout.entrance ? layout.entrance : FIGMA.roomCorridor;
    return [
      { id: 'entrance', x: entrance.x + 10, y: entrance.y + 34, w: Math.max(24, entrance.w - 20), h: Math.max(24, entrance.h - 68) },
      { id: 'left', x: floor.x + 70, y: floor.y + 180, w: 180, h: Math.max(80, floor.h - 360) },
      { id: 'top', x: floor.x + 330, y: floor.y + 70, w: Math.max(180, floor.w - 660), h: 150 },
      { id: 'bottom', x: floor.x + 330, y: floor.y + floor.h - 220, w: Math.max(180, floor.w - 660), h: 150 }
    ];
  }

  function getRandomFakeSpawnPoint() {
    const areas = getFakeSpawnAreas();
    const area = areas[randomInt(0, areas.length - 1)] || areas[0];
    const point = getRandomPointInArea(area, FAKE_PLAYER_CONFIG.spawnAreaJitter) || getEntrancePoint(FAKE_PLAYER_CONFIG.spawnAreaJitter);
    return { area, point };
  }

  function getFakeExitPoint(fake) {
    const area = fake && fake.spawnArea ? fake.spawnArea : getFakeSpawnAreas()[0];
    return getRandomPointInArea(area, FAKE_PLAYER_CONFIG.spawnAreaJitter) || getEntrancePoint(FAKE_PLAYER_CONFIG.spawnAreaJitter);
  }

  function getRandomPointInArea(area, edgePadding) {
    const wantedPad = Math.max(0, Number(edgePadding) || 0);
    const pad = Math.min(wantedPad, Math.max(0, area.w * 0.45), Math.max(0, area.h * 0.45));
    for (let i = 0; i < 24; i += 1) {
      const p = {
        x: randomRange(area.x + pad, area.x + area.w - pad),
        y: randomRange(area.y + pad, area.y + area.h - pad)
      };
      if (isActorPositionValid(p.x, p.y, game.player.r)) return p;
    }
    const center = { x: area.x + area.w / 2, y: area.y + area.h / 2 };
    return isActorPositionValid(center.x, center.y, game.player.r) ? center : null;
  }

  function getRandomSlotInterestPoint(previousIndex) {
    if (!layout || !layout.slots.length) return { index: -1, x: game.player.x, y: game.player.y, interestX: game.player.x, interestY: game.player.y };
    let index = randomInt(0, layout.slots.length - 1);
    if (layout.slots.length > 1 && index === previousIndex) {
      index = (index + randomInt(1, layout.slots.length - 1)) % layout.slots.length;
    }
    const slot = layout.slots[index];
    const interestX = slot.cx;
    const interestY = slot.cy;
    const point = findNearbyValidPoint(interestX, interestY, 78, 132);
    return { index, x: point.x, y: point.y, interestX, interestY };
  }

  function getRandomConveyorInterestPoint() {
    const conv = layout && layout.conveyor ? layout.conveyor : FIGMA.conveyor;
    const anchors = layout && layout.conveyorSlots && layout.conveyorSlots.length ? layout.conveyorSlots : FIGMA.conveyorItems;
    const anchor = anchors[randomInt(0, anchors.length - 1)] || { x: conv.x, y: conv.y, w: conv.w, h: conv.h, cx: conv.x + conv.w / 2, cy: conv.y + conv.h / 2 };
    const interestX = (anchor.cx || (anchor.x + anchor.w / 2));
    const interestY = randomRange(Math.max(conv.y + 80, anchor.y || conv.y), Math.min(conv.y + conv.h - 80, (anchor.y || conv.y) + (anchor.h || 240)));
    const standX = conv.x + randomRange(34, Math.max(48, conv.w - 34));
    const point = findNearbyValidPoint(standX, interestY, 20, 72);
    return { index: -1, x: point.x, y: point.y, interestX, interestY };
  }

  function getRandomCollectInterestPoint() {
    if (layout && layout.collection && chance(0.45)) {
      const area = layout.collection;
      const point = getRandomPointInArea({ id: 'collection', x: area.x + 18, y: area.y + 24, w: area.w - 36, h: area.h - 48 }, 18);
      if (point) return { index: -1, x: point.x, y: point.y, interestX: area.x + area.w / 2, interestY: area.y + area.h / 2 };
    }
    return getRandomSlotInterestPoint(-1);
  }

  function findNearbyValidPoint(cx, cy, minRadius, maxRadius) {
    for (let i = 0; i < 28; i += 1) {
      const angle = randomRange(0, Math.PI * 2);
      const radius = randomRange(minRadius, maxRadius);
      const p = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * 0.65 };
      if (isActorPositionValid(p.x, p.y, game.player.r)) return p;
    }
    return isActorPositionValid(cx, cy, game.player.r) ? { x: cx, y: cy } : getRandomWalkPoint();
  }

  function getRandomWalkPoint() {
    const zones = [layout.floor, layout.roomCorridor, layout.collection, layout.conveyor].filter(Boolean);
    for (let i = 0; i < 32; i += 1) {
      const zone = zones[randomInt(0, zones.length - 1)];
      const p = {
        x: randomRange(zone.x + 48, zone.x + zone.w - 48),
        y: randomRange(zone.y + 48, zone.y + zone.h - 48)
      };
      if (isActorPositionValid(p.x, p.y, game.player.r)) return p;
    }
    return getEntrancePoint(0);
  }

  function isActorPositionValid(x, y, r) {
    if (!layout || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < r || y < r || x > layout.map.w - r || y > layout.map.h - r) return false;
    return !collidesWithWalls(x, y, r);
  }

  function updateConveyor(dt) {
    const conv = layout.conveyor;
    const ratioSpeed = cfg.conveyorSpeed * dt / conv.h;
    for (const item of game.conveyorItems) {
      item.yRatio += ratioSpeed;
      if (item.yRatio > 1.08) {
        const minY = game.conveyorItems.reduce((m, it) => Math.min(m, it.yRatio), 1);
        item.yRatio = minY - 0.18;
        item.empty = false;
        item.templateId = takeNextTemplateId();
        item.id = 'cv_' + nowMs() + '_' + Math.random().toString(16).slice(2);
      }
      positionConveyorItem(item);
    }
  }

  function updateProduction(dt) {
    for (const slot of game.slots) {
      if (!slot.templateId) continue;
      const template = getTemplate(slot.templateId);
      slot.coins += template.incomePerSecond * dt;
    }
  }

  function updateCollectionCooldowns(dt) {
    for (const slot of game.slots) {
      if (!slot) continue;
      if (!slot.templateId) {
        slot.collectCooldown = 0;
        continue;
      }
      if (slot.collectCooldown > 0) {
        slot.collectCooldown = Math.max(0, slot.collectCooldown - dt);
      }
    }
  }

  function updateCollection() {
    let total = 0;
    for (let i = 0; i < game.slots.length; i += 1) {
      const slot = game.slots[i];
      if (!slot || slot.coins <= 0.01) continue;
      if (slot.templateId && getSlotCollectCooldown(slot) > 0) continue;
      const rect = layout.slots[i];
      const d = Math.hypot(game.player.x - rect.cx, game.player.y - rect.cy);
      if (d <= cfg.collectRadius) {
        const gained = Math.floor(slot.coins);
        if (gained > 0) {
          game.coins += gained;
          total += gained;
          addFloatText('+' + money(gained), rect.cx, rect.cy - 24, '#22ff66');
          if (slot.templateId) slot.collectCooldown = SLOT_COLLECT_COOLDOWN_SECONDS;
        }
        slot.coins = 0;
      }
    }
    if (total > 0) saveNow();
  }

  function updateAnimations(dt) {
    for (let i = game.purchaseAnimations.length - 1; i >= 0; i -= 1) {
      const anim = game.purchaseAnimations[i];
      anim.t += dt;
      if (anim.t >= anim.duration) {
        completePurchaseAnimation(anim);
        game.purchaseAnimations.splice(i, 1);
      }
    }
  }

  function updateFloatingTexts(dt) {
    for (let i = game.floatingTexts.length - 1; i >= 0; i -= 1) {
      const f = game.floatingTexts[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) game.floatingTexts.splice(i, 1);
    }
  }

  function draw() {
    const w = layout.w;
    const h = layout.h;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(layout.worldScale, layout.worldScale);
    ctx.translate(-game.camera.x, -game.camera.y);
    drawWorldBackground();
    drawHomeBase();
    drawMidArea();
    drawPurchaseHint();
    drawConveyor();
    drawSlots();
    drawPurchaseAnimations();
    drawActors();
    drawFloatingTexts();
    ctx.restore();
    drawHud();
    if (debugVisible) drawDebug();
  }

  function drawWorldBackground() {
    const map = layout.map;
    drawTiledRect(0, 0, map.w, map.h, '#6bcc3d', 'rgba(107,204,61,0.03)', 0.90);
  }


  function drawHomeBase() {
    const room = layout.room;
    // Figma 房间墙体底图：只画房间边界本体，不再自创绿色粗墙或网格线。
    ctx.save();
    ctx.fillStyle = '#4b514c';
    ctx.fillRect(room.x, room.y, room.w, room.h);
    ctx.restore();

    // Figma: Shop floor / 灰色商店地面 tile fill - 256px tiled
    drawTiledRect(layout.floor.x, layout.floor.y, layout.floor.w, layout.floor.h, '#787d78', 'rgba(120,125,120,0.05)', 0.90);
    drawTiledRect(layout.roomCorridor.x, layout.roomCorridor.y, layout.roomCorridor.w, layout.roomCorridor.h, '#787d78', 'rgba(120,125,120,0.05)', 0.90);

    // 仅用 Figma 房间墙体对应的边界区域作为视觉，不增加额外装饰元素。
    ctx.save();
    ctx.fillStyle = '#4b514c';
    for (const wall of layout.walls) ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.restore();
  }


  function drawSlots() {
    for (let i = 0; i < layout.slots.length; i += 1) {
      const rect = layout.slots[i];
      const slot = game.slots[i];
      drawBrainrotSlot(rect, slot);
      if (slot.templateId) {
        const template = getTemplate(slot.templateId);
        drawShopItemCard(template, rect.itemX, rect.itemY, rect.itemW, rect.itemH, {
          mode: 'home',
          price: template.price,
          dim: false
        });
      } else if (slot.reserved) {
        drawReservedSlot(rect);
      }
    }
  }


  function drawMidArea() {
    const m = layout.mid;
    drawTiledRect(m.x, m.y, m.w, m.h, '#b8ff80', 'rgba(184,255,128,0.10)', 0.90);
    drawFigmaText('收集区域', m.x + m.w / 2, m.y + m.h / 2 + 16, 40, '#ffffff', 'center', '700');
  }

  function drawPurchaseHint() {
    const m = layout.mid;
    const conv = layout.conveyor;
    const gapLeft = m.x + m.w;
    const gapRight = conv.x;
    if (gapRight - gapLeft < 80) return;
    drawFigmaText('点击脑腐购买 >>', (gapLeft + gapRight) / 2, m.y + m.h / 2 + 14, 34, '#ffffff', 'center', '700');
  }


  function drawConveyor() {
    const conv = layout.conveyor;
    ctx.save();
    ctx.fillStyle = '#ff809f';
    ctx.fillRect(conv.x, conv.y, conv.w, conv.h);
    ctx.restore();

    const sorted = [...game.conveyorItems].sort((a, b) => a.y - b.y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(conv.x, conv.y, conv.w, conv.h);
    ctx.clip();
    for (const item of sorted) {
      if (!item.rect) continue;
      if (item.rect.y > conv.y + conv.h || item.rect.y + item.rect.h < conv.y) continue;
      if (item.empty || !item.templateId) continue; // 空位只露出传送带背景，不画占位卡片。
      const template = getTemplate(item.templateId);
      drawShopItemCard(template, item.rect.x, item.rect.y, item.rect.w, item.rect.h, {
        mode: 'conveyor',
        price: template.price,
        dim: false
      });
    }
    ctx.restore();
  }


  function drawPurchaseAnimations() {
    for (const anim of game.purchaseAnimations) {
      const template = getTemplate(anim.templateId);
      const t = clamp(anim.t / anim.duration, 0, 1);
      const e = easeOutCubic(t);
      const x = lerp(anim.fromX, anim.toX, e);
      const y = lerp(anim.fromY, anim.toY, e) - Math.sin(t * Math.PI) * 40;
      drawBrainrot(template, x, y, 42 + Math.sin(t * Math.PI) * 8, true);
    }
  }


  function getPlayerSpawnHaloAlpha(age) {
    const safeAge = Math.max(0, Number(age) || 0);
    if (safeAge <= PLAYER_SPAWN_HALO_VISIBLE_SECONDS) return 1;
    const fadeT = (safeAge - PLAYER_SPAWN_HALO_VISIBLE_SECONDS) / Math.max(0.001, PLAYER_SPAWN_HALO_FADE_SECONDS);
    return clamp(1 - fadeT, 0, 1);
  }


  function drawActors() {
    const actors = game.fakePlayers.map((fake) => ({ type: 'fake', y: fake.y, ref: fake }));
    actors.push({ type: 'player', y: game.player.y, ref: game.player });
    actors.sort((a, b) => a.y - b.y);
    for (const actor of actors) {
      if (actor.type === 'player') {
        drawNoobCharacter(actor.ref, '玩家', true);
      } else {
        drawNoobCharacter(actor.ref, actor.ref.name, false);
      }
    }
  }

  function drawPlayer() {
    drawNoobCharacter(game.player, '玩家', true);
  }

  function drawNoobCharacter(p, name, showHalo) {
    const bodyImg = playerSprites.body;
    const headImg = playerSprites.head;
    const armImg = playerSprites.arm;
    const legImg = playerSprites.leg;
    const scale = PLAYER_CHARACTER_SCALE;

    const bodyW = getSpriteWidth(bodyImg, 170) * scale;
    const bodyH = getSpriteHeight(bodyImg, 165) * scale;
    const headW = getSpriteWidth(headImg, 113) * scale;
    const headH = getSpriteHeight(headImg, 114) * scale;
    const armW = getSpriteWidth(armImg, 70) * scale;
    const armH = getSpriteHeight(armImg, 169) * scale;
    const legW = getSpriteWidth(legImg, 73) * scale;
    const legH = getSpriteHeight(legImg, 167) * scale;

    const phase = p.isMoving ? p.walkTime : 0;
    const swing = p.isMoving ? Math.sin(phase) * PLAYER_WALK_SWING : 0;
    const bob = p.isMoving ? Math.abs(Math.sin(phase)) * PLAYER_WALK_BOB : 0;

    const bodyX = p.x - bodyW / 2;
    const bodyY = p.y - bodyH / 2 - bob;
    const bodyBottom = bodyY + bodyH;
    const headX = p.x - headW / 2;
    const headY = bodyY - headH + scale * 8;

    const leftShoulderX = p.x - bodyW / 1.5 - scale * 10;
    const rightShoulderX = p.x + bodyW / 1.5 + scale * 10;
    const shoulderY = bodyY + scale * 0.7;
    const leftHipX = p.x - bodyW * 0.22;
    const rightHipX = p.x + bodyW * 0.22;
    const hipY = bodyBottom - scale * 4;

    const haloAlpha = showHalo ? getPlayerSpawnHaloAlpha(p.spawnHaloAge) : 0;
    if (haloAlpha > 0.001) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = 0.38 * haloAlpha;
      ctx.fillStyle = '#8fd8ff';
      ctx.beginPath();
      ctx.arc(0, 0, 78, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.92 * haloAlpha;
      ctx.strokeStyle = '#5db8e8';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.restore();
    }

    // 绘制顺序：腿和手臂在后，身体和头在前。所有部件使用同一个 scale，保持资源原比例。
    drawSpritePart(legImg, leftHipX, hipY, legW, legH, 0.5, 0.04, swing, '#8ee637');
    drawSpritePart(legImg, rightHipX, hipY, legW, legH, 0.5, 0.04, -swing, '#8ee637');
    drawSpritePart(armImg, leftShoulderX, shoulderY, armW, armH, 0.5, 0.04, -swing * 0.75, '#ffeb25');
    drawSpritePart(armImg, rightShoulderX, shoulderY, armW, armH, 0.5, 0.04, swing * 0.75, '#ffeb25');
    drawSpriteRect(bodyImg, bodyX, bodyY, bodyW, bodyH, '#218cff');
    drawSpriteRect(headImg, headX, headY, headW, headH, '#ffeb25');

    drawText(name || '玩家', p.x, headY - 12, 22, '#ffe85f', 'center', '900', true);
  }

  function getSpriteWidth(img, fallback) {
    return img && img.ready && img.naturalWidth ? img.naturalWidth : fallback;
  }

  function getSpriteHeight(img, fallback) {
    return img && img.ready && img.naturalHeight ? img.naturalHeight : fallback;
  }

  function drawSpriteRect(img, x, y, w, h, fallbackColor) {
    if (img && img.ready) {
      ctx.drawImage(img, x, y, w, h);
      return;
    }
    roundRect(x, y, w, h, 4, fallbackColor, 'rgba(0,0,0,0.45)', 2);
  }

  function drawSpritePart(img, pivotX, pivotY, w, h, pivotRatioX, pivotRatioY, angle, fallbackColor) {
    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(angle);
    const drawX = -w * pivotRatioX;
    const drawY = -h * pivotRatioY;
    if (img && img.ready) {
      ctx.drawImage(img, drawX, drawY, w, h);
    } else {
      roundRect(drawX, drawY, w, h, 4, fallbackColor, 'rgba(0,0,0,0.45)', 2);
    }
    ctx.restore();
  }

  function drawHud() {
    drawJoystick();
    drawCoinHud();
  }

  function drawCoinHud() {
    const label = '$' + money(game.coins);
    drawText(label, layout.w - 28, layout.h - 28, 20, '#8fff59', 'right', '900', true);
  }


  function drawJoystick() {
    const j = game.joystick;
    ctx.save();
    ctx.globalAlpha = j.active ? 0.46 : 0.34;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(j.baseX, j.baseY, j.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = j.active ? 0.32 : 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(j.baseX, j.baseY, 47, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = j.active ? 0.82 : 0.72;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(j.knobX, j.knobY, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }


  function drawTiledRect(x, y, w, h, baseColor, tintColor, imageAlpha) {
    ctx.save();
    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, w, h);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (tileImageReady) {
      ctx.globalAlpha = imageAlpha == null ? 0.90 : imageAlpha;
      for (let tx = x; tx < x + w; tx += 256) {
        for (let ty = y; ty < y + h; ty += 256) {
          ctx.drawImage(tileImage, tx, ty, 256, 256);
        }
      }
    }
    if (tintColor) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = tintColor;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function drawBrainrotSlot(r, slot) {
    const reserved = Boolean(slot && slot.reserved);
    const coins = Number(slot && slot.coins) || 0;
    const hasBrainrot = Boolean(slot && slot.templateId);
    const cooldown = hasBrainrot ? getSlotCollectCooldown(slot) : 0;
    const isCooling = cooldown > 0;
    const cardX = r.x + r.w * 0.0909;
    const cardY = r.y;
    const cardW = r.w * (1 - 0.0909 - 0.0839);
    const cardH = r.h * (1 - 0.2761);
    const radius = 24;
    const baseTop = isCooling ? '#ff5c64' : '#6fff59';
    const baseBottom = isCooling ? '#bf2435' : '#23b646';
    const border = isCooling ? 'rgba(255,196,196,0.86)' : 'rgba(210,255,184,0.82)';
    const labelColor = isCooling ? '#ff6b72' : '#8fff59';

    ctx.save();
    ctx.globalAlpha = reserved ? 0.78 : 1;

    const baseGradient = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    baseGradient.addColorStop(0, baseTop);
    baseGradient.addColorStop(1, baseBottom);
    roundRect(cardX, cardY, cardW, cardH, radius, baseGradient, border, 3);

    // 保留整体高光层次，但移除中间横条遮罩，避免出现白色杠状观感。

    const shineGradient = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH * 0.55);
    shineGradient.addColorStop(0, 'rgba(255,255,255,0.25)');
    shineGradient.addColorStop(1, 'rgba(255,255,255,0)');
    roundRect(cardX + 5, cardY + 5, cardW - 10, cardH * 0.48, 20, shineGradient, null, 0);
    ctx.restore();

    const label = coins > 0.5 ? ('$' + money(coins)) : '$0';
    drawFigmaText(label, r.x + r.w / 2, r.y + r.h - 8, 28, labelColor, 'center', '700');
  }

  function drawReservedSlot(r) {
    ctx.save();
    ctx.globalAlpha = 0.78;
    roundRect(r.x + 18, r.y + 42, r.w - 36, 54, 18, 'rgba(255,255,255,0.38)', 'rgba(255,255,255,0.48)', 2);
    ctx.restore();
    drawText('运输中', r.cx, r.y + 78, 16, '#ffffff', 'center', '900', true);
  }

  function drawShopItemCard(template, x, y, w, h, options) {
    const price = options && Number.isFinite(options.price) ? options.price : template.price;
    const quality = template.quality || template.rarity || '普通';
    ctx.save();
    ctx.globalAlpha = options && options.dim ? 0.55 : 1;
    // Figma ShopItem: 170×279，文本均为居中阴影文字，不绘制卡片底座。
    drawFigmaText(template.name, x + 87, y + 20, 20, '#ffffff', 'center', '700');
    drawFigmaText(quality, x + 85, y + 48, 18, getQualityColor(quality), 'center', '700');
    drawFigmaText('$' + money(template.incomePerSecond) + '/s', x + 85, y + 76, 18, '#ffe538', 'center', '700');
    drawFigmaText('$' + money(price), x + 83, y + 109, 18, '#93d2f1', 'center', '700');
    drawBrainrot(template, x + 51 + 39, y + 146 + 36, 36, true);
    ctx.restore();
  }

  function drawConveyorEmpty() {
    // Figma 修正版：右侧传送带空位不绘制任何占位，只露出传送带背景。
  }

  function drawFigmaCoinAmount(x, y, label) {
    drawFigmaText('$' + label, x, y, 24, '#8fff59', 'center', '700');
  }

  function drawFloatingTexts() {
    for (const f of game.floatingTexts) {
      const alpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      drawText(f.text, f.x, f.y, 18, f.color, 'center', '900', true);
      ctx.restore();
    }
  }

  function drawDebug() {
    debugPanel.classList.remove('hidden');
    const occupied = game.slots.filter((s) => s.templateId || s.reserved).length;
    debugPanel.textContent = [
      'coins: ' + Math.floor(game.coins),
      'occupied/reserved: ' + occupied + '/' + cfg.maxSlots,
      'player: ' + Math.floor(game.player.x) + ',' + Math.floor(game.player.y),
      'camera: ' + Math.floor(game.camera.x) + ',' + Math.floor(game.camera.y),
      'map: ' + Math.floor(layout.map.w) + 'x' + Math.floor(layout.map.h) + ' zoom:' + layout.worldScale,
      'animations: ' + game.purchaseAnimations.length,
      'fakePlayers: ' + game.fakePlayers.length + ' next:' + game.fakePlayerNextId,
      'nextTpl: ' + game.conveyorNextTemplateIndex,
      'storageKey: ' + cfg.storageKey
    ].join('\n');
  }

  function drawBrainrot(template, x, y, r, showFace) {
    const img = getBrainrotSprite(template);
    if (img && img.ready) {
      const rawW = getSpriteWidth(img, 256);
      const rawH = getSpriteHeight(img, 256);
      const maxSide = Math.max(rawW, rawH, 1);
      const box = r * (template.spriteScale || 3.15);
      const w = box * rawW / maxSide;
      const h = box * rawH / maxSide;

      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = template.color || 'rgba(255,255,255,0.9)';
      ctx.shadowBlur = Math.max(10, r * 0.34);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = template.color;
    ctx.shadowBlur = 12;
    const g = ctx.createRadialGradient(-r * 0.2, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, template.color);
    g.addColorStop(1, '#291449');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.stroke();
    if (showFace !== false) {
      ctx.fillStyle = '#12051f';
      ctx.beginPath();
      ctx.arc(-r * 0.32, -r * 0.12, r * 0.11, 0, Math.PI * 2);
      ctx.arc(r * 0.32, -r * 0.12, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#12051f';
      ctx.lineWidth = Math.max(2, r * 0.08);
      ctx.beginPath();
      ctx.arc(0, r * 0.18, r * 0.32, 0.08 * Math.PI, 0.92 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCoinBubble(x, y, label) {
    const text = '$' + label;
    const width = Math.max(54, 22 + text.length * 8);
    roundRect(x - width / 2, y, width, 24, 12, '#ffdd40', '#fff6a4', 2);
    drawText(text, x, y + 17, 13, '#3d2300', 'center', '900');
  }

  function drawPill(x, y, w, h, text, fill, color) {
    roundRect(x, y, w, h, h / 2, fill, 'rgba(255,255,255,0.35)', 1);
    drawText(text, x + w / 2, y + h * 0.68, Math.min(16, h * 0.58), color, 'center', '900');
  }

  function roundRect(x, y, w, h, r, fill, stroke, lineWidth) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }

  function drawFigmaText(text, x, y, size, color, align, weight) {
    ctx.save();
    ctx.font = `${weight || '700'} ${size}px Arial, Microsoft YaHei, sans-serif`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,0.90)';
    ctx.fillText(String(text), x + 2, y + 3);
    ctx.fillStyle = color || '#fff';
    ctx.fillText(String(text), x, y);
    ctx.restore();
  }

  function drawText(text, x, y, size, color, align, weight, stroke) {
    ctx.save();
    ctx.font = `${weight || '700'} ${size}px Arial, Microsoft YaHei, sans-serif`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    if (stroke) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color || '#fff';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function pointerToCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function preventInputDefault(e) {
    if (e && e.preventDefault && e.cancelable !== false) e.preventDefault();
  }

  function getInputId(e) {
    return e && e.pointerId != null ? e.pointerId : 'touch';
  }

  function screenToWorld(x, y) {
    const zoom = layout && layout.worldScale ? layout.worldScale : 1;
    return { x: x / zoom + game.camera.x, y: y / zoom + game.camera.y };
  }

  function onPointerDown(e) {
    if (!layout || !modalEl.classList.contains('hidden')) return;
    preventInputDefault(e);
    const p = pointerToCanvas(e);
    const js = layout.joystick;
    const isJoystickZone = p.x < layout.w * 0.30 && p.y > layout.h * 0.48;
    if (isJoystickZone) {
      game.joystick.active = true;
      game.joystick.pointerId = getInputId(e);
      game.joystick.baseX = js.x;
      game.joystick.baseY = js.y;
      updateJoystick(p.x, p.y);
      if (canvas.setPointerCapture && e.pointerId != null) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 老 WebView 兜底：忽略捕获失败 */ }
      }
      return;
    }

    const world = screenToWorld(p.x, p.y);
    const conveyorItem = hitConveyorItem(world.x, world.y);
    if (conveyorItem) {
      purchaseConveyorItem(conveyorItem);
      return;
    }

    const slotIndex = hitSlot(world.x, world.y);
    if (slotIndex >= 0) onSlotClick(slotIndex);
  }

  function onPointerMove(e) {
    if (!game.joystick.active || game.joystick.pointerId !== getInputId(e)) return;
    preventInputDefault(e);
    const p = pointerToCanvas(e);
    updateJoystick(p.x, p.y);
  }

  function onPointerUp(e) {
    if (game.joystick.pointerId !== getInputId(e)) return;
    preventInputDefault(e);
    game.joystick.active = false;
    game.joystick.pointerId = null;
    game.joystick.dx = 0;
    game.joystick.dy = 0;
    game.joystick.knobX = game.joystick.baseX;
    game.joystick.knobY = game.joystick.baseY;
    if (canvas.releasePointerCapture && e.pointerId != null) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略释放失败 */ }
    }
  }

  function getPrimaryTouch(e) {
    const touches = e.changedTouches && e.changedTouches.length ? e.changedTouches : e.touches;
    return touches && touches.length ? touches[0] : null;
  }

  function touchToPointerEvent(e) {
    const t = getPrimaryTouch(e);
    if (!t) return null;
    return {
      clientX: t.clientX,
      clientY: t.clientY,
      pointerId: 'touch',
      preventDefault: function () { if (e.preventDefault) e.preventDefault(); },
      cancelable: e.cancelable
    };
  }

  function onTouchStart(e) {
    const p = touchToPointerEvent(e);
    if (p) onPointerDown(p);
  }

  function onTouchMove(e) {
    const p = touchToPointerEvent(e);
    if (p) onPointerMove(p);
  }

  function onTouchEnd(e) {
    const p = touchToPointerEvent(e) || { pointerId: 'touch', preventDefault: function () { if (e.preventDefault) e.preventDefault(); }, cancelable: e.cancelable };
    onPointerUp(p);
  }

  function updateJoystick(x, y) {
    const j = game.joystick;
    const dx = x - j.baseX;
    const dy = y - j.baseY;
    const len = Math.hypot(dx, dy);
    const max = j.radius;
    const scale = len > max ? max / len : 1;
    j.knobX = j.baseX + dx * scale;
    j.knobY = j.baseY + dy * scale;
    j.dx = len > 4 ? (dx * scale) / max : 0;
    j.dy = len > 4 ? (dy * scale) / max : 0;
  }

  function hitConveyorItem(x, y) {
    for (let i = game.conveyorItems.length - 1; i >= 0; i -= 1) {
      const item = game.conveyorItems[i];
      if (item.empty || !item.templateId || !item.rect) continue;
      const r = item.rect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return item;
    }
    return null;
  }


  function hitSlot(x, y) {
    for (let i = 0; i < layout.slots.length; i += 1) {
      const r = layout.slots[i];
      const inSlot = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      const inItem = x >= r.itemX && x <= r.itemX + r.itemW && y >= r.itemY && y <= r.itemY + r.itemH;
      if (inSlot || inItem) return i;
    }
    return -1;
  }


  function onSlotClick(index) {
    const slot = game.slots[index];
    if (!slot || !slot.templateId) return;
    selectedDeleteSlot = index;
    modalEl.classList.remove('hidden');
  }

  function closeDeleteModal() {
    selectedDeleteSlot = null;
    modalEl.classList.add('hidden');
  }

  function confirmDeleteSlot() {
    if (selectedDeleteSlot == null) return closeDeleteModal();
    const slot = game.slots[selectedDeleteSlot];
    if (slot && slot.templateId) {
      const rect = layout.slots[selectedDeleteSlot];
      const template = getTemplate(slot.templateId);
      slot.templateId = null;
      slot.reserved = false;
      slot.collectCooldown = 0;
      addFloatText('已删除 ' + template.name, rect.cx, rect.cy - 18, '#ff4165');
      saveNow();
    }
    closeDeleteModal();
  }

  function saveNow() {
    storage.saveState(game);
  }

  function resetGame() {
    const fresh = storage.resetState();
    game.coins = fresh.coins;
    game.slots = fresh.slots;
    game.conveyorNextTemplateIndex = fresh.conveyor.nextTemplateIndex;
    game.purchaseAnimations = [];
    game.floatingTexts = [];
    game.fakePlayers = [];
    game.fakePlayerNextId = 1;
    game.fakePlayerSpawnTimer = 0;
    game.fakePlayerNextSpawnIn = 0;
    game.fakePlayersInitialized = false;
    game.conveyorItems = [];
    initConveyor();
    rebuildConveyorPositions();
    placePlayerAtSpawn();
    snapCameraToPlayer();
    saveNow();
    showToast('已重置');
  }

  function gameLoop(now) {
    const dt = Math.min(0.04, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    if (layout) {
      update(dt);
      draw();
    }
    requestNextFrame(gameLoop);
  }

  function setupEvents() {
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', scheduleResize);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    if (!window.PointerEvent) {
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd, { passive: false });
      canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', closeDeleteModal);
    if (deleteConfirmBtn) deleteConfirmBtn.addEventListener('click', confirmDeleteSlot);

    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      keyState.add(key);
      if (key === 'r' && e.shiftKey) resetGame();
      if (key === '`') {
        debugVisible = !debugVisible;
        if (!debugVisible) debugPanel.classList.add('hidden');
      }
    });
    window.addEventListener('keyup', (e) => keyState.delete(e.key.toLowerCase()));
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow();
    });
  }

  function boot() {
    if (booted) return;
    booted = true;
    bootLog('boot_game_start');
    initConveyor();
    setupEvents();
    resize();
    lastFrameTime = nowMs();
    requestNextFrame(gameLoop);
    requestNextFrame(() => bootLog('boot_first_frame'));
  }

  runBootOverlay()
    .then(() => {
      boot();
    })
    .catch((err) => {
      console.warn('[BootOverlay] fallback to direct boot', err);
      bootLog('boot_error', { message: err && err.message ? err.message : String(err) });
      finishBootOverlay();
      boot();
    });
})();
