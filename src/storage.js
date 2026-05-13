(function () {
  const cfg = window.BRAINROT_CONFIG;

  function cloneSlot(slot, index) {
    return {
      index,
      reserved: Boolean(slot && slot.reserved),
      templateId: slot && slot.templateId ? String(slot.templateId) : null,
      coins: Number.isFinite(slot && slot.coins) ? Math.max(0, Number(slot.coins)) : 0
    };
  }

  function getConveyorBrainrotIds() {
    if (Array.isArray(cfg.conveyorBrainrotIds) && cfg.conveyorBrainrotIds.length) {
      return cfg.conveyorBrainrotIds.slice();
    }
    return cfg.brainrots
      .filter((item) => item && item.id && item.id !== cfg.starterTemplateId)
      .map((item) => item.id);
  }

  function createDefaultSlots() {
    const slots = Array.from({ length: cfg.maxSlots }, (_, index) => ({
      index,
      reserved: false,
      templateId: null,
      coins: 0
    }));

    // 默认清档后不再把初始脑腐塞进脑腐槽。
    // 需要恢复“初始白送”时，只要在 config.js 里把 defaultStarterSlotEnabled 改成 true。
    const starterIndex = Number.isFinite(cfg.starterSlotIndex) ? cfg.starterSlotIndex : 0;
    const shouldSeedStarter = cfg.defaultStarterSlotEnabled === true;
    if (shouldSeedStarter && cfg.starterTemplateId && slots[starterIndex]) {
      slots[starterIndex].templateId = cfg.starterTemplateId;
    }

    return slots;
  }

  function createDefaultState() {
    const conveyorIds = getConveyorBrainrotIds();
    return {
      version: 1,
      layoutVersion: null,
      coins: cfg.initialCoins,
      player: { x: 260, y: 320 },
      slots: createDefaultSlots(),
      conveyor: {
        nextTemplateIndex: conveyorIds.length ? cfg.conveyorVisibleCount % conveyorIds.length : 0,
        items: []
      },
      savedAt: Date.now()
    };
  }

  function normalizeState(raw) {
    const fallback = createDefaultState();
    if (!raw || typeof raw !== 'object') return fallback;

    const coins = Number.isFinite(raw.coins) ? Math.max(0, Number(raw.coins)) : fallback.coins;
    const player = raw.player && Number.isFinite(raw.player.x) && Number.isFinite(raw.player.y)
      ? { x: Number(raw.player.x), y: Number(raw.player.y) }
      : fallback.player;

    const slots = Array.from({ length: cfg.maxSlots }, (_, index) => cloneSlot(raw.slots && raw.slots[index], index));
    const conveyorIds = getConveyorBrainrotIds();
    const cycleLength = Math.max(1, conveyorIds.length || cfg.brainrots.length);
    const nextTemplateIndex = raw.conveyor && Number.isFinite(raw.conveyor.nextTemplateIndex)
      ? Math.max(0, Math.floor(raw.conveyor.nextTemplateIndex)) % cycleLength
      : fallback.conveyor.nextTemplateIndex;

    return {
      version: 1,
      layoutVersion: raw.layoutVersion || null,
      coins,
      player,
      slots,
      conveyor: {
        nextTemplateIndex,
        items: Array.isArray(raw.conveyor && raw.conveyor.items) ? raw.conveyor.items : []
      },
      savedAt: Date.now()
    };
  }

  function loadState() {
    try {
      const text = localStorage.getItem(cfg.storageKey);
      if (!text) return createDefaultState();
      return normalizeState(JSON.parse(text));
    } catch (err) {
      console.warn('[BrainrotSave] 存档读取失败，已重置', err);
      localStorage.removeItem(cfg.storageKey);
      return createDefaultState();
    }
  }

  function saveState(state) {
    try {
      const payload = {
        version: 1,
        layoutVersion: state.layoutVersion || null,
        coins: state.coins,
        player: { x: state.player.x, y: state.player.y },
        slots: state.slots.map((slot, index) => ({
          index,
          reserved: Boolean(slot.reserved),
          templateId: slot.templateId,
          coins: Math.max(0, Number(slot.coins) || 0)
        })),
        conveyor: {
          nextTemplateIndex: state.conveyorNextTemplateIndex,
          items: state.conveyorItems.map((item) => ({
            templateId: item.templateId,
            empty: item.empty,
            yRatio: item.yRatio
          }))
        },
        savedAt: Date.now()
      };
      localStorage.setItem(cfg.storageKey, JSON.stringify(payload));
    } catch (err) {
      console.warn('[BrainrotSave] 存档写入失败', err);
    }
  }

  function resetState() {
    localStorage.removeItem(cfg.storageKey);
    return createDefaultState();
  }

  window.BrainrotStorage = {
    createDefaultState,
    loadState,
    saveState,
    resetState
  };
})();
