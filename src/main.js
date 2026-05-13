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
    const mapH = Math.max(h * 1.28, 820);
    const wall = Math.max(24, Math.min(34, h * 0.045));
    const homeW = Math.max(650, Math.min(760, w * 0.62));
    const homeH = Math.max(390, Math.min(470, h * 0.68));
    const home = {
      x: Math.max(72, w * 0.08),
      y: (mapH - homeH) / 2,
      w: homeW,
      h: homeH
    };
    const mid = {
      x: home.x + home.w + Math.max(105, w * 0.10),
      y: mapH / 2 - Math.max(260, h * 0.34) / 2,
      w: Math.max(280, Math.min(360, w * 0.26)),
      h: Math.max(260, Math.min(330, h * 0.42))
    };
    const conveyor = {
      x: mid.x + mid.w + Math.max(110, w * 0.10),
      y: Math.max(92, mapH / 2 - Math.max(560, h * 0.78) / 2),
      w: Math.max(250, Math.min(330, w * 0.24)),
      h: Math.max(560, Math.min(660, h * 0.86))
    };
    const mapW = Math.max(w * 1.8, conveyor.x + conveyor.w + Math.max(90, w * 0.08));

    const entranceH = Math.max(132, home.h * 0.35);
    const entranceY = home.y + home.h / 2 - entranceH / 2;
    const walls = [
      { x: home.x, y: home.y, w: home.w, h: wall, name: 'home-top' },
      { x: home.x, y: home.y + home.h - wall, w: home.w, h: wall, name: 'home-bottom' },
      { x: home.x, y: home.y, w: wall, h: home.h, name: 'home-left' },
      { x: home.x + home.w - wall, y: home.y, w: wall, h: Math.max(0, entranceY - home.y), name: 'home-right-up' },
      {
        x: home.x + home.w - wall,
        y: entranceY + entranceH,
        w: wall,
        h: Math.max(0, home.y + home.h - (entranceY + entranceH)),
        name: 'home-right-down'
      }
    ].filter((r) => r.w > 0 && r.h > 0);

    const floor = { x: home.x + wall, y: home.y + wall, w: home.w - wall * 2, h: home.h - wall * 2 };
    const slotGapX = Math.max(12, floor.w * 0.024);
    const slotGapY = Math.max(18, floor.h * 0.09);
    const slotW = (floor.w - slotGapX * 6) / 5;
    const slotH = Math.min((floor.h - slotGapY * 3) / 2, slotW * 0.95);
    const slotsStartY = floor.y + (floor.h - slotH * 2 - slotGapY) / 2;
    const slots = [];
    for (let i = 0; i < cfg.maxSlots; i += 1) {
      const row = i < 5 ? 0 : 1;
      const col = i % 5;
      const x = floor.x + slotGapX + col * (slotW + slotGapX);
      const y = slotsStartY + row * (slotH + slotGapY);
      slots.push({ x, y, w: slotW, h: slotH, cx: x + slotW / 2, cy: y + slotH / 2 });
    }

    const spawn = { x: home.x + home.w * 0.48, y: home.y + home.h * 0.52 };
    layout = {
      w,
      h,
      map: { x: 0, y: 0, w: mapW, h: mapH },
      home,
      floor,
      wall,
      walls,
      entrance: { x: home.x + home.w - wall, y: entranceY, w: wall + 18, h: entranceH },
      mid,
      conveyor,
      slots,
      spawn,
      joystick: {
        x: Math.max(92, w * 0.12),
        y: h - Math.max(94, h * 0.17),
        radius: 58
      },
      coinHud: {
        w: Math.max(156, Math.min(210, w * 0.17)),
        h: 54,
        margin: Math.max(18, w * 0.018)
      }
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
      if (!isPlayerPositionValid(game.player.x, game.player.y)) {
        placePlayerAtSpawn();
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
    if (saved.length) {
      game.conveyorItems = saved.slice(0, cfg.conveyorVisibleCount + 1).map((item, index) => ({
        id: 'cv_' + Date.now() + '_' + index + '_' + Math.random().toString(16).slice(2),
        templateId: item.empty ? null : item.templateId,
        empty: Boolean(item.empty),
        yRatio: Number.isFinite(item.yRatio) ? item.yRatio : index / cfg.conveyorVisibleCount,
        x: 0,
        y: 0,
        hitSize: 0
      }));
    }

    if (game.conveyorItems.length < cfg.conveyorVisibleCount + 1) {
      game.conveyorItems = [];
      for (let i = 0; i < cfg.conveyorVisibleCount + 1; i += 1) {
        const template = cfg.brainrots[i % cfg.brainrots.length];
        game.conveyorItems.push({
          id: 'cv_' + i,
          templateId: template.id,
          empty: false,
          yRatio: (i - 0.5) / cfg.conveyorVisibleCount,
          x: 0,
          y: 0,
          hitSize: 0
        });
      }
      game.conveyorNextTemplateIndex = (cfg.conveyorVisibleCount + 1) % cfg.brainrots.length;
    }
  }

  function rebuildConveyorPositions() {
    if (!layout || !game.conveyorItems.length) return;
    const conv = layout.conveyor;
    const spacing = conv.h / cfg.conveyorVisibleCount;
    for (const item of game.conveyorItems) {
      if (!Number.isFinite(item.yRatio)) item.yRatio = 0;
      item.x = conv.x + conv.w / 2;
      item.y = conv.y + item.yRatio * conv.h;
      item.hitSize = Math.min(cfg.conveyorItemSize, conv.w * 0.56, spacing * 0.74);
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
    for (const item of game.conveyorItems) {
      item.yRatio += (cfg.conveyorSpeed * dt) / conv.h;
      if (item.yRatio > 1.12) {
        item.yRatio -= 1.2;
        item.empty = false;
        item.templateId = takeNextTemplateId();
        item.id = 'cv_' + performance.now() + '_' + Math.random().toString(16).slice(2);
      }
      item.x = conv.x + conv.w / 2;
      item.y = conv.y + item.yRatio * conv.h;
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
    ctx.fillStyle = '#5ec749';
    ctx.fillRect(0, 0, map.w, map.h);

    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = '#95e67b';
    ctx.lineWidth = 1;
    const tile = 58;
    for (let x = 0; x <= map.w; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, map.h);
      ctx.stroke();
    }
    for (let y = 0; y <= map.h; y += tile) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(map.w, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 90; i += 1) {
      const x = (i * 149) % map.w;
      const y = (i * 83) % map.h;
      ctx.fillStyle = i % 3 === 0 ? '#3da934' : '#78d85d';
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + (i % 4), 1.5 + (i % 3), (i * 0.7) % Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHomeBase() {
    const home = layout.home;
    const floor = layout.floor;

    roundRect(home.x - 9, home.y - 9, home.w + 18, home.h + 18, 22, 'rgba(33,92,38,0.26)', null, 0);
    roundRect(floor.x, floor.y, floor.w, floor.h, 10, '#9b9b9b', '#cfcfcf', 2);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let x = floor.x; x <= floor.x + floor.w; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, floor.y);
      ctx.lineTo(x, floor.y + floor.h);
      ctx.stroke();
    }
    for (let y = floor.y; y <= floor.y + floor.h; y += 42) {
      ctx.beginPath();
      ctx.moveTo(floor.x, y);
      ctx.lineTo(floor.x + floor.w, y);
      ctx.stroke();
    }
    ctx.restore();

    for (const wall of layout.walls) {
      roundRect(wall.x, wall.y, wall.w, wall.h, 7, '#2abf42', '#15752a', 3);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#d8ffd0';
      ctx.fillRect(wall.x + 4, wall.y + 4, Math.max(0, wall.w - 8), Math.max(0, Math.min(8, wall.h - 8)));
      ctx.restore();
    }

    const e = layout.entrance;
    drawText('出口', e.x + e.w + 18, e.y + e.h / 2 + 6, 16, '#145a20', 'left', '900', true);
  }

  function drawSlots() {
    for (let i = 0; i < layout.slots.length; i += 1) {
      const rect = layout.slots[i];
      const slot = game.slots[i];
      const hasCoins = slot.coins > 0.5;
      let fill = slot.templateId ? '#e8e8e8' : '#bfbfbf';
      if (slot.reserved) fill = '#dadada';
      roundRect(rect.x, rect.y, rect.w, rect.h, 16, fill, hasCoins ? '#ffd528' : '#6f6f6f', hasCoins ? 4 : 2);
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#000';
      ctx.fillRect(rect.x + 4, rect.y + rect.h - 12, rect.w - 8, 8);
      ctx.restore();

      drawText(String(i + 1), rect.x + 10, rect.y + 20, 14, '#3d3d3d', 'left', '900');

      if (slot.templateId) {
        const template = getTemplate(slot.templateId);
        drawBrainrot(template, rect.cx, rect.cy - 10, Math.min(rect.w, rect.h) * 0.43, false);
        drawText(template.name, rect.cx, rect.y + rect.h - 27, 13, '#262626', 'center', '900');
        drawText('+' + money(template.incomePerSecond) + '/秒', rect.cx, rect.y + rect.h - 10, 12, '#106b27', 'center', '900');
      } else if (slot.reserved) {
        drawText('运输中', rect.cx, rect.cy, 16, '#454545', 'center', '900');
      } else {
        drawText('空位', rect.cx, rect.cy, 16, '#777', 'center', '900');
      }

      if (hasCoins) {
        drawCoinBubble(rect.cx, rect.y - 9, money(slot.coins));
      }
    }
  }

  function drawMidArea() {
    const m = layout.mid;
    ctx.save();
    ctx.globalAlpha = 0.52;
    roundRect(m.x, m.y, m.w, m.h, 26, 'rgba(87,205,255,0.18)', '#42c8ff', 4);
    ctx.setLineDash([14, 14]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(m.x + 28, m.y + m.h / 2);
    ctx.lineTo(m.x + m.w - 28, m.y + m.h / 2);
    ctx.stroke();
    ctx.restore();
    drawText('收集区', m.x + m.w / 2, m.y + 38, 20, '#087094', 'center', '900', true);
    drawText('购买动画经过这里', m.x + m.w / 2, m.y + m.h / 2 + 44, 15, '#087094', 'center', '900', true);
  }

  function drawConveyor() {
    const conv = layout.conveyor;
    roundRect(conv.x, conv.y, conv.w, conv.h, 24, '#e9bc72', '#85531c', 4);
    drawText('传送带', conv.x + conv.w / 2, conv.y + 34, 22, '#3b2209', 'center', '900');

    const beltX = conv.x + conv.w * 0.5;
    const beltW = Math.min(132, conv.w * 0.58);
    roundRect(beltX - beltW / 2, conv.y + 56, beltW, conv.h - 86, 22, '#24100b', '#7a4218', 4);

    ctx.save();
    ctx.beginPath();
    ctx.rect(conv.x, conv.y + 48, conv.w, conv.h - 56);
    ctx.clip();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = '#ffd58a';
    ctx.lineWidth = 3;
    for (let y = conv.y - 80; y < conv.y + conv.h + 120; y += 42) {
      const off = (performance.now() / 28) % 42;
      ctx.beginPath();
      ctx.moveTo(beltX - beltW / 2 + 10, y + off);
      ctx.lineTo(beltX + beltW / 2 - 10, y + 20 + off);
      ctx.stroke();
    }
    ctx.restore();

    const sorted = [...game.conveyorItems].sort((a, b) => a.y - b.y);
    for (const item of sorted) {
      if (item.y < conv.y + 48 || item.y > conv.y + conv.h - 12) continue;
      if (item.empty || !item.templateId) {
        drawText('空', item.x, item.y + 5, 14, 'rgba(255,255,255,0.35)', 'center', '900');
        continue;
      }
      const template = getTemplate(item.templateId);
      drawBrainrot(template, item.x, item.y, item.hitSize / 2, true);
      drawText(template.name, item.x, item.y + item.hitSize / 2 + 18, 13, '#fff', 'center', '900', true);
      drawPill(item.x - 43, item.y + item.hitSize / 2 + 25, 86, 24, '$' + money(template.price), '#ffe45f', '#2b1b00');
    }
  }

  function drawPurchaseAnimations() {
    for (const anim of game.purchaseAnimations) {
      const template = getTemplate(anim.templateId);
      const t = clamp(anim.t / anim.duration, 0, 1);
      const e = easeOutCubic(t);
      const x = lerp(anim.fromX, anim.toX, e);
      const y = lerp(anim.fromY, anim.toY, e) - Math.sin(t * Math.PI) * 40;
      drawBrainrot(template, x, y, 38 + Math.sin(t * Math.PI) * 10, true);
    }
  }

  function drawPlayer() {
    const p = game.player;
    ctx.save();
    ctx.translate(p.x, p.y);
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
  }

  function drawHud() {
    drawJoystick();
    drawCoinHud();
  }

  function drawCoinHud() {
    const hud = layout.coinHud;
    const x = layout.w - hud.w - hud.margin;
    const y = layout.h - hud.h - Math.max(18, hud.margin);
    roundRect(x, y, hud.w, hud.h, 20, 'rgba(20, 10, 0, 0.72)', 'rgba(255,255,255,0.35)', 2);
    ctx.save();
    ctx.fillStyle = '#ffd83d';
    ctx.beginPath();
    ctx.arc(x + 30, y + hud.h / 2, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff1a4';
    ctx.lineWidth = 3;
    ctx.stroke();
    drawText('$', x + 30, y + hud.h / 2 + 7, 20, '#5e3a00', 'center', '900');
    ctx.restore();
    drawText(money(game.coins), x + 56, y + 35, 24, '#ffffff', 'left', '900', true);
  }

  function drawJoystick() {
    const j = game.joystick;
    ctx.save();
    ctx.globalAlpha = j.active ? 0.72 : 0.38;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(j.baseX, j.baseY, j.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = j.active ? 0.9 : 0.58;
    ctx.fillStyle = '#7b54ff';
    ctx.beginPath();
    ctx.arc(j.knobX, j.knobY, j.radius * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
      if (item.empty || !item.templateId) continue;
      if (item.y < layout.conveyor.y + 48 || item.y > layout.conveyor.y + layout.conveyor.h - 12) continue;
      const radius = Math.max(42, item.hitSize * 0.68);
      if (Math.hypot(x - item.x, y - item.y) <= radius) return item;
    }
    return null;
  }

  function hitSlot(x, y) {
    for (let i = 0; i < layout.slots.length; i += 1) {
      const r = layout.slots[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
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
    showToast('摇杆移动，点击传送带脑腐购买');
  }

  boot();
})();
