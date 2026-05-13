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
  const DESIGN = { w: 1280, h: 720 };
  const keyState = new Set();

  let layout = null;
  let selectedDeleteSlot = null;
  let toastTimer = 0;
  let lastFrameTime = performance.now();
  let autosaveTimer = 0;
  let debugVisible = false;

  const loaded = storage.loadState();
  const game = {
    coins: loaded.coins,
    player: { x: loaded.player.x, y: loaded.player.y, r: 20 },
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
      radius: 54
    }
  };

  function clamp(v, min, max) {
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
    const safeTop = 16;
    const safeBottom = 18;
    const margin = Math.max(14, w * 0.018);
    const homeW = w * 0.47;
    const conveyorW = Math.max(190, w * 0.22);
    const midW = w - homeW - conveyorW - margin * 4;
    const panelY = safeTop + 66;
    const panelH = h - panelY - safeBottom;
    const home = { x: margin, y: panelY, w: homeW, h: panelH };
    const mid = { x: home.x + home.w + margin, y: panelY, w: midW, h: panelH };
    const conveyor = { x: mid.x + mid.w + margin, y: panelY, w: conveyorW, h: panelH };

    const slotGapX = Math.max(10, home.w * 0.025);
    const slotGapY = Math.max(16, home.h * 0.08);
    const slotW = (home.w - slotGapX * 6) / 5;
    const slotH = Math.min((home.h - slotGapY * 3) / 2, slotW * 0.96);
    const startY = home.y + (home.h - slotH * 2 - slotGapY) / 2;
    const slots = [];
    for (let i = 0; i < cfg.maxSlots; i += 1) {
      const row = i < 5 ? 0 : 1;
      const col = i % 5;
      const x = home.x + slotGapX + col * (slotW + slotGapX);
      const y = startY + row * (slotH + slotGapY);
      slots.push({ x, y, w: slotW, h: slotH, cx: x + slotW / 2, cy: y + slotH / 2 });
    }

    layout = {
      w, h, margin, home, mid, conveyor, slots,
      header: { x: margin, y: safeTop, w: w - margin * 2, h: 48 },
      joystick: {
        x: Math.max(86, w * 0.1),
        y: h - Math.max(86, h * 0.16),
        radius: 54
      }
    };

    if (!game.joystick.active) {
      game.joystick.baseX = layout.joystick.x;
      game.joystick.baseY = layout.joystick.y;
      game.joystick.knobX = layout.joystick.x;
      game.joystick.knobY = layout.joystick.y;
      game.joystick.radius = layout.joystick.radius;
    }

    game.player.x = clamp(game.player.x, home.x + 22, mid.x + mid.w - 22);
    game.player.y = clamp(game.player.y, panelY + 22, panelY + panelH - 22);
    rebuildConveyorPositions(false);
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
        y: 0
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
          y: 0
        });
      }
      game.conveyorNextTemplateIndex = (cfg.conveyorVisibleCount + 1) % cfg.brainrots.length;
    }
  }

  function rebuildConveyorPositions(keepRatios) {
    if (!layout || !game.conveyorItems.length) return;
    const conv = layout.conveyor;
    const spacing = conv.h / cfg.conveyorVisibleCount;
    for (const item of game.conveyorItems) {
      if (!keepRatios && !Number.isFinite(item.yRatio)) item.yRatio = 0;
      item.x = conv.x + conv.w / 2;
      item.y = conv.y + item.yRatio * conv.h;
      item.hitSize = Math.min(cfg.conveyorItemSize, conv.w * 0.58, spacing * 0.74);
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

  function canUseSlot(slot) {
    return slot && !slot.reserved && !slot.templateId;
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

    const from = { x: item.x, y: item.y };
    const to = { x: layout.mid.x + layout.mid.w / 2, y: layout.mid.y + layout.mid.h / 2 };
    game.purchaseAnimations.push({
      templateId: template.id,
      slotIndex: targetSlot.index,
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      t: 0,
      duration: cfg.purchaseAnimDuration
    });

    item.empty = true;
    item.templateId = null;
    showToast('购买成功：' + template.name);
    addFloatText('-' + money(template.price), from.x, from.y - 22, '#ffdf5e');
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
    game.player.x += dx * cfg.playerSpeed * dt;
    game.player.y += dy * cfg.playerSpeed * dt;

    const bounds = {
      left: layout.home.x + 18,
      right: layout.mid.x + layout.mid.w - 18,
      top: layout.home.y + 18,
      bottom: layout.home.y + layout.home.h - 18
    };
    game.player.x = clamp(game.player.x, bounds.left, bounds.right);
    game.player.y = clamp(game.player.y, bounds.top, bounds.bottom);
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
          addFloatText('+' + money(gained), rect.cx, rect.cy - 24, '#78ff75');
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
    drawBackground(w, h);
    drawHeader();
    drawPanels();
    drawSlots();
    drawMidArea();
    drawConveyor();
    drawPurchaseAnimations();
    drawPlayer();
    drawJoystick();
    drawFloatingTexts();
    if (debugVisible) drawDebug();
  }

  function drawBackground(w, h) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#251150');
    g.addColorStop(0.48, '#12082a');
    g.addColorStop(1, '#07030d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.1;
    for (let x = -40; x < w; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 280, h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHeader() {
    const r = layout.header;
    roundRect(r.x, r.y, r.w, r.h, 18, 'rgba(0,0,0,0.42)', 'rgba(255,255,255,0.12)', 2);
    drawText('脑腐传送带 MVP', r.x + 22, r.y + 31, 22, '#ffffff', 'left', '900');
    drawPill(r.x + 250, r.y + 9, 160, 30, '金币：' + money(game.coins), '#ffe45f', '#332300');
    drawText('WASD/方向键也可移动 · 点击右侧脑腐购买 · 靠近格子自动收钱', r.x + r.w - 18, r.y + 30, 15, '#d9d2ff', 'right', '700');
  }

  function drawPanels() {
    drawArea(layout.home, '我的家', '#2d145f', '#6734bd');
    drawArea(layout.mid, '收集区域', '#102d4f', '#26a9ff');
    drawArea(layout.conveyor, '传送带', '#3d1c14', '#ffb347');
  }

  function drawArea(rect, title, fill, stroke) {
    roundRect(rect.x, rect.y, rect.w, rect.h, 26, fill, stroke, 3);
    drawText(title, rect.x + 20, rect.y + 30, 20, '#fff', 'left', '900');
  }

  function drawSlots() {
    for (let i = 0; i < layout.slots.length; i += 1) {
      const rect = layout.slots[i];
      const slot = game.slots[i];
      const hasCoins = slot.coins > 0.5;
      let fill = slot.templateId ? '#201236' : '#161126';
      if (slot.reserved) fill = '#2d2d40';
      roundRect(rect.x, rect.y, rect.w, rect.h, 18, fill, hasCoins ? '#ffe45f' : '#7c61bd', hasCoins ? 4 : 2);

      drawText(String(i + 1), rect.x + 10, rect.y + 20, 14, '#bca9ff', 'left', '800');

      if (slot.templateId) {
        drawBrainrot(getTemplate(slot.templateId), rect.cx, rect.cy - 8, Math.min(rect.w, rect.h) * 0.46, false);
        const template = getTemplate(slot.templateId);
        drawText(template.name, rect.cx, rect.y + rect.h - 28, 13, '#ffffff', 'center', '900');
        drawText('+' + money(template.incomePerSecond) + '/秒', rect.cx, rect.y + rect.h - 11, 12, '#9fffd0', 'center', '800');
      } else if (slot.reserved) {
        drawText('运输中', rect.cx, rect.cy, 16, '#d9d9ff', 'center', '900');
      } else {
        drawText('空位', rect.cx, rect.cy, 16, '#766a9c', 'center', '900');
      }

      if (hasCoins) {
        drawCoinBubble(rect.cx, rect.y - 6, money(slot.coins));
      }
    }
  }

  function drawMidArea() {
    const m = layout.mid;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#76d7ff';
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 14]);
    ctx.beginPath();
    ctx.moveTo(m.x + 24, m.y + m.h / 2);
    ctx.lineTo(m.x + m.w - 24, m.y + m.h / 2);
    ctx.stroke();
    ctx.restore();
    drawText('购买后先飞到这里，再入库', m.x + m.w / 2, m.y + m.h / 2 + 40, 15, '#a8e8ff', 'center', '800');
  }

  function drawConveyor() {
    const conv = layout.conveyor;
    const beltX = conv.x + conv.w * 0.5;
    const beltW = Math.min(116, conv.w * 0.62);
    roundRect(beltX - beltW / 2, conv.y + 48, beltW, conv.h - 76, 22, '#24100b', '#b86e22', 4);

    ctx.save();
    ctx.beginPath();
    ctx.rect(conv.x, conv.y + 44, conv.w, conv.h - 54);
    ctx.clip();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#ffd58a';
    ctx.lineWidth = 3;
    for (let y = conv.y - 80; y < conv.y + conv.h + 120; y += 42) {
      ctx.beginPath();
      ctx.moveTo(beltX - beltW / 2 + 10, y + ((performance.now() / 28) % 42));
      ctx.lineTo(beltX + beltW / 2 - 10, y + 20 + ((performance.now() / 28) % 42));
      ctx.stroke();
    }
    ctx.restore();

    const sorted = [...game.conveyorItems].sort((a, b) => a.y - b.y);
    for (const item of sorted) {
      if (item.y < conv.y + 42 || item.y > conv.y + conv.h - 8) continue;
      if (item.empty || !item.templateId) {
        drawText('空', item.x, item.y + 4, 14, 'rgba(255,255,255,0.28)', 'center', '900');
        continue;
      }
      const template = getTemplate(item.templateId);
      drawBrainrot(template, item.x, item.y, item.hitSize / 2, true);
      drawText(template.name, item.x, item.y + item.hitSize / 2 + 18, 13, '#fff', 'center', '900');
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
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
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

  function drawJoystick() {
    const j = game.joystick;
    ctx.save();
    ctx.globalAlpha = j.active ? 0.72 : 0.38;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(j.baseX, j.baseY, j.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = j.active ? 0.88 : 0.55;
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

  function onPointerDown(e) {
    if (!layout || !modalEl.classList.contains('hidden')) return;
    const p = pointerToCanvas(e);
    const js = layout.joystick;
    const isJoystickZone = p.x < layout.w * 0.28 && p.y > layout.h * 0.52;
    if (isJoystickZone) {
      game.joystick.active = true;
      game.joystick.pointerId = e.pointerId;
      game.joystick.baseX = js.x;
      game.joystick.baseY = js.y;
      updateJoystick(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    const conveyorItem = hitConveyorItem(p.x, p.y);
    if (conveyorItem) {
      purchaseConveyorItem(conveyorItem);
      return;
    }

    const slotIndex = hitSlot(p.x, p.y);
    if (slotIndex >= 0) {
      onSlotClick(slotIndex);
    }
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
      if (item.y < layout.conveyor.y + 42 || item.y > layout.conveyor.y + layout.conveyor.h - 8) continue;
      const radius = Math.max(42, item.hitSize * 0.64);
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
      addFloatText('已删除 ' + template.name, rect.cx, rect.cy - 18, '#ff8aa8');
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
    game.player.x = fresh.player.x;
    game.player.y = fresh.player.y;
    game.slots = fresh.slots;
    game.conveyorNextTemplateIndex = fresh.conveyor.nextTemplateIndex;
    game.purchaseAnimations = [];
    game.floatingTexts = [];
    initConveyor();
    rebuildConveyorPositions(true);
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
    showToast('点击右侧脑腐购买，靠近家里格子收钱');
  }

  boot();
})();
