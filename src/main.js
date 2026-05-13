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

  const DPR_LIMIT = 2;
  const keyState = new Set();
  const CAMERA_LERP = 9.5;
  const FIGMA_LAYOUT_VERSION = 'figma_node_4_9_v1';
  const TILE_IMG_PATH = 'assets/images/RobloxOverlayImg.png';

  const FIGMA = {
    world: { w: 2600, h: 1757 },
    room: { x: 256, y: 438, w: 1563, h: 915 },
    shopFloor: { x: 309, y: 539, w: 1407, h: 730 },
    roomCorridor: { x: 1716, y: 749, w: 103, h: 322 },
    collection: { x: 1871, y: 648, w: 256, h: 512 },
    conveyor: { x: 2344, y: 1, w: 256, h: 1756 },
    slots: [
      { x: 372, y: 585, w: 143, h: 163, itemX: 352, itemY: 455 },
      { x: 635, y: 585, w: 143, h: 163, itemX: 618, itemY: 455 },
      { x: 902, y: 585, w: 143, h: 163, itemX: 884, itemY: 455 },
      { x: 1168, y: 585, w: 143, h: 163, itemX: 1150, itemY: 461 },
      { x: 1431, y: 585, w: 143, h: 163, itemX: 1416, itemY: 461 },
      { x: 367, y: 1174, w: 143, h: 163, itemX: 350, itemY: 1051 },
      { x: 640, y: 1174, w: 143, h: 163, itemX: 623, itemY: 1051 },
      { x: 897, y: 1174, w: 143, h: 163, itemX: 879, itemY: 1051 },
      { x: 1150, y: 1174, w: 143, h: 163, itemX: 1135, itemY: 1051 },
      { x: 1425, y: 1174, w: 143, h: 163, itemX: 1408, itemY: 1051 }
    ],
    conveyorItems: [
      { x: 2374, y: 12, w: 170, h: 279 },
      { x: 2376, y: 321, w: 170, h: 279 },
      { x: 2387, y: 679, w: 170, h: 279 },
      { x: 2390, y: 1012, w: 170, h: 279 },
      { x: 2390, y: 1396, w: 170, h: 279 }
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

  let layout = null;
  let selectedDeleteSlot = null;
  let toastTimer = 0;
  let lastFrameTime = performance.now();
  let autosaveTimer = 0;
  let debugVisible = false;
  let didValidateSpawn = false;

  const loaded = storage.loadState();
  const game = {
    coins: loaded.coins,
    player: { x: loaded.player.x, y: loaded.player.y, r: 20 },
    camera: { x: 0, y: 0 },
    slots: loaded.slots,
    conveyorItems: [],
    conveyorNextTemplateIndex: loaded.conveyor.nextTemplateIndex,
    purchaseAnimations: [],
    floatingTexts: [],
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

  function money(value) {
    const v = Math.floor(value);
    if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return String(v);
  }

  function getTemplate(templateId) {
    return cfg.brainrots.find((b) => b.id === templateId) || cfg.brainrots[0];
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

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeLayout(w, h);
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
  }

  function isPlayerPositionValid(x, y) {
    if (!layout || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const r = game.player.r;
    if (x < r || y < r || x > layout.map.w - r || y > layout.map.h - r) return false;
    return !collidesWithWalls(x, y, r);
  }

  function clampCamera(x, y) {
    return {
      x: clamp(x, 0, Math.max(0, layout.map.w - layout.w)),
      y: clamp(y, 0, Math.max(0, layout.map.h - layout.h))
    };
  }

  function snapCameraToPlayer(force) {
    if (!layout) return;
    const target = clampCamera(game.player.x - layout.w / 2, game.player.y - layout.h / 2);
    if (force === false) {
      game.camera.x = clamp(game.camera.x, 0, Math.max(0, layout.map.w - layout.w));
      game.camera.y = clamp(game.camera.y, 0, Math.max(0, layout.map.h - layout.h));
    } else {
      game.camera.x = target.x;
      game.camera.y = target.y;
    }
  }

  function updateCamera(dt) {
    const target = clampCamera(game.player.x - layout.w / 2, game.player.y - layout.h / 2);
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
      for (let i = 0; i < cfg.conveyorVisibleCount; i += 1) {
        const template = cfg.brainrots[i % cfg.brainrots.length];
        game.conveyorItems.push({
          id: 'cv_' + i,
          templateId: template.id,
          empty: false,
          yRatio: defaults[i],
          x: 0,
          y: 0,
          hitSize: 0,
          rect: null
        });
      }
      game.conveyorNextTemplateIndex = cfg.conveyorVisibleCount % cfg.brainrots.length;
    }
  }

  function rebuildConveyorPositions() {
    if (!layout || !game.conveyorItems.length) return;
    const conv = layout.conveyor;
    for (const item of game.conveyorItems) {
      if (!Number.isFinite(item.yRatio)) item.yRatio = 0.08;
      item.x = conv.x + conv.w / 2;
      item.y = conv.y + item.yRatio * conv.h;
      item.hitSize = 150;
      item.rect = { x: item.x - 85, y: item.y - 139.5, w: 170, h: 279 };
    }
  }

  function takeNextTemplateId() {
    const id = cfg.brainrots[game.conveyorNextTemplateIndex % cfg.brainrots.length].id;
    game.conveyorNextTemplateIndex = (game.conveyorNextTemplateIndex + 1) % cfg.brainrots.length;
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
    const rect = layout.slots[anim.slotIndex];
    addFloatText('入库！', rect.cx, rect.cy - 16, '#7effb2');
    saveNow();
  }

  function update(dt) {
    updatePlayer(dt);
    updateCamera(dt);
    updateConveyor(dt);
    updateProduction(dt);
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
    let dx = game.joystick.dx;
    let dy = game.joystick.dy;
    if (keyState.has('arrowleft') || keyState.has('a')) dx -= 1;
    if (keyState.has('arrowright') || keyState.has('d')) dx += 1;
    if (keyState.has('arrowup') || keyState.has('w')) dy -= 1;
    if (keyState.has('arrowdown') || keyState.has('s')) dy += 1;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
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
        item.id = 'cv_' + performance.now() + '_' + Math.random().toString(16).slice(2);
      }
      item.x = conv.x + conv.w / 2;
      item.y = conv.y + item.yRatio * conv.h;
      item.rect = { x: item.x - 85, y: item.y - 139.5, w: 170, h: 279 };
    }
  }

  function updateProduction(dt) {
    for (const slot of game.slots) {
      if (!slot.templateId) continue;
      const template = getTemplate(slot.templateId);
      slot.coins += template.incomePerSecond * dt;
    }
  }

  function updateCollection() {
    let total = 0;
    for (let i = 0; i < game.slots.length; i += 1) {
      const slot = game.slots[i];
      if (slot.coins <= 0.01) continue;
      const rect = layout.slots[i];
      const d = Math.hypot(game.player.x - rect.cx, game.player.y - rect.cy);
      if (d <= cfg.collectRadius) {
        const gained = Math.floor(slot.coins);
        if (gained > 0) {
          game.coins += gained;
          total += gained;
          addFloatText('+' + money(gained), rect.cx, rect.cy - 24, '#22ff66');
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
    ctx.translate(-game.camera.x, -game.camera.y);
    drawWorldBackground();
    drawHomeBase();
    drawMidArea();
    drawConveyor();
    drawSlots();
    drawPurchaseAnimations();
    drawPlayer();
    drawFloatingTexts();
    ctx.restore();
    drawHud();
    if (debugVisible) drawDebug();
  }

  function drawWorldBackground() {
    const map = layout.map;
    drawTiledRect(0, 0, map.w, map.h, '#63c849', 'rgba(118,214,87,0.35)', 0.48);
  }


  function drawHomeBase() {
    const room = layout.room;
    roundRect(room.x, room.y, room.w, room.h, 0, '#4b4f47', null, 0);
    drawTiledRect(layout.floor.x, layout.floor.y, layout.floor.w, layout.floor.h, '#858a89', 'rgba(75,78,76,0.34)', 0.34);
    drawTiledRect(layout.roomCorridor.x, layout.roomCorridor.y, layout.roomCorridor.w, layout.roomCorridor.h, '#858a89', 'rgba(75,78,76,0.34)', 0.34);

    ctx.save();
    ctx.globalAlpha = 0.26;
    ctx.strokeStyle = '#23272a';
    ctx.lineWidth = 2;
    for (let x = layout.floor.x; x <= layout.floor.x + layout.floor.w; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, layout.floor.y); ctx.lineTo(x, layout.floor.y + layout.floor.h); ctx.stroke();
    }
    for (let y = layout.floor.y; y <= layout.floor.y + layout.floor.h; y += 64) {
      ctx.beginPath(); ctx.moveTo(layout.floor.x, y); ctx.lineTo(layout.floor.x + layout.floor.w, y); ctx.stroke();
    }
    ctx.restore();

    for (const wall of layout.walls) {
      roundRect(wall.x, wall.y, wall.w, wall.h, 0, '#343835', '#1d211f', 2);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wall.x + 2, wall.y + 2, Math.max(0, wall.w - 4), Math.min(10, Math.max(0, wall.h - 4)));
      ctx.restore();
    }
  }


  function drawSlots() {
    for (let i = 0; i < layout.slots.length; i += 1) {
      const rect = layout.slots[i];
      const slot = game.slots[i];
      drawBrainrotSlot(rect, slot.reserved);
      if (slot.templateId) {
        drawShopItemCard(getTemplate(slot.templateId), rect.itemX, rect.itemY, rect.itemW, rect.itemH, {
          mode: 'home',
          price: Math.max(0, Math.floor(slot.coins)),
          dim: false
        });
      } else if (slot.reserved) {
        drawReservedSlot(rect);
      }
      if (slot.coins > 0.5) {
        drawFigmaCoinAmount(rect.cx, rect.y + rect.h - 4, money(slot.coins));
      }
    }
  }


  function drawMidArea() {
    const m = layout.mid;
    drawTiledRect(m.x, m.y, m.w, m.h, '#b8ff8a', 'rgba(97,224,79,0.26)', 0.26);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.52)';
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 10]);
    ctx.strokeRect(m.x + 12, m.y + 12, m.w - 24, m.h - 24);
    ctx.restore();
  }


  function drawConveyor() {
    const conv = layout.conveyor;
    ctx.save();
    ctx.fillStyle = '#4a4f43';
    ctx.fillRect(conv.x, conv.y, conv.w, conv.h);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000000';
    for (let y = conv.y; y < conv.y + conv.h; y += 54) ctx.fillRect(conv.x, y, conv.w, 2);
    ctx.restore();

    const sorted = [...game.conveyorItems].sort((a, b) => a.y - b.y);
    for (const item of sorted) {
      if (!item.rect) continue;
      if (item.rect.y > conv.y + conv.h || item.rect.y + item.rect.h < conv.y) continue;
      if (item.empty || !item.templateId) {
        drawConveyorEmpty(item.rect);
        continue;
      }
      drawShopItemCard(getTemplate(item.templateId), item.rect.x, item.rect.y, item.rect.w, item.rect.h, {
        mode: 'conveyor',
        price: getTemplate(item.templateId).price,
        dim: false
      });
    }
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


  function drawPlayer() {
    const p = game.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = '#8fd8ff';
    ctx.beginPath();
    ctx.arc(0, 0, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5db8e8';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();

    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#43d7ff';
    ctx.beginPath();
    ctx.arc(-7, -5, 4, 0, Math.PI * 2);
    ctx.arc(7, -5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#301048';
    ctx.fillRect(-8, 6, 16, 4);
    ctx.restore();
    drawText('role name', p.x, p.y - 88, 22, '#d6f8ff', 'center', '900', true);
  }


  function drawHud() {
    drawJoystick();
    drawCoinHud();
  }

  function drawCoinHud() {
    const hud = layout.coinHud;
    const x = hud.x;
    const y = hud.y;
    roundRect(x, y, hud.w, hud.h, 31, 'rgba(24,32,51,0.94)', 'rgba(58,70,99,0.94)', 2);
    ctx.save();
    ctx.fillStyle = '#ffd84d';
    ctx.beginPath();
    ctx.arc(x + 39, y + hud.h / 2, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d19b12';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawText('$', x + 39, y + hud.h / 2 + 8, 22, '#5e3a00', 'center', '900');
    ctx.restore();
    drawText('$ ' + money(game.coins), x + 70, y + 39, 28, '#ffffff', 'left', '900');
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
      ctx.globalAlpha = imageAlpha == null ? 0.45 : imageAlpha;
      for (let tx = x; tx < x + w; tx += 256) {
        for (let ty = y; ty < y + h; ty += 256) {
          ctx.drawImage(tileImage, tx, ty, 256, 256);
        }
      }
    } else {
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2;
      for (let tx = x; tx < x + w; tx += 32) {
        ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y + h); ctx.stroke();
      }
      for (let ty = y; ty < y + h; ty += 32) {
        ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x + w, ty); ctx.stroke();
      }
    }
    if (tintColor) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = tintColor;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function drawBrainrotSlot(r, reserved) {
    ctx.save();
    ctx.globalAlpha = reserved ? 0.76 : 0.52;
    roundRect(r.x, r.y, r.w, r.h, 22, reserved ? 'rgba(80,88,82,0.68)' : 'rgba(70,75,70,0.42)', 'rgba(30,34,30,0.36)', 2);
    ctx.globalAlpha = 0.26;
    roundRect(r.x + 12, r.y + 18, r.w - 24, r.h - 38, 18, 'rgba(170,255,150,0.20)', null, 0);
    ctx.restore();
  }

  function drawReservedSlot(r) {
    ctx.save();
    ctx.globalAlpha = 0.78;
    roundRect(r.x + 18, r.y + 42, r.w - 36, 54, 18, 'rgba(255,255,255,0.38)', 'rgba(255,255,255,0.48)', 2);
    ctx.restore();
    drawText('运输中', r.cx, r.y + 78, 16, '#ffffff', 'center', '900', true);
  }

  function drawShopItemCard(template, x, y, w, h, options) {
    const mode = options && options.mode;
    const displayPrice = options && options.price;
    const cx = x + w / 2;
    ctx.save();
    ctx.globalAlpha = options && options.dim ? 0.55 : 1;
    drawText(template.name, cx, y + 28, 18, '#ffffff', 'center', '900', true);
    drawText('普通', cx, y + 49, 15, '#77ff4f', 'center', '900', true);
    drawText('$' + money(template.incomePerSecond) + '/s', cx, y + 70, 17, '#fff465', 'center', '900', true);
    const priceText = mode === 'home' ? ('$' + money(displayPrice || 0)) : ('$' + money(displayPrice || template.price));
    drawText(priceText, cx, y + 94, 18, mode === 'home' ? '#9beaff' : '#9beaff', 'center', '900', true);
    roundRect(x + 30, y + 108, 110, 110, 24, '#74ff56', 'rgba(40,120,24,0.38)', 2);
    ctx.save();
    ctx.globalAlpha = 0.22;
    roundRect(x + 40, y + 116, 90, 92, 18, '#ffffff', null, 0);
    ctx.restore();
    drawBrainrot(template, cx, y + 163, 46, true);
    drawText('$' + money(template.price), cx, y + 247, 24, '#a8ff73', 'center', '900', true);
    ctx.restore();
  }

  function drawConveyorEmpty(r) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    roundRect(r.x + 22, r.y + 112, r.w - 44, 96, 22, '#111111', 'rgba(255,255,255,0.22)', 2);
    ctx.restore();
  }

  function drawFigmaCoinAmount(x, y, label) {
    drawText('$' + label, x, y, 24, '#a8ff73', 'center', '900', true);
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
      'occupied/reserved: ' + occupied + '/10',
      'player: ' + Math.floor(game.player.x) + ',' + Math.floor(game.player.y),
      'camera: ' + Math.floor(game.camera.x) + ',' + Math.floor(game.camera.y),
      'map: ' + Math.floor(layout.map.w) + 'x' + Math.floor(layout.map.h),
      'animations: ' + game.purchaseAnimations.length,
      'nextTpl: ' + game.conveyorNextTemplateIndex,
      'storageKey: ' + cfg.storageKey
    ].join('\n');
  }

  function drawBrainrot(template, x, y, r, showFace) {
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

  function screenToWorld(x, y) {
    return { x: x + game.camera.x, y: y + game.camera.y };
  }

  function onPointerDown(e) {
    if (!layout || !modalEl.classList.contains('hidden')) return;
    const p = pointerToCanvas(e);
    const js = layout.joystick;
    const isJoystickZone = p.x < layout.w * 0.30 && p.y > layout.h * 0.48;
    if (isJoystickZone) {
      game.joystick.active = true;
      game.joystick.pointerId = e.pointerId;
      game.joystick.baseX = js.x;
      game.joystick.baseY = js.y;
      updateJoystick(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
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
    if (!game.joystick.active || game.joystick.pointerId !== e.pointerId) return;
    const p = pointerToCanvas(e);
    updateJoystick(p.x, p.y);
  }

  function onPointerUp(e) {
    if (game.joystick.pointerId !== e.pointerId) return;
    game.joystick.active = false;
    game.joystick.pointerId = null;
    game.joystick.dx = 0;
    game.joystick.dy = 0;
    game.joystick.knobX = game.joystick.baseX;
    game.joystick.knobY = game.joystick.baseY;
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
    const template = getTemplate(slot.templateId);
    modalNameEl.textContent = `确定删除「${template.name}」吗？删除后不返还购买金币。`;
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
      addFloatText('已删除 ' + template.name, rect.cx, rect.cy - 18, '#ff4165');
      showToast('已删除，不返还金币');
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
    requestAnimationFrame(gameLoop);
  }

  function setupEvents() {
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    deleteCancelBtn.addEventListener('click', closeDeleteModal);
    deleteConfirmBtn.addEventListener('click', confirmDeleteSlot);

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
    initConveyor();
    setupEvents();
    resize();
    requestAnimationFrame(gameLoop);
  }

  boot();
})();
