/**
 * Milksha board list diff + FLIP / opacity animations (board-only).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const BULK_SNAPSHOT_MIN_ITEMS = 6;

  function getAnimConfig() {
    const cfgMod = QMS.MilkshaBoardAnimConfig;
    if (cfgMod && cfgMod.getConfig) {
      return cfgMod.getConfig();
    }
    return { opacityInMs: 300, pageDurationMs: 500, readyScale: 1.3, readyScaleInMs: 300, readyScaleHoldMs: 3000, readyScaleOutMs: 300 };
  }

  function getEffectiveReadyScale() {
    const cfgMod = QMS.MilkshaBoardAnimConfig;
    if (cfgMod && cfgMod.getEffectiveReadyScale) {
      return cfgMod.getEffectiveReadyScale();
    }
    return { requested: 1.3, effective: 1.3 };
  }
  const BULK_SNAPSHOT_MAX_OVERLAP_RATIO = 0.35;

  /**
   * @param {Array<{ id: string }>} items
   * @param {number} page
   * @param {number} pageSize
   * @param {(items: unknown[], page: number, pageSize: number) => Array<{ id?: string, number?: string } | null>} layoutPageGrid
   * @returns {Map<string, number>}
   */
  function visibleIdToSlot(items, page, pageSize, layoutPageGrid) {
    const cells = layoutPageGrid(items, page, pageSize);
    const map = new Map();
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      if (cell && cell.id) {
        map.set(cell.id, i);
      }
    }
    return map;
  }

  /**
   * @param {Map<string, number>} prevMap
   * @param {Map<string, number>} nextMap
   * @returns {{ added: string[], removed: string[], moved: Array<{ id: string, from: number, to: number }> }}
   */
  function diffSlotMaps(prevMap, nextMap) {
    const added = [];
    const removed = [];
    const moved = [];
    nextMap.forEach(function (toSlot, id) {
      if (!prevMap.has(id)) {
        added.push(id);
        return;
      }
      const fromSlot = prevMap.get(id);
      if (fromSlot !== toSlot) {
        moved.push({ id: id, from: fromSlot, to: toSlot });
      }
    });
    prevMap.forEach(function (_slot, id) {
      if (!nextMap.has(id)) {
        removed.push(id);
      }
    });
    return { added: added, removed: removed, moved: moved };
  }

  /**
   * @param {Array<{ id: string }>} prevItems
   * @param {Array<{ id: string }>} nextItems
   * @param {number} prevPage
   * @param {number} nextPage
   * @param {number} pageSize
   * @param {(items: unknown[], page: number, pageSize: number) => Array<{ id?: string } | null>} layoutPageGrid
   * @returns {{ added: string[], removed: string[], moved: Array<{ id: string, from: number, to: number }>, pageTurn: boolean }}
   */
  function diffVisibleSlots(prevItems, nextItems, prevPage, nextPage, pageSize, layoutPageGrid) {
    const pageTurn = prevPage !== nextPage;
    const prevMap = visibleIdToSlot(prevItems, prevPage, pageSize, layoutPageGrid);
    const nextMap = visibleIdToSlot(nextItems, nextPage, pageSize, layoutPageGrid);
    const core = diffSlotMaps(prevMap, nextMap);
    return {
      added: core.added,
      removed: core.removed,
      moved: core.moved,
      pageTurn: pageTurn,
    };
  }

  /**
   * @param {Array<{ id: string }>} prevItems
   * @param {Array<{ id: string }>} nextItems
   * @returns {boolean}
   */
  function isBulkSnapshotReplace(prevItems, nextItems) {
    const prev = Array.isArray(prevItems) ? prevItems : [];
    const next = Array.isArray(nextItems) ? nextItems : [];
    if (prev.length === 0 || next.length === 0) {
      return false;
    }
    if (prev.length + next.length < BULK_SNAPSHOT_MIN_ITEMS) {
      return false;
    }
    const prevSet = new Set(prev.map(function (e) {
      return e.id;
    }));
    let overlap = 0;
    for (let i = 0; i < next.length; i += 1) {
      if (prevSet.has(next[i].id)) {
        overlap += 1;
      }
    }
    const denom = Math.max(prev.length, next.length);
    return overlap / denom < BULK_SNAPSHOT_MAX_OVERLAP_RATIO;
  }

  /**
   * @param {{
   *   isFirstPayload: boolean,
   *   silentApply: boolean,
   *   forceSnapshotSkip?: boolean,
   *   reduceMotion: boolean,
   *   canUseWebAnimations: boolean,
   *   prevPrep: Array<{ id: string }>,
   *   nextPrep: Array<{ id: string }>,
   *   prevReady: Array<{ id: string }>,
   *   nextReady: Array<{ id: string }>,
   * }} input
   * @returns {{ skip: boolean, reason: string }}
   */
  function shouldSkipBoardAnimations(input) {
    if (input.reduceMotion) {
      return { skip: true, reason: 'prefers-reduced-motion' };
    }
    if (!input.canUseWebAnimations) {
      return { skip: true, reason: 'no-web-animations-api' };
    }
    if (input.isFirstPayload) {
      return { skip: true, reason: 'first-payload' };
    }
    if (input.silentApply) {
      return { skip: true, reason: 'silent-reconnect' };
    }
    if (input.forceSnapshotSkip) {
      return { skip: true, reason: 'snapshot-reload-flag' };
    }
    return { skip: false, reason: 'animate' };
  }

  /**
   * @param {Element} el
   */
  function cancelElementAnimations(el) {
    if (!el || typeof el.getAnimations !== 'function') {
      return;
    }
    const anims = el.getAnimations();
    for (let i = 0; i < anims.length; i += 1) {
      anims[i].cancel();
    }
  }

  /**
   * @param {Element} el
   * @param {number} opacity
   */
  function snapOpacity(el, opacity) {
    if (!el) {
      return;
    }
    cancelElementAnimations(el);
    el.style.opacity = String(opacity);
  }

  /** Set opacity without cancelling WAAPI (e.g. ready pulse on sibling chips during column-move). */
  function ensureVisibleOpacity(el) {
    if (!el) {
      return;
    }
    el.style.opacity = '1';
  }

  /**
   * @param {Element} el
   */
  function clearMotionStyles(el) {
    if (!el) {
      return;
    }
    cancelElementAnimations(el);
    el.style.opacity = '';
    el.style.transform = '';
    el.style.willChange = '';
    el.classList.remove('milksha-board-chip--layer-float');
    el.style.position = '';
    el.style.left = '';
    el.style.top = '';
    el.style.width = '';
    el.style.height = '';
    el.style.pointerEvents = '';
    el.style.visibility = '';
    el.style.transition = '';
    if (el.removeAttribute) {
      el.removeAttribute('data-fade-out');
    }
  }

  /**
   * Reparent a chip onto the numbers layer so its slot can accept a replacement while fade-out runs.
   * @param {Element} chip
   * @param {Element} numbersLayer
   */
  function detachChipFromSlotForFade(chip, numbersLayer) {
    if (!chip || !numbersLayer || chip.parentNode === numbersLayer) {
      return;
    }
    const parent = chip.parentNode;
    if (!parent || !parent.classList || !parent.classList.contains('milksha-num-cell')) {
      return;
    }
    const layerRect = numbersLayer.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    chip.classList.add('milksha-board-chip--layer-float');
    chip.style.position = 'absolute';
    chip.style.left = chipRect.left - layerRect.left + 'px';
    chip.style.top = chipRect.top - layerRect.top + 'px';
    chip.style.width = chipRect.width + 'px';
    chip.style.height = chipRect.height + 'px';
    chip.style.pointerEvents = 'none';
    numbersLayer.appendChild(chip);
  }

  /**
   * @param {Element} numbersLayer
   */
  /**
   * @param {Element} numbersLayer
   * @param {{ includeFadeOut?: boolean }} [opts]
   */
  function removeOrphanLayerFloatChips(numbersLayer, opts) {
    if (!numbersLayer || typeof numbersLayer.querySelectorAll !== 'function') {
      return;
    }
    const includeFadeOut = Boolean(opts && opts.includeFadeOut);
    const floats = numbersLayer.querySelectorAll('.milksha-board-chip--layer-float');
    for (let i = 0; i < floats.length; i += 1) {
      const chip = floats[i];
      if (!includeFadeOut && chip.getAttribute && chip.getAttribute('data-fade-out') === '1') {
        continue;
      }
      if (chip.getAttribute && chip.getAttribute('data-column-move-exit-clone') === '1') {
        continue;
      }
      cancelElementAnimations(chip);
      if (chip.parentNode) {
        chip.parentNode.removeChild(chip);
      }
    }
  }

  /**
   * @param {Element} numbersLayer
   */
  function abortPageTurnLayerState(numbersLayer) {
    if (!numbersLayer) {
      return;
    }
    if (numbersLayer.getAttribute('data-page-turn-anim') === '1') {
      numbersLayer.removeAttribute('data-page-turn-anim');
    }
    cancelElementAnimations(numbersLayer);
    snapOpacity(numbersLayer, 1);
    removeOrphanLayerFloatChips(numbersLayer);
  }

  /**
   * @param {Element} el
   * @param {number} from
   * @param {number} to
   * @param {number} durationMs
   * @param {number} generation
   * @param {() => number} getGeneration
   * @returns {Promise<void>}
   */
  function animateOpacity(el, from, to, durationMs, generation, getGeneration) {
    if (!el || !el.animate) {
      snapOpacity(el, to);
      return Promise.resolve();
    }
    cancelElementAnimations(el);
    el.style.opacity = String(from);
    const anim = el.animate([{ opacity: from }, { opacity: to }], {
      duration: durationMs,
      easing: 'ease-out',
      fill: 'forwards',
    });
    return new Promise(function (resolve) {
      anim.onfinish = function () {
        if (getGeneration() !== generation) {
          snapOpacity(el, to);
          resolve();
          return;
        }
        snapOpacity(el, to);
        resolve();
      };
      anim.oncancel = function () {
        snapOpacity(el, to);
        resolve();
      };
    });
  }

  /**
   * @param {Element} el
   * @param {number} dx
   * @param {number} dy
   * @param {number} durationMs
   * @param {number} generation
   * @param {() => number} getGeneration
   * @returns {Promise<void>}
   */
  /**
   * @param {Element} el
   * @param {number} peakScale
   * @param {number} inMs
   * @param {number} holdMs
   * @param {number} outMs
   * @param {number} generation
   * @param {() => number} getGeneration
   * @returns {Promise<void>}
   */
  function animateReadyPulse(el, peakScale, inMs, holdMs, outMs, generation, getGeneration) {
    if (!el) {
      return Promise.resolve();
    }
    const peak = Math.max(1, peakScale);
    const total = inMs + holdMs + outMs;
    if (!el.animate || total <= 0) {
      snapOpacity(el, 1);
      el.style.transform = '';
      return Promise.resolve();
    }
    cancelElementAnimations(el);
    el.style.transformOrigin = 'center center';
    el.style.opacity = '0';
    el.style.transform = 'scale(1)';
    const inEnd = inMs / total;
    const holdEnd = (inMs + holdMs) / total;
    const anim = el.animate(
      [
        { opacity: 0, transform: 'scale(1)' },
        { opacity: 1, transform: 'scale(' + peak + ')', offset: inEnd },
        { opacity: 1, transform: 'scale(' + peak + ')', offset: holdEnd },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: total, easing: 'ease-out', fill: 'forwards' },
    );
    return new Promise(function (resolve) {
      function snapReadyPulseEndState() {
        snapOpacity(el, 1);
        el.style.transform = '';
      }
      anim.onfinish = function () {
        if (getGeneration() !== generation) {
          snapReadyPulseEndState();
          resolve();
          return;
        }
        snapReadyPulseEndState();
        resolve();
      };
      anim.oncancel = function () {
        snapReadyPulseEndState();
        resolve();
      };
    });
  }

  const GRID_ROWS = 5;

  /**
   * @param {Array<{ id: string }>} items
   * @param {number} page
   * @param {number} pageSize
   * @param {(items: unknown[], page: number, pageSize: number) => Array<{ id?: string } | null>} layoutPageGrid
   */
  function countVisibleOnPage(items, page, pageSize, layoutPageGrid) {
    const cells = layoutPageGrid(items, page, pageSize);
    let n = 0;
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i] && cells[i].id) {
        n += 1;
      }
    }
    return n;
  }

  /**
   * @param {Array<{ id: string }>} prevItems
   * @param {Array<{ id: string }>} nextItems
   * @param {number} page
   * @param {number} pageSize
   * @param {(items: unknown[], page: number, pageSize: number) => Array<{ id?: string } | null>} layoutPageGrid
   * @param {{ added: string[], removed: string[], moved: Array<{ id: string, from: number, to: number }>, pageTurn: boolean }} diff
   * @returns {null | { kind: string, addedId: string, pushedId?: string, enterSlot: number, leftBottomSlot?: number, rightTopSlot?: number, rightBottomSlot?: number }}
   */
  function detectColumnMovePlan(prevItems, nextItems, page, pageSize, layoutPageGrid, diff) {
    if (diff.pageTurn || diff.removed.length > 0) {
      return null;
    }
    const prevN = countVisibleOnPage(prevItems, page, pageSize, layoutPageGrid);
    const nextN = countVisibleOnPage(nextItems, page, pageSize, layoutPageGrid);
    if (prevN === 10 && nextN === 10 && nextItems.length === 11) {
      const nextMapEarly = visibleIdToSlot(nextItems, page, pageSize, layoutPageGrid);
      const addedIdOverflow = diff.added.length === 1 ? diff.added[0] : '';
      const enterSlotOverflow = addedIdOverflow ? nextMapEarly.get(addedIdOverflow) : -1;
      return {
        kind: 'right-bottom-page-two',
        addedId: addedIdOverflow,
        enterSlot: enterSlotOverflow === undefined ? -1 : enterSlotOverflow,
        rightBottomSlot: pageSize - 1,
      };
    }
    if (diff.added.length !== 1) {
      return null;
    }
    const addedId = diff.added[0];
    const prevMap = visibleIdToSlot(prevItems, page, pageSize, layoutPageGrid);
    const nextMap = visibleIdToSlot(nextItems, page, pageSize, layoutPageGrid);
    const enterSlot = nextMap.get(addedId);
    if (enterSlot === undefined) {
      if (prevN === 10 && nextItems.length === 11) {
        return {
          kind: 'right-bottom-page-two',
          addedId: addedId,
          enterSlot: -1,
          rightBottomSlot: pageSize - 1,
        };
      }
      return null;
    }
    if (nextN !== prevN + 1) {
      return null;
    }
    if (prevN >= 5 && prevN <= 9 && enterSlot === 0) {
      const prevCells = layoutPageGrid(prevItems, page, pageSize);
      const lbCell = prevCells[GRID_ROWS - 1];
      const pushedId = lbCell && lbCell.id ? lbCell.id : null;
      if (!pushedId) {
        return null;
      }
      const pushedFrom = prevMap.get(pushedId);
      const pushedTo = nextMap.get(pushedId);
      if (pushedFrom === GRID_ROWS - 1 && pushedTo === GRID_ROWS) {
        return {
          kind: 'left-column-overflow',
          addedId: addedId,
          pushedId: pushedId,
          enterSlot: 0,
          leftBottomSlot: GRID_ROWS - 1,
          rightTopSlot: GRID_ROWS,
        };
      }
      return null;
    }
    return null;
  }

  /**
   * Left-column removal: right-top backfills left-bottom (vertical staged move).
   * @param {Array<{ id: string }>} prevItems
   * @param {Array<{ id: string }>} nextItems
   * @param {number} page
   * @param {number} pageSize
   * @param {(items: unknown[], page: number, pageSize: number) => Array<{ id?: string } | null>} layoutPageGrid
   * @param {{ added: string[], removed: string[], moved: Array<{ id: string, from: number, to: number }>, pageTurn: boolean }} diff
   * @returns {null | { kind: 'left-column-backfill-removal', removedId: string, backfillId: string, pageTwoFadeInId: string | null, rightTopSlot: number, leftBottomSlot: number }}
   */
  function detectLeftColumnBackfillRemovalPlan(prevItems, nextItems, page, pageSize, layoutPageGrid, diff) {
    if (diff.pageTurn || diff.removed.length !== 1) {
      return null;
    }
    if (diff.added.length > 1) {
      return null;
    }
    const removedId = diff.removed[0];
    const prevMap = visibleIdToSlot(prevItems, page, pageSize, layoutPageGrid);
    const nextMap = visibleIdToSlot(nextItems, page, pageSize, layoutPageGrid);
    const removedFrom = prevMap.get(removedId);
    if (removedFrom === undefined || removedFrom >= GRID_ROWS) {
      return null;
    }
    let backfillId = null;
    prevMap.forEach(function (fromSlot, id) {
      const toSlot = nextMap.get(id);
      if (fromSlot === GRID_ROWS && toSlot === GRID_ROWS - 1) {
        backfillId = id;
      }
    });
    if (!backfillId) {
      return null;
    }
    const pageTwoFadeInId = diff.added.length === 1 ? diff.added[0] : null;
    return {
      kind: 'left-column-backfill-removal',
      removedId: removedId,
      backfillId: backfillId,
      pageTwoFadeInId: pageTwoFadeInId,
      rightTopSlot: GRID_ROWS,
      leftBottomSlot: GRID_ROWS - 1,
    };
  }

  /**
   * @param {Element} slotEl
   * @param {Element} numbersLayer
   */
  function estimateRowPitchPx(slotEl, numbersLayer) {
    if (!slotEl || !slotEl.getBoundingClientRect) {
      return 72;
    }
    const layer = numbersLayer && numbersLayer.querySelectorAll ? numbersLayer : null;
    const cells = layer ? layer.querySelectorAll('.milksha-num-cell') : null;
    if (cells && cells.length >= GRID_ROWS + 1) {
      const a = cells[GRID_ROWS - 1].getBoundingClientRect();
      const b = cells[GRID_ROWS].getBoundingClientRect();
      const pitch = Math.abs(b.top - a.top);
      if (pitch > 8) {
        return pitch;
      }
    }
    const rect = slotEl.getBoundingClientRect();
    return rect.height > 8 ? rect.height : 72;
  }

  /**
   * @param {Element} chip
   * @param {Element} numbersLayer
   * @param {number} dyOut
   * @param {number} durationMs
   * @param {number} generation
   * @param {() => number} getGeneration
   * @param {(el: Element, from: number, to: number, ms: number, gen: number) => Promise<void>} runOpacityAnimFn
   */
  function animateColumnMoveSlideDownOut(chip, numbersLayer, dyOut, durationMs, generation, getGeneration, runOpacityAnimFn) {
    if (!chip || !numbersLayer) {
      return Promise.resolve();
    }
    detachChipFromSlotForFade(chip, numbersLayer);
    const dy = Math.max(24, dyOut);
    chip.style.transform = 'translate(0px, 0px)';
    const movePromise =
      chip.animate && durationMs > 0
        ? new Promise(function (resolve) {
            const anim = chip.animate(
              [
                { transform: 'translate(0px, 0px)', opacity: 1 },
                { transform: 'translate(0px, ' + dy + 'px)', opacity: 0 },
              ],
              { duration: durationMs, easing: 'ease-in', fill: 'forwards' },
            );
            anim.onfinish = function () {
              resolve();
            };
            anim.oncancel = function () {
              resolve();
            };
          })
        : runOpacityAnimFn(chip, 1, 0, durationMs, generation);
    return movePromise.then(function () {
      if (getGeneration() !== generation) {
        return;
      }
      if (chip.parentNode) {
        chip.parentNode.removeChild(chip);
      }
      clearMotionStyles(chip);
    });
  }

  /**
   * @param {Element} chip
   * @param {Element} numbersLayer
   * @param {number} dyOut magnitude (upward)
   * @param {number} durationMs
   * @param {number} generation
   * @param {() => number} getGeneration
   * @param {(el: Element, from: number, to: number, ms: number, gen: number) => Promise<void>} runOpacityAnimFn
   */
  function animateColumnMoveSlideUpOut(chip, numbersLayer, dyOut, durationMs, generation, getGeneration, runOpacityAnimFn) {
    if (!chip || !numbersLayer) {
      return Promise.resolve();
    }
    detachChipFromSlotForFade(chip, numbersLayer);
    const dy = -Math.max(24, dyOut);
    chip.style.transform = 'translate(0px, 0px)';
    const movePromise =
      chip.animate && durationMs > 0
        ? new Promise(function (resolve) {
            const anim = chip.animate(
              [
                { transform: 'translate(0px, 0px)', opacity: 1 },
                { transform: 'translate(0px, ' + dy + 'px)', opacity: 0 },
              ],
              { duration: durationMs, easing: 'ease-in', fill: 'forwards' },
            );
            anim.onfinish = function () {
              resolve();
            };
            anim.oncancel = function () {
              resolve();
            };
          })
        : runOpacityAnimFn(chip, 1, 0, durationMs, generation);
    return movePromise.then(function () {
      if (getGeneration() !== generation) {
        return;
      }
      if (chip.parentNode) {
        chip.parentNode.removeChild(chip);
      }
      clearMotionStyles(chip);
    });
  }

  /**
   * @param {Element} chip
   * @param {number} dyIn
   * @param {number} durationMs
   * @param {number} generation
   * @param {() => number} getGeneration
   */
  function animateColumnMoveEnterFromAbove(chip, dyIn, durationMs, generation, getGeneration) {
    if (!chip) {
      return Promise.resolve();
    }
    const dy = -Math.max(24, dyIn);
    if (!chip.animate || durationMs <= 0) {
      snapOpacity(chip, 1);
      chip.style.transform = '';
      return Promise.resolve();
    }
    cancelElementAnimations(chip);
    chip.style.opacity = '1';
    chip.style.transform = 'translate(0px, ' + dy + 'px)';
    const anim = chip.animate(
      [{ transform: 'translate(0px, ' + dy + 'px)' }, { transform: 'translate(0px, 0px)' }],
      { duration: durationMs, easing: 'ease-out', fill: 'forwards' },
    );
    return new Promise(function (resolve) {
      anim.onfinish = function () {
        if (getGeneration() !== generation) {
          resolve();
          return;
        }
        chip.style.transform = '';
        resolve();
      };
      anim.oncancel = function () {
        resolve();
      };
    });
  }

  /**
   * @param {Element} chip
   * @param {number} dyIn positive = start below cell
   * @param {number} durationMs
   * @param {number} generation
   * @param {() => number} getGeneration
   */
  function animateColumnMoveEnterFromBelow(chip, dyIn, durationMs, generation, getGeneration) {
    if (!chip) {
      return Promise.resolve();
    }
    chip.style.visibility = 'visible';
    const dy = Math.max(24, dyIn);
    if (!chip.animate || durationMs <= 0) {
      snapOpacity(chip, 1);
      chip.style.transform = '';
      return Promise.resolve();
    }
    cancelElementAnimations(chip);
    chip.style.opacity = '1';
    chip.style.transform = 'translate(0px, ' + dy + 'px)';
    const anim = chip.animate(
      [{ transform: 'translate(0px, ' + dy + 'px)' }, { transform: 'translate(0px, 0px)' }],
      { duration: durationMs, easing: 'ease-out', fill: 'forwards' },
    );
    return new Promise(function (resolve) {
      anim.onfinish = function () {
        if (getGeneration() !== generation) {
          resolve();
          return;
        }
        chip.style.transform = '';
        resolve();
      };
      anim.oncancel = function () {
        resolve();
      };
    });
  }

  function animateTranslate(el, dx, dy, durationMs, generation, getGeneration) {
    if (!el || !el.animate || (dx === 0 && dy === 0)) {
      if (el) {
        el.style.transform = '';
      }
      return Promise.resolve();
    }
    if (el.getAttribute && el.getAttribute('data-fade-out') === '1') {
      return Promise.resolve();
    }
    cancelElementAnimations(el);
    const from = 'translate(' + dx + 'px,' + dy + 'px)';
    el.style.transform = from;
    const anim = el.animate(
      [{ transform: from }, { transform: 'translate(0px,0px)' }],
      { duration: durationMs, easing: 'ease-out', fill: 'forwards' },
    );
    return new Promise(function (resolve) {
      anim.onfinish = function () {
        if (getGeneration() !== generation) {
          resolve();
          return;
        }
        el.style.transform = '';
        resolve();
      };
      anim.oncancel = function () {
        resolve();
      };
    });
  }

  /**
   * @param {{
   *   document: Document,
   *   window: Window,
   *   pageSize: number,
   *   layoutPageGrid: (items: unknown[], page: number, pageSize: number) => Array<{ id?: string, number?: string } | null>,
   *   pageCountForItems: (count: number, pageSize: number) => number,
   * }} deps
   */
  function createBoardAnimator(deps) {
    let generation = 0;
    let opacityAnimRuns = 0;

    function bumpGeneration() {
      generation += 1;
      return generation;
    }

    function getGeneration() {
      return generation;
    }

    function notePerf(event, detail) {
      const win = deps.window;
      if (!win || !win.__milkshaBoardPerfEvents) {
        return;
      }
      const perf = win.performance;
      const t = perf && typeof perf.now === 'function' ? perf.now() : Date.now();
      win.__milkshaBoardPerfEvents.push({ t: t, event: event, detail: detail || {} });
    }

    function runOpacityAnim(el, from, to, durationMs, gen) {
      opacityAnimRuns += 1;
      if (el && el.getAttribute) {
        const id = el.getAttribute('data-item-id');
        if (id) {
          notePerf('opacity-anim-start', { id: id, from: from, to: to });
        }
      }
      return animateOpacity(el, from, to, durationMs, gen, getGeneration);
    }

    function runReadyPulseAnim(el, numbersLayer, gen) {
      opacityAnimRuns += 1;
      const cfg = getAnimConfig();
      const scaleInfo = getEffectiveReadyScale();
      const peak = scaleInfo.effective;
      if (el && el.getAttribute) {
        const id = el.getAttribute('data-item-id');
        if (id) {
          notePerf('ready-pulse-start', { id: id, peak: peak, requested: scaleInfo.requested });
        }
      }
      return animateReadyPulse(
        el,
        peak,
        cfg.readyScaleInMs,
        cfg.readyScaleHoldMs,
        cfg.readyScaleOutMs,
        gen,
        getGeneration,
      );
    }

    function cancelAll(boardEl) {
      bumpGeneration();
      if (!boardEl || typeof boardEl.querySelectorAll !== 'function') {
        return;
      }
      const layers = boardEl.querySelectorAll('.milksha-zone-numbers');
      for (let j = 0; j < layers.length; j += 1) {
        abortPageTurnLayerState(layers[j]);
        removeOrphanLayerFloatChips(layers[j], { includeFadeOut: true });
        clearMotionStyles(layers[j]);
      }
      const chips = boardEl.querySelectorAll('.milksha-board-chip');
      for (let i = 0; i < chips.length; i += 1) {
        clearMotionStyles(chips[i]);
      }
    }

    /**
     * @param {Element} chip
     * @param {Element} numbersLayer
     * @param {number} gen
     * @param {number} opacityInMs
     * @param {Array<Promise<void>>} promises
     * @param {Set<Element>} pendingRemove
     */
    /**
     * @param {Element} boardRoot
     * @param {string} id
     * @param {Element | null} keepChip
     * @param {Element} numbersLayer
     * @param {number} gen
     * @param {number} opacityInMs
     * @param {Array<Promise<void>>} promises
     * @param {Set<Element>} pendingRemove
     */
    function evictDuplicateItemIdChips(
      boardRoot,
      id,
      keepChip,
      numbersLayer,
      gen,
      opacityInMs,
      promises,
      pendingRemove,
    ) {
      if (!boardRoot || !id) {
        return;
      }
      const all = boardRoot.querySelectorAll('.milksha-board-chip[data-item-id]');
      for (let i = 0; i < all.length; i += 1) {
        const other = all[i];
        if (other.getAttribute('data-item-id') !== id) {
          continue;
        }
        if (keepChip && other === keepChip) {
          continue;
        }
        if (other.getAttribute && other.getAttribute('data-fade-out') === '1') {
          continue;
        }
        cancelElementAnimations(other);
        clearMotionStyles(other);
        if (other.parentNode) {
          other.parentNode.removeChild(other);
        }
        pendingRemove.delete(other);
      }
    }

    /**
     * @param {{ cssInPlace?: boolean }} [opts] cssInPlace: CSS opacity transition (FLIP-safe) for removed chips
     * @returns {Promise<void> | undefined}
     */
    function scheduleChipFadeOutRemove(chip, numbersLayer, gen, opacityInMs, promises, pendingRemove, opts) {
      if (!chip || pendingRemove.has(chip)) {
        return undefined;
      }
      const cssInPlace = Boolean(opts && opts.cssInPlace);
      pendingRemove.add(chip);
      detachChipFromSlotForFade(chip, numbersLayer);
      if (cssInPlace) {
        chip.setAttribute('data-fade-out', '1');
        cancelElementAnimations(chip);
        chip.style.transition = 'opacity ' + opacityInMs + 'ms ease-out';
        chip.style.opacity = '1';
        if (chip.offsetHeight) {
          /* reflow so transition runs */
        }
        chip.style.opacity = '0';
        opacityAnimRuns += 1;
        const fadeDone = new Promise(function (resolve) {
          const finishFadeRemove = function () {
            if (chip.parentNode) {
              chip.parentNode.removeChild(chip);
            }
            chip.removeAttribute('data-fade-out');
            chip.style.transition = '';
            chip.style.opacity = '';
            pendingRemove.delete(chip);
            resolve();
          };
          if (deps.window && typeof deps.window.setTimeout === 'function') {
            deps.window.setTimeout(finishFadeRemove, opacityInMs + 40);
          } else {
            finishFadeRemove();
          }
        });
        promises.push(fadeDone);
        return fadeDone;
      }
      const fromOpacity = Number.parseFloat(chip.style.opacity);
      const from = Number.isFinite(fromOpacity) ? fromOpacity : 1;
      let timeoutId = null;
      if (deps.window && typeof deps.window.setTimeout === 'function') {
        timeoutId = deps.window.setTimeout(function () {
          if (chip.parentNode) {
            chip.parentNode.removeChild(chip);
          }
          pendingRemove.delete(chip);
        }, opacityInMs + 200);
      }
      const fadeDone = runOpacityAnim(chip, from, 0, opacityInMs, gen).then(function () {
        if (timeoutId !== null && deps.window.clearTimeout) {
          deps.window.clearTimeout(timeoutId);
        }
        if (chip.parentNode) {
          chip.parentNode.removeChild(chip);
        }
        pendingRemove.delete(chip);
      });
      promises.push(fadeDone);
      return fadeDone;
    }

    /**
     * @param {Element} chip
     * @param {number} opacityInMs
     * @param {Promise<void>[]} promises
     */
    function scheduleChipCssFadeIn(chip, opacityInMs, promises) {
      if (!chip) {
        return;
      }
      snapOpacity(chip, 0);
      cancelElementAnimations(chip);
      chip.style.visibility = 'visible';
      chip.style.transition = 'opacity ' + opacityInMs + 'ms ease-out';
      chip.style.opacity = '0';
      if (chip.offsetHeight) {
        /* reflow */
      }
      chip.style.opacity = '1';
      opacityAnimRuns += 1;
      promises.push(
        new Promise(function (resolve) {
          const done = function () {
            chip.style.transition = '';
            snapOpacity(chip, 1);
            resolve();
          };
          if (deps.window && typeof deps.window.setTimeout === 'function') {
            deps.window.setTimeout(done, opacityInMs + 40);
          } else {
            done();
          }
        }),
      );
    }

    /**
     * @param {Element} numbersLayer
     * @param {NodeListOf<Element> | Element[]} slotEls
     * @param {Array<{ id?: string, number?: string } | null>} cells
     * @param {Record<string, Element>} chipById
     */
    function hardRebuildSlotsFromCells(numbersLayer, slotEls, cells, chipById) {
      abortPageTurnLayerState(numbersLayer);
      removeOrphanLayerFloatChips(numbersLayer);
      for (let i = 0; i < deps.pageSize; i += 1) {
        const slot = slotEls[i];
        slot.innerHTML = '';
        const cell = cells[i];
        if (!cell || !cell.number) {
          continue;
        }
        const id = cell.id || '';
        const chip = deps.document.createElement('div');
        chip.className = 'milksha-board-chip';
        chip.setAttribute('data-item-id', id);
        chip.innerHTML = '<span class="milksha-num">' + cell.number + '</span>';
        snapOpacity(chip, 1);
        slot.appendChild(chip);
        if (id) {
          chipById[id] = chip;
        }
      }
    }

    /**
     * @param {Element} zoneEl
     * @param {'prep' | 'ready'} zoneKey
     * @param {Array<{ id: string, number: string }>} items
     * @param {number} page
     * @param {{
     *   pageTurn?: boolean,
     *   clearAll?: boolean,
     *   scalePulseIds?: string[],
     *   skipReadyScale?: boolean,
     *   prevItems: Array<{ id: string, number: string }>,
     *   prevPage: number,
     * }} opts
     */
    function syncZone(zoneEl, zoneKey, items, page, opts) {
      const animCfg = getAnimConfig();
      const opacityInMs = animCfg.opacityInMs;
      const pageDurationMs = animCfg.pageDurationMs;
      const gen = bumpGeneration();
      const numbersLayer = zoneEl.querySelector('.milksha-zone-numbers');
      const scalePulseSet = {};
      const pulseIds = opts.scalePulseIds || [];
      for (let pi = 0; pi < pulseIds.length; pi += 1) {
        scalePulseSet[pulseIds[pi]] = true;
      }
      const skipReadyScale = Boolean(opts.skipReadyScale);
      const boardRoot =
        zoneEl && typeof zoneEl.closest === 'function'
          ? zoneEl.closest('.milksha-board') || zoneEl
          : zoneEl;
      if (!numbersLayer) {
        return Promise.resolve();
      }
      const prevItems = opts.prevItems || [];
      const prevPage = opts.prevPage || 0;
      const diff = diffVisibleSlots(prevItems, items, prevPage, page, deps.pageSize, deps.layoutPageGrid);
      const pageTurn = Boolean(opts.pageTurn) || diff.pageTurn;
      const cells = deps.layoutPageGrid(items, page, deps.pageSize);
      const slotEls = numbersLayer.querySelectorAll('.milksha-num-cell');

      if (slotEls.length !== deps.pageSize) {
        return Promise.resolve();
      }

      const interruptedPageTurn =
        numbersLayer.getAttribute('data-page-turn-anim') === '1' && !pageTurn;
      removeOrphanLayerFloatChips(numbersLayer);

      numbersLayer.querySelectorAll('.milksha-board-chip[data-item-id]').forEach(function (chip) {
        if (chip.getAttribute && chip.getAttribute('data-fade-out') === '1') {
          return;
        }
        chip.style.visibility = '';
        chip.style.transition = '';
      });

      const chipById = {};
      const rectsBefore = {};
      numbersLayer.querySelectorAll('.milksha-board-chip[data-item-id]').forEach(function (chip) {
        const id = chip.getAttribute('data-item-id');
        if (!id) {
          return;
        }
        chipById[id] = chip;
        rectsBefore[id] = chip.getBoundingClientRect();
      });

      const promises = [];
      const pendingRemove = new Set();
      /** @type {Promise<void>[]} */
      const removedFadeWaiters = [];

      if (interruptedPageTurn) {
        hardRebuildSlotsFromCells(numbersLayer, slotEls, cells, chipById);
        return Promise.resolve();
      }

      if (pageTurn && numbersLayer.getAttribute('data-page-turn-anim') === '1') {
        hardRebuildSlotsFromCells(numbersLayer, slotEls, cells, chipById);
      }

      abortPageTurnLayerState(numbersLayer);

      const removedIdSet = {};
      for (let rdi = 0; rdi < diff.removed.length; rdi += 1) {
        removedIdSet[diff.removed[rdi]] = true;
      }

      let columnMovePlan = detectColumnMovePlan(
        prevItems,
        items,
        page,
        deps.pageSize,
        deps.layoutPageGrid,
        diff,
      );
      const backfillRemovalPlan = detectLeftColumnBackfillRemovalPlan(
        prevItems,
        items,
        page,
        deps.pageSize,
        deps.layoutPageGrid,
        diff,
      );
      if (backfillRemovalPlan) {
        columnMovePlan = backfillRemovalPlan;
      }
      if (
        !columnMovePlan &&
        page === 0 &&
        items.length === 11 &&
        prevItems.length === 10 &&
        !pageTurn
      ) {
        columnMovePlan = {
          kind: 'right-bottom-page-two',
          addedId: '',
          enterSlot: -1,
          rightBottomSlot: deps.pageSize - 1,
        };
      }
      const columnMoveEnterFromAboveIds = {};
      const columnMoveEnterFromBelowIds = {};
      const columnMoveSkipFlipIds = {};
      const pageTwoFadeInIds = {};
      /** @type {null | { chip: Element, pitch: number }} */
      let deferredBackfillEnterFromBelow = null;
      /** @type {Promise<void>} */
      let backfillExitClonePromise = Promise.resolve();
      let columnMoveDurationMs = opacityInMs;
      if (columnMovePlan) {
        if (zoneKey === 'ready' && columnMovePlan.addedId) {
          scalePulseSet[columnMovePlan.addedId] = true;
        }
        columnMoveDurationMs =
          typeof animCfg.columnMoveMs === 'number' && animCfg.columnMoveMs > 0
            ? animCfg.columnMoveMs
            : opacityInMs;
        numbersLayer.setAttribute('data-column-move-anim', '1');
        const pitch = estimateRowPitchPx(slotEls[GRID_ROWS - 1] || slotEls[0], numbersLayer);
        if (columnMovePlan.kind === 'left-column-backfill-removal') {
          const backfillId = columnMovePlan.backfillId;
          const deferBackfillMotion = diff.removed.length > 0;
          if (deferBackfillMotion && backfillId && chipById[backfillId]) {
            snapOpacity(chipById[backfillId], 0);
            chipById[backfillId].style.visibility = 'hidden';
          }
          if (!deferBackfillMotion) {
            const rtSlot = columnMovePlan.rightTopSlot;
            const prevCellsBf = deps.layoutPageGrid(prevItems, page, deps.pageSize);
            const rtCell = prevCellsBf[rtSlot];
            const rtId = rtCell && rtCell.id ? rtCell.id : backfillId;
            if (rtId && chipById[rtId]) {
              const rtChip = chipById[rtId];
              const rtRect = rtChip.getBoundingClientRect();
              const layerRectRt = numbersLayer.getBoundingClientRect();
              const exitClone = rtChip.cloneNode(true);
              exitClone.removeAttribute('data-item-id');
              exitClone.setAttribute('data-column-move-exit-clone', '1');
              exitClone.classList.add('milksha-board-chip--layer-float');
              exitClone.style.position = 'absolute';
              exitClone.style.left = rtRect.left - layerRectRt.left + 'px';
              exitClone.style.top = rtRect.top - layerRectRt.top + 'px';
              exitClone.style.width = rtRect.width + 'px';
              exitClone.style.height = rtRect.height + 'px';
              exitClone.style.pointerEvents = 'none';
              snapOpacity(exitClone, 1);
              numbersLayer.appendChild(exitClone);
              promises.push(
                animateColumnMoveSlideUpOut(
                  exitClone,
                  numbersLayer,
                  pitch,
                  columnMoveDurationMs,
                  gen,
                  getGeneration,
                  runOpacityAnim,
                ),
              );
            }
            if (backfillId && chipById[backfillId]) {
              snapOpacity(chipById[backfillId], 0);
            }
          }
          if (backfillId) {
            columnMoveEnterFromBelowIds[backfillId] = true;
            columnMoveSkipFlipIds[backfillId] = true;
          }
          if (columnMovePlan.pageTwoFadeInId) {
            columnMoveSkipFlipIds[columnMovePlan.pageTwoFadeInId] = true;
            pageTwoFadeInIds[columnMovePlan.pageTwoFadeInId] = true;
          }
          for (let bmi = 0; bmi < diff.moved.length; bmi += 1) {
            columnMoveSkipFlipIds[diff.moved[bmi].id] = true;
          }
        } else if (columnMovePlan.kind === 'left-column-overflow') {
          const pushedId = columnMovePlan.pushedId;
          const lbSlot = columnMovePlan.leftBottomSlot;
          const lbCell = deps.layoutPageGrid(prevItems, page, deps.pageSize)[lbSlot];
          const lbId = lbCell && lbCell.id ? lbCell.id : pushedId;
          if (lbId && chipById[lbId]) {
            const lbChip = chipById[lbId];
            const lbRect = lbChip.getBoundingClientRect();
            const layerRect = numbersLayer.getBoundingClientRect();
            const exitClone = lbChip.cloneNode(true);
            exitClone.removeAttribute('data-item-id');
            exitClone.setAttribute('data-column-move-exit-clone', '1');
            exitClone.classList.add('milksha-board-chip--layer-float');
            exitClone.style.position = 'absolute';
            exitClone.style.left = lbRect.left - layerRect.left + 'px';
            exitClone.style.top = lbRect.top - layerRect.top + 'px';
            exitClone.style.width = lbRect.width + 'px';
            exitClone.style.height = lbRect.height + 'px';
            exitClone.style.pointerEvents = 'none';
            snapOpacity(exitClone, 1);
            numbersLayer.appendChild(exitClone);
            promises.push(
              animateColumnMoveSlideDownOut(
                exitClone,
                numbersLayer,
                pitch,
                columnMoveDurationMs,
                gen,
                getGeneration,
                runOpacityAnim,
              ),
            );
          }
          if (pushedId) {
            columnMoveEnterFromAboveIds[pushedId] = true;
            columnMoveSkipFlipIds[pushedId] = true;
          }
          for (let cmi = 0; cmi < diff.moved.length; cmi += 1) {
            columnMoveSkipFlipIds[diff.moved[cmi].id] = true;
          }
        } else if (columnMovePlan.kind === 'right-bottom-page-two') {
          const rbSlot = columnMovePlan.rightBottomSlot;
          const prevCells = deps.layoutPageGrid(prevItems, page, deps.pageSize);
          const rbCell = prevCells[rbSlot];
          const rbId = rbCell && rbCell.id ? rbCell.id : null;
          if (rbId && chipById[rbId]) {
            const rbChip = chipById[rbId];
            snapOpacity(rbChip, 0);
            const rbRect = rbChip.getBoundingClientRect();
            const layerRectRb = numbersLayer.getBoundingClientRect();
            const rbClone = rbChip.cloneNode(true);
            rbClone.removeAttribute('data-item-id');
            rbClone.setAttribute('data-column-move-exit-clone', '1');
            rbClone.classList.add('milksha-board-chip--layer-float');
            rbClone.style.position = 'absolute';
            rbClone.style.left = rbRect.left - layerRectRb.left + 'px';
            rbClone.style.top = rbRect.top - layerRectRb.top + 'px';
            rbClone.style.width = rbRect.width + 'px';
            rbClone.style.height = rbRect.height + 'px';
            rbClone.style.pointerEvents = 'none';
            snapOpacity(rbClone, 1);
            numbersLayer.appendChild(rbClone);
            promises.push(
              animateColumnMoveSlideDownOut(
                rbClone,
                numbersLayer,
                pitch,
                columnMoveDurationMs,
                gen,
                getGeneration,
                runOpacityAnim,
              ),
            );
          }
        }
      }

      if (opts.clearAll) {
        const existing = numbersLayer.querySelectorAll('.milksha-board-chip');
        for (let c = 0; c < existing.length; c += 1) {
          const chip = existing[c];
          promises.push(
            runOpacityAnim(chip, 1, 0, opacityInMs, gen).then(function () {
              if (chip.parentNode) {
                chip.parentNode.removeChild(chip);
              }
            }),
          );
        }
        return Promise.all(promises);
      }

      if (pageTurn) {
        removeOrphanLayerFloatChips(numbersLayer);
        numbersLayer.setAttribute('data-page-turn-anim', '1');
        promises.push(
          runOpacityAnim(numbersLayer, 1, 0, pageDurationMs / 2, gen).then(function () {
            if (getGeneration() !== gen) {
              numbersLayer.removeAttribute('data-page-turn-anim');
              return;
            }
            removeOrphanLayerFloatChips(numbersLayer);
            for (let i = 0; i < deps.pageSize; i += 1) {
              const slot = slotEls[i];
              slot.innerHTML = '';
              const cell = cells[i];
              if (cell && cell.number) {
                const chip = deps.document.createElement('div');
                chip.className = 'milksha-board-chip';
                chip.setAttribute('data-item-id', cell.id || '');
                chip.innerHTML = '<span class="milksha-num">' + cell.number + '</span>';
                slot.appendChild(chip);
              }
            }
            snapOpacity(numbersLayer, 0);
            return runOpacityAnim(numbersLayer, 0, 1, pageDurationMs / 2, gen).then(function () {
              if (getGeneration() === gen) {
                numbersLayer.removeAttribute('data-page-turn-anim');
              }
            });
          }),
        );
        return Promise.all(promises);
      }

      const movedIdSet = {};
      for (let mi = 0; mi < diff.moved.length; mi += 1) {
        if (!removedIdSet[diff.moved[mi].id]) {
          movedIdSet[diff.moved[mi].id] = true;
        }
      }

      for (let ri = 0; ri < deps.pageSize; ri += 1) {
        const slotReconcile = slotEls[ri];
        const cellReconcile = cells[ri];
        const expectedId = cellReconcile && cellReconcile.id ? cellReconcile.id : null;
        const slotChips = slotReconcile.querySelectorAll('.milksha-board-chip');
        for (let sc = 0; sc < slotChips.length; sc += 1) {
          const slotChip = slotChips[sc];
          const slotChipId = slotChip.getAttribute('data-item-id');
          if (!expectedId || slotChipId !== expectedId) {
            if (slotChipId && movedIdSet[slotChipId]) {
              continue;
            }
            const fadeOpts = slotChipId && removedIdSet[slotChipId] ? { cssInPlace: true } : undefined;
            const fadeP = scheduleChipFadeOutRemove(
              slotChip,
              numbersLayer,
              gen,
              opacityInMs,
              promises,
              pendingRemove,
              fadeOpts,
            );
            if (fadeP && slotChipId && removedIdSet[slotChipId]) {
              removedFadeWaiters.push(fadeP);
            }
          }
        }
      }

      diff.removed.forEach(function (id) {
        const chip = chipById[id];
        if (!chip || pendingRemove.has(chip)) {
          return;
        }
        const fadeP = scheduleChipFadeOutRemove(chip, numbersLayer, gen, opacityInMs, promises, pendingRemove, {
          cssInPlace: true,
        });
        if (fadeP) {
          removedFadeWaiters.push(fadeP);
        }
      });

      function finishZonePlacementAndAnimate() {
        if (
          columnMovePlan &&
          columnMovePlan.kind === 'left-column-backfill-removal' &&
          diff.removed.length > 0
        ) {
          const backfillId = columnMovePlan.backfillId;
          const pitchBf = estimateRowPitchPx(slotEls[GRID_ROWS - 1] || slotEls[0], numbersLayer);
          const rtSlot = columnMovePlan.rightTopSlot;
          const prevCellsBf = deps.layoutPageGrid(prevItems, page, deps.pageSize);
          const rtCell = prevCellsBf[rtSlot];
          const rtId = rtCell && rtCell.id ? rtCell.id : backfillId;
          if (rtId && chipById[rtId]) {
            const rtChip = chipById[rtId];
            const rtRect = rtChip.getBoundingClientRect();
            const layerRectRt = numbersLayer.getBoundingClientRect();
            const exitClone = rtChip.cloneNode(true);
            exitClone.removeAttribute('data-item-id');
            exitClone.setAttribute('data-column-move-exit-clone', '1');
            exitClone.classList.add('milksha-board-chip--layer-float');
            exitClone.style.position = 'absolute';
            exitClone.style.left = rtRect.left - layerRectRt.left + 'px';
            exitClone.style.top = rtRect.top - layerRectRt.top + 'px';
            exitClone.style.width = rtRect.width + 'px';
            exitClone.style.height = rtRect.height + 'px';
            exitClone.style.pointerEvents = 'none';
            snapOpacity(exitClone, 1);
            numbersLayer.appendChild(exitClone);
            snapOpacity(rtChip, 0);
            backfillExitClonePromise = animateColumnMoveSlideUpOut(
              exitClone,
              numbersLayer,
              pitchBf,
              columnMoveDurationMs,
              gen,
              getGeneration,
              runOpacityAnim,
            );
            promises.push(backfillExitClonePromise);
          }
        }
      };

      const runCellPlacementLoop = function () {
      for (let i = 0; i < deps.pageSize; i += 1) {
        const cell = cells[i];
        const slot = slotEls[i];
        if (!cell || !cell.number) {
          continue;
        }
        const id = cell.id;
        let chip = chipById[id];
        if (chip && chip.parentNode !== slot && !pendingRemove.has(chip)) {
          const stray = slot.querySelectorAll('.milksha-board-chip');
          for (let st = 0; st < stray.length; st += 1) {
            if (stray[st] !== chip) {
              const strayId = stray[st].getAttribute('data-item-id');
              if (strayId && movedIdSet[strayId]) {
                continue;
              }
              scheduleChipFadeOutRemove(stray[st], numbersLayer, gen, opacityInMs, promises, pendingRemove);
            }
          }
          evictDuplicateItemIdChips(boardRoot, id, chip, numbersLayer, gen, opacityInMs, promises, pendingRemove);
          slot.appendChild(chip);
          if (columnMoveEnterFromAboveIds[id]) {
            snapOpacity(chip, 0);
            const pitchMoved = estimateRowPitchPx(slot, numbersLayer);
            promises.push(
              animateColumnMoveEnterFromAbove(
                chip,
                pitchMoved,
                columnMoveDurationMs,
                gen,
                getGeneration,
              ),
            );
          } else if (columnMoveEnterFromBelowIds[id]) {
            snapOpacity(chip, 0);
            const pitchBelow = estimateRowPitchPx(slot, numbersLayer);
            if (columnMovePlan && columnMovePlan.kind === 'left-column-backfill-removal' && id === columnMovePlan.backfillId) {
              deferredBackfillEnterFromBelow = { chip: chip, pitch: pitchBelow };
            } else {
              promises.push(
                animateColumnMoveEnterFromBelow(chip, pitchBelow, columnMoveDurationMs, gen, getGeneration),
              );
            }
          } else if (pageTwoFadeInIds[id]) {
            scheduleChipCssFadeIn(chip, opacityInMs, promises);
          }
        }
        if (!chip || pendingRemove.has(chip)) {
          const strayBefore = slot.querySelectorAll('.milksha-board-chip');
          for (let sb = 0; sb < strayBefore.length; sb += 1) {
            const strayId = strayBefore[sb].getAttribute('data-item-id');
            if (strayId && movedIdSet[strayId]) {
              continue;
            }
            scheduleChipFadeOutRemove(strayBefore[sb], numbersLayer, gen, opacityInMs, promises, pendingRemove);
          }
          chip = deps.document.createElement('div');
          chip.className = 'milksha-board-chip';
          chip.setAttribute('data-item-id', id);
          chip.innerHTML = '<span class="milksha-num">' + cell.number + '</span>';
          snapOpacity(chip, 0);
          evictDuplicateItemIdChips(boardRoot, id, chip, numbersLayer, gen, opacityInMs, promises, pendingRemove);
          slot.appendChild(chip);
          notePerf('chip-dom', { id: id });
          chipById[id] = chip;
          if (columnMoveEnterFromAboveIds[id]) {
            snapOpacity(chip, 0);
            const pitchIn = estimateRowPitchPx(slot, numbersLayer);
            promises.push(animateColumnMoveEnterFromAbove(chip, pitchIn, columnMoveDurationMs, gen, getGeneration));
          } else if (columnMoveEnterFromBelowIds[id]) {
            snapOpacity(chip, 0);
            const pitchInBelow = estimateRowPitchPx(slot, numbersLayer);
            if (columnMovePlan && columnMovePlan.kind === 'left-column-backfill-removal' && id === columnMovePlan.backfillId) {
              deferredBackfillEnterFromBelow = { chip: chip, pitch: pitchInBelow };
            } else {
              promises.push(animateColumnMoveEnterFromBelow(chip, pitchInBelow, columnMoveDurationMs, gen, getGeneration));
            }
          } else if (pageTwoFadeInIds[id]) {
            scheduleChipCssFadeIn(chip, opacityInMs, promises);
          } else if (
            zoneKey === 'ready' &&
            !skipReadyScale &&
            columnMovePlan &&
            columnMovePlan.kind === 'left-column-overflow' &&
            id === columnMovePlan.addedId
          ) {
            promises.push(runReadyPulseAnim(chip, numbersLayer, gen));
          } else if (zoneKey === 'ready' && scalePulseSet[id] && !skipReadyScale) {
            promises.push(runReadyPulseAnim(chip, numbersLayer, gen));
          } else {
            promises.push(runOpacityAnim(chip, 0, 1, opacityInMs, gen));
          }
        }
      }
      };

      const afterLayout = function () {
        if (columnMovePlan) {
          removeOrphanLayerFloatChips(numbersLayer);
          const holdChips = numbersLayer.querySelectorAll(
            '.milksha-num-cell .milksha-board-chip:not(.milksha-board-chip--layer-float)',
          );
          for (let hi = 0; hi < holdChips.length; hi += 1) {
            const holdChip = holdChips[hi];
            const holdId = holdChip.getAttribute('data-item-id');
            if (
              pendingRemove.has(holdChip) ||
              (holdId && columnMoveEnterFromAboveIds[holdId]) ||
              (holdId && columnMoveEnterFromBelowIds[holdId]) ||
              (holdId && pageTwoFadeInIds[holdId])
            ) {
              continue;
            }
            ensureVisibleOpacity(holdChip);
          }
        }
        const leftBottomSlot = GRID_ROWS - 1;
        const vacateLeftBottomMoves = [];
        if (columnMovePlan && columnMovePlan.kind === 'left-column-backfill-removal') {
          for (let vmi = 0; vmi < diff.moved.length; vmi += 1) {
            const vm = diff.moved[vmi];
            if (vm.from === leftBottomSlot && vm.to === leftBottomSlot - 1) {
              vacateLeftBottomMoves.push(vm);
            }
          }
        }
        const vacateIdSet = {};
        for (let vi = 0; vi < vacateLeftBottomMoves.length; vi += 1) {
          vacateIdSet[vacateLeftBottomMoves[vi].id] = true;
        }

        const runMovedFlips = function () {
          diff.moved.forEach(function (mv) {
            if (removedIdSet[mv.id]) {
              return;
            }
            const chip = chipById[mv.id];
            if (!chip || pendingRemove.has(chip) || chip.getAttribute('data-fade-out') === '1') {
              return;
            }
            if (columnMoveSkipFlipIds[mv.id]) {
              if (
                columnMoveEnterFromAboveIds[mv.id] ||
                columnMoveEnterFromBelowIds[mv.id] ||
                pageTwoFadeInIds[mv.id]
              ) {
                return;
              }
              const beforeSkipped = rectsBefore[mv.id];
              if (!beforeSkipped) {
                return;
              }
              const afterSkipped = chip.getBoundingClientRect();
              let dxSkipped = beforeSkipped.left - afterSkipped.left;
              const dySkipped = beforeSkipped.top - afterSkipped.top;
              if (Math.abs(dxSkipped) > 2) {
                dxSkipped = 0;
              }
              const hideDuringFlip =
                columnMovePlan && columnMovePlan.kind === 'left-column-backfill-removal';
              if (hideDuringFlip) {
                snapOpacity(chip, 0);
                chip.style.visibility = 'hidden';
              }
              const flipPromise = animateTranslate(
                chip,
                dxSkipped,
                dySkipped,
                columnMoveDurationMs,
                gen,
                getGeneration,
              ).then(function () {
                chip.style.visibility = 'visible';
                snapOpacity(chip, 1);
                chip.style.transform = '';
              });
              if (vacateIdSet[mv.id] && deferredBackfillEnterFromBelow) {
                const deferred = deferredBackfillEnterFromBelow;
                deferredBackfillEnterFromBelow = null;
                promises.push(
                  flipPromise.then(function () {
                    return animateColumnMoveEnterFromBelow(
                      deferred.chip,
                      deferred.pitch,
                      columnMoveDurationMs,
                      gen,
                      getGeneration,
                    );
                  }),
                );
              } else {
                promises.push(flipPromise);
              }
              return;
            }
            const before = rectsBefore[mv.id];
            if (!before) {
              return;
            }
            const after = chip.getBoundingClientRect();
            const dx = before.left - after.left;
            const dy = before.top - after.top;
            promises.push(animateTranslate(chip, dx, dy, opacityInMs, gen, getGeneration));
          });
          if (deferredBackfillEnterFromBelow) {
            const deferredFallback = deferredBackfillEnterFromBelow;
            deferredBackfillEnterFromBelow = null;
            promises.push(
              animateColumnMoveEnterFromBelow(
                deferredFallback.chip,
                deferredFallback.pitch,
                columnMoveDurationMs,
                gen,
                getGeneration,
              ),
            );
          }
        };
        if (columnMovePlan && columnMovePlan.kind === 'left-column-backfill-removal') {
          promises.push(backfillExitClonePromise.then(runMovedFlips));
        } else {
          runMovedFlips();
        }
      };

      const runEmptySlotCleanupAndFlip = function () {
      for (let s = 0; s < deps.pageSize; s += 1) {
        const cellAt = cells[s];
        const slotAt = slotEls[s];
        if (cellAt && cellAt.number) {
          continue;
        }
        const emptyChips = slotAt.querySelectorAll('.milksha-board-chip');
        for (let ec = 0; ec < emptyChips.length; ec += 1) {
          scheduleChipFadeOutRemove(emptyChips[ec], numbersLayer, gen, opacityInMs, promises, pendingRemove);
        }
      }

      return Promise.all([]).then(function () {
        return new Promise(function (resolve) {
          deps.window.requestAnimationFrame(function () {
            afterLayout();
            const tailStart = promises.length;
            const waitTail = function () {
              const tail = promises.slice(tailStart);
              return tail.length > 0 ? Promise.all(tail) : Promise.resolve();
            };
            waitTail().then(function () {
              if (columnMovePlan) {
                removeOrphanLayerFloatChips(numbersLayer);
                const exitClones = numbersLayer.querySelectorAll('[data-column-move-exit-clone="1"]');
                for (let ec = 0; ec < exitClones.length; ec += 1) {
                  const clone = exitClones[ec];
                  if (clone.parentNode) {
                    clone.parentNode.removeChild(clone);
                  }
                }
                const inCellChips = numbersLayer.querySelectorAll(
                  '.milksha-num-cell .milksha-board-chip:not(.milksha-board-chip--layer-float)',
                );
                for (let si = 0; si < inCellChips.length; si += 1) {
                  const settled = inCellChips[si];
                  if (pendingRemove.has(settled)) {
                    continue;
                  }
                  const settledId = settled.getAttribute('data-item-id');
                  if (
                    settledId &&
                    (columnMoveEnterFromAboveIds[settledId] || columnMoveEnterFromBelowIds[settledId])
                  ) {
                    snapOpacity(settled, 1);
                    settled.style.transform = '';
                  } else {
                    ensureVisibleOpacity(settled);
                  }
                }
                if (numbersLayer.getAttribute('data-column-move-anim') === '1') {
                  numbersLayer.removeAttribute('data-column-move-anim');
                }
              }
              resolve();
            });
          });
        });
      });
      };

      const deferPlacementForBackfillExit =
        columnMovePlan &&
        columnMovePlan.kind === 'left-column-backfill-removal' &&
        diff.removed.length > 0;

      const startPlacement = function () {
        if (deferPlacementForBackfillExit) {
          return backfillExitClonePromise.then(function () {
            runCellPlacementLoop();
            return runEmptySlotCleanupAndFlip();
          });
        }
        runCellPlacementLoop();
        return runEmptySlotCleanupAndFlip();
      };

      if (removedFadeWaiters.length > 0) {
        return Promise.all(removedFadeWaiters).then(function () {
          finishZonePlacementAndAnimate();
          return startPlacement();
        });
      }
      finishZonePlacementAndAnimate();
      return startPlacement();
    }

    return {
      cancelAll: cancelAll,
      syncZone: syncZone,
      bumpGeneration: bumpGeneration,
      getGeneration: getGeneration,
      getOpacityAnimRuns: function () {
        return opacityAnimRuns;
      },
      resetOpacityAnimRuns: function () {
        opacityAnimRuns = 0;
      },
      getAnimConfig: getAnimConfig,
    };
  }

  QMS.MilkshaBoardAnim = {
    getAnimConfig: getAnimConfig,
    getEffectiveReadyScale: getEffectiveReadyScale,
    computeSafeReadyScale: function () {
      return getEffectiveReadyScale().effective;
    },
    animateReadyPulse: animateReadyPulse,
    visibleIdToSlot: visibleIdToSlot,
    diffSlotMaps: diffSlotMaps,
    diffVisibleSlots: diffVisibleSlots,
    detectColumnMovePlan: detectColumnMovePlan,
    detectLeftColumnBackfillRemovalPlan: detectLeftColumnBackfillRemovalPlan,
    countVisibleOnPage: countVisibleOnPage,
    GRID_ROWS: GRID_ROWS,
    isBulkSnapshotReplace: isBulkSnapshotReplace,
    shouldSkipBoardAnimations: shouldSkipBoardAnimations,
    createBoardAnimator: createBoardAnimator,
  };
})(typeof window !== 'undefined' ? window : globalThis);
