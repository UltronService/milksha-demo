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
   * Whether visible slot chips match the layout for (items, page).
   * @param {NodeListOf<Element> | Element[]} slotEls
   * @param {Array<{ id: string }>} items
   * @param {number} page
   * @param {number} pageSize
   * @param {(items: unknown[], page: number, pageSize: number) => Array<{ id?: string } | null>} layoutPageGrid
   * @returns {boolean}
   */
  function domVisibleLayoutMatches(slotEls, items, page, pageSize, layoutPageGrid) {
    const cells = layoutPageGrid(items, page, pageSize);
    for (let i = 0; i < pageSize; i += 1) {
      const slot = slotEls[i];
      if (!slot) {
        return false;
      }
      const cell = cells[i];
      const expectedId = cell && cell.id ? cell.id : '';
      const chip = slot.querySelector('.milksha-board-chip[data-item-id]');
      const domId = chip ? chip.getAttribute('data-item-id') || '' : '';
      if (domId !== expectedId) {
        return false;
      }
    }
    return true;
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
  function removeOrphanLayerFloatChips(numbersLayer) {
    if (!numbersLayer || typeof numbersLayer.querySelectorAll !== 'function') {
      return;
    }
    const floats = numbersLayer.querySelectorAll('.milksha-board-chip--layer-float');
    for (let i = 0; i < floats.length; i += 1) {
      const chip = floats[i];
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
   * @param {Element} numbersLayer
   */
  function abortColumnMoveLayerState(numbersLayer) {
    if (!numbersLayer) {
      return;
    }
    if (numbersLayer.getAttribute('data-column-move-anim') === '1') {
      numbersLayer.removeAttribute('data-column-move-anim');
    }
    const exitClones = numbersLayer.querySelectorAll('[data-column-move-exit-clone="1"]');
    for (let ec = 0; ec < exitClones.length; ec += 1) {
      const clone = exitClones[ec];
      cancelElementAnimations(clone);
      if (clone.parentNode) {
        clone.parentNode.removeChild(clone);
      }
    }
    const inCellChips = numbersLayer.querySelectorAll(
      '.milksha-num-cell .milksha-board-chip:not(.milksha-board-chip--layer-float)',
    );
    for (let ci = 0; ci < inCellChips.length; ci += 1) {
      clearMotionStyles(inCellChips[ci]);
    }
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
  const SLOT_MOVE_EPSILON_PX = 2;

  /**
   * @param {number} slot
   * @returns {number}
   */
  function slotColumnIndex(slot) {
    return slot < GRID_ROWS ? 0 : 1;
  }

  /**
   * @param {number} fromSlot
   * @param {number} toSlot
   * @returns {boolean}
   */
  function isCrossColumnSlotMove(fromSlot, toSlot) {
    if (!Number.isFinite(fromSlot) || !Number.isFinite(toSlot) || fromSlot < 0 || toSlot < 0) {
      return false;
    }
    return slotColumnIndex(fromSlot) !== slotColumnIndex(toSlot);
  }

  /**
   * @param {number} dx
   * @param {number} dy
   * @returns {boolean}
   */
  function isDiagonalLayoutDelta(dx, dy) {
    return (
      Math.abs(dx) > SLOT_MOVE_EPSILON_PX &&
      Math.abs(dy) > SLOT_MOVE_EPSILON_PX
    );
  }

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
  function detectRightBottomPageOverflowPlan(prevItems, nextItems, page, pageSize, layoutPageGrid, diff) {
    if (diff.added.length !== 1 || diff.removed.length !== 1) {
      return null;
    }
    const prevN = countVisibleOnPage(prevItems, page, pageSize, layoutPageGrid);
    const nextN = countVisibleOnPage(nextItems, page, pageSize, layoutPageGrid);
    if (prevN !== 10 || nextN !== 10 || nextItems.length !== prevItems.length + 1) {
      return null;
    }
    const prevCells = layoutPageGrid(prevItems, page, pageSize);
    const exitCell = prevCells[pageSize - 1];
    const exitId = exitCell && exitCell.id ? exitCell.id : '';
    if (!exitId || diff.removed[0] !== exitId) {
      return null;
    }
    const nextMap = visibleIdToSlot(nextItems, page, pageSize, layoutPageGrid);
    const addedId = diff.added[0];
    const enterSlot = nextMap.get(addedId);
    return {
      kind: 'right-bottom-page-two',
      addedId: addedId,
      enterSlot: enterSlot === undefined ? -1 : enterSlot,
      rightBottomSlot: pageSize - 1,
      exitId: exitId,
    };
  }

  function detectColumnMovePlan(prevItems, nextItems, page, pageSize, layoutPageGrid, diff) {
    if (diff.pageTurn) {
      return null;
    }
    const overflowPlan = detectRightBottomPageOverflowPlan(
      prevItems,
      nextItems,
      page,
      pageSize,
      layoutPageGrid,
      diff,
    );
    if (overflowPlan) {
      return overflowPlan;
    }
    if (diff.removed.length > 0) {
      return null;
    }
    const prevN = countVisibleOnPage(prevItems, page, pageSize, layoutPageGrid);
    const nextN = countVisibleOnPage(nextItems, page, pageSize, layoutPageGrid);
    if (diff.added.length !== 1) {
      return null;
    }
    const addedId = diff.added[0];
    const prevMap = visibleIdToSlot(prevItems, page, pageSize, layoutPageGrid);
    const nextMap = visibleIdToSlot(nextItems, page, pageSize, layoutPageGrid);
    const enterSlot = nextMap.get(addedId);
    if (enterSlot === undefined) {
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
    if (prevN === 5 && nextN === 6) {
      const nextCells = layoutPageGrid(nextItems, page, pageSize);
      const occupant = nextCells[GRID_ROWS];
      if (occupant && occupant.id) {
        return {
          kind: 'right-column-fade-in',
          focusId: occupant.id,
          enterSlot: GRID_ROWS,
        };
      }
    }
    return null;
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

  function animateTranslate(el, dx, dy, durationMs, generation, getGeneration) {
    if (!el || !el.animate || (dx === 0 && dy === 0)) {
      el.style.transform = '';
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
   *   renderChipInnerHtml?: (cell: { id?: string, sourceKey?: string, number?: string }) => string,
   *   chipClassForCell?: (cell: { id?: string, sourceKey?: string, number?: string }) => string,
   * }} deps
   */
  function createBoardAnimator(deps) {
    let generation = 0;
    let opacityAnimRuns = 0;

    /**
     * @param {{ id?: string, sourceKey?: string, number?: string }} cell
     * @returns {string}
     */
    function chipClassForCell(cell) {
      if (deps.chipClassForCell) {
        return deps.chipClassForCell(cell);
      }
      return 'milksha-board-chip';
    }

    /**
     * @param {{ id?: string, sourceKey?: string, number?: string }} cell
     * @returns {string}
     */
    function chipInnerHtml(cell) {
      if (deps.renderChipInnerHtml) {
        return deps.renderChipInnerHtml(cell);
      }
      if (!cell || !cell.number) {
        return '';
      }
      return '<span class="milksha-num">' + cell.number + '</span>';
    }

    /**
     * @param {Element} chip
     * @param {{ id?: string, sourceKey?: string, number?: string }} cell
     */
    function fillChipElement(chip, cell) {
      chip.className = chipClassForCell(cell);
      chip.innerHTML = chipInnerHtml(cell);
    }

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
        abortColumnMoveLayerState(layers[j]);
        abortPageTurnLayerState(layers[j]);
        removeOrphanLayerFloatChips(layers[j]);
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
        cancelElementAnimations(other);
        clearMotionStyles(other);
        if (other.parentNode) {
          other.parentNode.removeChild(other);
        }
        pendingRemove.delete(other);
      }
    }

    function scheduleChipFadeOutRemove(chip, numbersLayer, gen, opacityInMs, promises, pendingRemove) {
      if (!chip || pendingRemove.has(chip)) {
        return;
      }
      pendingRemove.add(chip);
      detachChipFromSlotForFade(chip, numbersLayer);
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
      promises.push(
        runOpacityAnim(chip, from, 0, opacityInMs, gen).then(function () {
          if (timeoutId !== null && deps.window.clearTimeout) {
            deps.window.clearTimeout(timeoutId);
          }
          if (chip.parentNode) {
            chip.parentNode.removeChild(chip);
          }
          pendingRemove.delete(chip);
        }),
      );
    }

    /**
     * @param {Element} numbersLayer
     * @param {NodeListOf<Element> | Element[]} slotEls
     * @param {Array<{ id?: string, number?: string } | null>} cells
     * @param {Record<string, Element>} chipById
     */
    function settleInterruptedPageTurn(numbersLayer, slotEls, cells) {
      numbersLayer.removeAttribute('data-page-turn-anim');
      hardRebuildSlotsFromCells(numbersLayer, slotEls, cells, {});
      snapOpacity(numbersLayer, 1);
    }

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
        chip.className = chipClassForCell(cell);
        chip.setAttribute('data-item-id', id);
        chip.innerHTML = chipInnerHtml(cell);
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
      const prevVisibleSlotMap = visibleIdToSlot(
        prevItems,
        prevPage,
        deps.pageSize,
        deps.layoutPageGrid,
      );
      const pageTurn = Boolean(opts.pageTurn) || diff.pageTurn;
      const cells = deps.layoutPageGrid(items, page, deps.pageSize);
      const slotEls = numbersLayer.querySelectorAll('.milksha-num-cell');

      if (slotEls.length !== deps.pageSize) {
        return Promise.resolve();
      }

      const interruptedPageTurn =
        numbersLayer.getAttribute('data-page-turn-anim') === '1' && !pageTurn;
      removeOrphanLayerFloatChips(numbersLayer);

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

      if (interruptedPageTurn) {
        abortColumnMoveLayerState(numbersLayer);
        abortPageTurnLayerState(numbersLayer);
        hardRebuildSlotsFromCells(numbersLayer, slotEls, cells, chipById);
        return Promise.resolve();
      }

      if (pageTurn && numbersLayer.getAttribute('data-page-turn-anim') === '1') {
        hardRebuildSlotsFromCells(numbersLayer, slotEls, cells, chipById);
      }

      if (pageTurn) {
        abortColumnMoveLayerState(numbersLayer);
      }
      abortPageTurnLayerState(numbersLayer);

      if (
        pageTurn &&
        !domVisibleLayoutMatches(
          slotEls,
          items,
          page,
          deps.pageSize,
          deps.layoutPageGrid,
        ) &&
        !domVisibleLayoutMatches(
          slotEls,
          prevItems,
          prevPage,
          deps.pageSize,
          deps.layoutPageGrid,
        )
      ) {
        hardRebuildSlotsFromCells(numbersLayer, slotEls, cells, chipById);
        snapOpacity(numbersLayer, 1);
        return Promise.resolve();
      }

      let columnMovePlan = detectColumnMovePlan(
        prevItems,
        items,
        page,
        deps.pageSize,
        deps.layoutPageGrid,
        diff,
      );
      if (!columnMovePlan && !pageTurn && items.length === prevItems.length + 1) {
        const fallbackOverflow = detectRightBottomPageOverflowPlan(
          prevItems,
          items,
          page,
          deps.pageSize,
          deps.layoutPageGrid,
          diff,
        );
        if (fallbackOverflow) {
          columnMovePlan = fallbackOverflow;
        }
      }
      const columnMoveEnterFromAboveIds = {};
      const columnMoveFadeInPlaceIds = {};
      const columnMoveSkipFlipIds = {};
      let columnMoveDurationMs = opacityInMs;
      const enterDurationMs =
        typeof animCfg.columnMoveEnterMs === 'number' && animCfg.columnMoveEnterMs > 0
          ? animCfg.columnMoveEnterMs
          : opacityInMs;
      const useColumnMoveTwoPhase = Boolean(animCfg.columnMoveTwoPhase) && Boolean(columnMovePlan);
      const phaseMoveThunks = [];
      const phaseEnterThunks = [];
      function runAnimThunks(thunks) {
        if (!thunks.length) {
          return Promise.resolve();
        }
        return Promise.all(
          thunks.map(function (startAnim) {
            return startAnim();
          }),
        );
      }
      function animQueue(phase, startAnim) {
        if (!startAnim) {
          return;
        }
        if (useColumnMoveTwoPhase && phase === 'move') {
          phaseMoveThunks.push(startAnim);
          return;
        }
        if (useColumnMoveTwoPhase && phase === 'enter') {
          phaseEnterThunks.push(startAnim);
          return;
        }
        promises.push(startAnim());
      }
      function columnMoveEnterAnim(startAnim) {
        if (useColumnMoveTwoPhase) {
          animQueue('enter', startAnim);
          return;
        }
        promises.push(startAnim());
      }
      function isPhaseTwoEnterHoldId(id) {
        if (!useColumnMoveTwoPhase || !id || !columnMovePlan) {
          return false;
        }
        if (columnMoveFadeInPlaceIds[id] || columnMoveEnterFromAboveIds[id]) {
          return true;
        }
        if (columnMovePlan.addedId && id === columnMovePlan.addedId) {
          return true;
        }
        if (columnMovePlan.focusId && id === columnMovePlan.focusId) {
          return true;
        }
        return false;
      }
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
        if (columnMovePlan.kind === 'left-column-overflow') {
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
            animQueue('move', function () {
              return animateColumnMoveSlideDownOut(
                exitClone,
                numbersLayer,
                pitch,
                columnMoveDurationMs,
                gen,
                getGeneration,
                runOpacityAnim,
              );
            });
          }
          if (pushedId) {
            columnMoveFadeInPlaceIds[pushedId] = true;
            columnMoveSkipFlipIds[pushedId] = true;
            delete rectsBefore[pushedId];
          }
          for (let cmi = 0; cmi < diff.moved.length; cmi += 1) {
            const mvCol = diff.moved[cmi];
            columnMoveSkipFlipIds[mvCol.id] = true;
            if (isCrossColumnSlotMove(mvCol.from, mvCol.to)) {
              columnMoveFadeInPlaceIds[mvCol.id] = true;
              delete rectsBefore[mvCol.id];
            }
          }
        } else if (columnMovePlan.kind === 'right-column-fade-in') {
          const focusId = columnMovePlan.focusId;
          columnMoveFadeInPlaceIds[focusId] = true;
          columnMoveSkipFlipIds[focusId] = true;
          delete rectsBefore[focusId];
          for (let rfi = 0; rfi < diff.moved.length; rfi += 1) {
            const mvFade = diff.moved[rfi];
            if (mvFade.to === GRID_ROWS) {
              columnMoveFadeInPlaceIds[mvFade.id] = true;
              columnMoveSkipFlipIds[mvFade.id] = true;
              delete rectsBefore[mvFade.id];
            }
          }
          for (let rfa = 0; rfa < diff.added.length; rfa += 1) {
            delete rectsBefore[diff.added[rfa]];
          }
          if (page > 0) {
            for (let rfm = 0; rfm < diff.moved.length; rfm += 1) {
              delete rectsBefore[diff.moved[rfm].id];
            }
          }
        } else if (columnMovePlan.kind === 'right-bottom-page-two') {
          const rbSlot = columnMovePlan.rightBottomSlot;
          const prevCells = deps.layoutPageGrid(prevItems, page, deps.pageSize);
          const rbCell = prevCells[rbSlot];
          const rbId = rbCell && rbCell.id ? rbCell.id : null;
          if (rbId && chipById[rbId]) {
            const rbChip = chipById[rbId];
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
            animQueue('move', function () {
              return animateColumnMoveSlideDownOut(
                rbClone,
                numbersLayer,
                pitch,
                columnMoveDurationMs,
                gen,
                getGeneration,
                runOpacityAnim,
              );
            });
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
        if (zoneKey === 'ready' && pulseIds.length > 0 && !skipReadyScale) {
          hardRebuildSlotsFromCells(numbersLayer, slotEls, cells, chipById);
          snapOpacity(numbersLayer, 1);
          numbersLayer.removeAttribute('data-page-turn-anim');
          const readyJumpPulses = [];
          for (let rpi = 0; rpi < pulseIds.length; rpi += 1) {
            const readyPulseId = pulseIds[rpi];
            if (!scalePulseSet[readyPulseId]) {
              continue;
            }
            const readyPulseChip = numbersLayer.querySelector(
              '.milksha-board-chip[data-item-id="' + readyPulseId + '"]',
            );
            if (readyPulseChip) {
              readyJumpPulses.push(runReadyPulseAnim(readyPulseChip, numbersLayer, gen));
            }
          }
          return Promise.all(readyJumpPulses);
        }
        removeOrphanLayerFloatChips(numbersLayer);
        const domShowsPrevPage = domVisibleLayoutMatches(
          slotEls,
          prevItems,
          prevPage,
          deps.pageSize,
          deps.layoutPageGrid,
        );
        if (!domShowsPrevPage) {
          hardRebuildSlotsFromCells(numbersLayer, slotEls, cells, chipById);
          snapOpacity(numbersLayer, 1);
          return Promise.resolve();
        }
        numbersLayer.setAttribute('data-page-turn-anim', '1');
        promises.push(
          runOpacityAnim(numbersLayer, 1, 0, pageDurationMs / 2, gen).then(function () {
            if (getGeneration() !== gen) {
              settleInterruptedPageTurn(numbersLayer, slotEls, cells);
              return;
            }
            removeOrphanLayerFloatChips(numbersLayer);
            for (let i = 0; i < deps.pageSize; i += 1) {
              const slot = slotEls[i];
              slot.innerHTML = '';
              const cell = cells[i];
              if (cell && cell.number) {
                const chip = deps.document.createElement('div');
                fillChipElement(chip, cell);
                chip.setAttribute('data-item-id', cell.id || '');
                slot.appendChild(chip);
              }
            }
            snapOpacity(numbersLayer, 0);
            return runOpacityAnim(numbersLayer, 0, 1, pageDurationMs / 2, gen).then(function () {
              if (getGeneration() !== gen) {
                settleInterruptedPageTurn(numbersLayer, slotEls, cells);
                return;
              }
              numbersLayer.removeAttribute('data-page-turn-anim');
              if (zoneKey === 'ready' && !skipReadyScale && pulseIds.length > 0) {
                const pulsePromises = [];
                for (let pxi = 0; pxi < pulseIds.length; pxi += 1) {
                  const pulseId = pulseIds[pxi];
                  if (!scalePulseSet[pulseId]) {
                    continue;
                  }
                  const pulseChip = numbersLayer.querySelector(
                    '.milksha-board-chip[data-item-id="' + pulseId + '"]',
                  );
                  if (pulseChip) {
                    pulsePromises.push(runReadyPulseAnim(pulseChip, numbersLayer, gen));
                  }
                }
                return Promise.all(pulsePromises);
              }
            });
          }),
        );
        return Promise.all(promises);
      }

      const movedIdSet = {};
      for (let mi = 0; mi < diff.moved.length; mi += 1) {
        movedIdSet[diff.moved[mi].id] = true;
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
            scheduleChipFadeOutRemove(slotChip, numbersLayer, gen, opacityInMs, promises, pendingRemove);
          }
        }
      }

      diff.removed.forEach(function (id) {
        if (
          columnMovePlan &&
          columnMovePlan.kind === 'right-bottom-page-two' &&
          columnMovePlan.exitId &&
          id === columnMovePlan.exitId
        ) {
          return;
        }
        const chip = chipById[id];
        if (!chip || pendingRemove.has(chip)) {
          return;
        }
        scheduleChipFadeOutRemove(chip, numbersLayer, gen, opacityInMs, promises, pendingRemove);
      });

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
          const fromSlotReparent = prevVisibleSlotMap.get(id);
          if (fromSlotReparent !== undefined && isCrossColumnSlotMove(fromSlotReparent, i)) {
            columnMoveFadeInPlaceIds[id] = true;
            columnMoveSkipFlipIds[id] = true;
            delete rectsBefore[id];
          } else if (!prevVisibleSlotMap.has(id)) {
            columnMoveFadeInPlaceIds[id] = true;
            columnMoveSkipFlipIds[id] = true;
            delete rectsBefore[id];
          }
          slot.appendChild(chip);
          if (columnMoveFadeInPlaceIds[id]) {
            chip.style.transform = '';
            snapOpacity(chip, 0);
            columnMoveEnterAnim(function () {
              return runOpacityAnim(chip, 0, 1, enterDurationMs, gen);
            });
          } else if (columnMoveEnterFromAboveIds[id]) {
            snapOpacity(chip, 0);
            const pitchMoved = estimateRowPitchPx(slot, numbersLayer);
            columnMoveEnterAnim(function () {
              return animateColumnMoveEnterFromAbove(
                chip,
                pitchMoved,
                columnMoveDurationMs,
                gen,
                getGeneration,
              );
            });
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
          fillChipElement(chip, cell);
          chip.setAttribute('data-item-id', id);
          snapOpacity(chip, 0);
          evictDuplicateItemIdChips(boardRoot, id, chip, numbersLayer, gen, opacityInMs, promises, pendingRemove);
          slot.appendChild(chip);
          notePerf('chip-dom', { id: id });
          chipById[id] = chip;
          if (columnMoveFadeInPlaceIds[id]) {
            chip.style.transform = '';
            columnMoveEnterAnim(function () {
              return runOpacityAnim(chip, 0, 1, enterDurationMs, gen);
            });
          } else if (columnMoveEnterFromAboveIds[id]) {
            snapOpacity(chip, 0);
            const pitchIn = estimateRowPitchPx(slot, numbersLayer);
            columnMoveEnterAnim(function () {
              return animateColumnMoveEnterFromAbove(chip, pitchIn, columnMoveDurationMs, gen, getGeneration);
            });
          } else if (
            zoneKey === 'ready' &&
            !skipReadyScale &&
            columnMovePlan &&
            columnMovePlan.kind === 'left-column-overflow' &&
            id === columnMovePlan.addedId
          ) {
            columnMoveEnterAnim(function () {
              return runReadyPulseAnim(chip, numbersLayer, gen);
            });
          } else if (zoneKey === 'ready' && scalePulseSet[id] && !skipReadyScale) {
            if (useColumnMoveTwoPhase && columnMovePlan) {
              columnMoveEnterAnim(function () {
                return runReadyPulseAnim(chip, numbersLayer, gen);
              });
            } else {
              promises.push(runReadyPulseAnim(chip, numbersLayer, gen));
            }
          } else if (useColumnMoveTwoPhase && columnMovePlan) {
            columnMoveEnterAnim(function () {
              return runOpacityAnim(chip, 0, 1, enterDurationMs, gen);
            });
          } else {
            promises.push(runOpacityAnim(chip, 0, 1, opacityInMs, gen));
          }
        }
      }

      const afterLayout = function () {
        if (columnMovePlan) {
          removeOrphanLayerFloatChips(numbersLayer);
          const holdChips = numbersLayer.querySelectorAll(
            '.milksha-num-cell .milksha-board-chip:not(.milksha-board-chip--layer-float)',
          );
          for (let hi = 0; hi < holdChips.length; hi += 1) {
            const holdChip = holdChips[hi];
            const holdId = holdChip.getAttribute('data-item-id');
            if (pendingRemove.has(holdChip) || (holdId && isPhaseTwoEnterHoldId(holdId))) {
              continue;
            }
            ensureVisibleOpacity(holdChip);
          }
        }
        diff.moved.forEach(function (mv) {
          const chip = chipById[mv.id];
          if (!chip || pendingRemove.has(chip)) {
            return;
          }
          if (columnMoveEnterFromAboveIds[mv.id]) {
            return;
          }
          const moveDurationMs = columnMovePlan ? columnMoveDurationMs : opacityInMs;
          if (columnMoveFadeInPlaceIds[mv.id] || isCrossColumnSlotMove(mv.from, mv.to)) {
            chip.style.transform = '';
            snapOpacity(chip, 0);
            columnMoveEnterAnim(function () {
              return runOpacityAnim(chip, 0, 1, enterDurationMs, gen);
            });
            return;
          }
          const before = rectsBefore[mv.id];
          if (!before) {
            return;
          }
          const after = chip.getBoundingClientRect();
          const dx = before.left - after.left;
          const dy = before.top - after.top;
          if (Math.abs(dx) < SLOT_MOVE_EPSILON_PX && Math.abs(dy) < SLOT_MOVE_EPSILON_PX) {
            return;
          }
          if (isDiagonalLayoutDelta(dx, dy)) {
            chip.style.transform = '';
            snapOpacity(chip, 0);
            columnMoveEnterAnim(function () {
              return runOpacityAnim(chip, 0, 1, enterDurationMs, gen);
            });
            return;
          }
          animQueue('move', function () {
            return animateTranslate(chip, 0, dy, moveDurationMs, gen, getGeneration);
          });
        });
      };

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

      function finishColumnMoveAnimWindow() {
        if (!columnMovePlan) {
          return;
        }
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
          if (settledId && columnMoveFadeInPlaceIds[settledId]) {
            snapOpacity(settled, 1);
            settled.style.transform = '';
          } else if (settledId && columnMoveEnterFromAboveIds[settledId]) {
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

      function runPhasedColumnMoveChain() {
        const cfgNow = getAnimConfig();
        const gapMs =
          typeof cfgNow.columnMovePhaseGapMs === 'number' && cfgNow.columnMovePhaseGapMs >= 0
            ? cfgNow.columnMovePhaseGapMs
            : 0;
        let chain = Promise.all(promises).then(function () {
          return runAnimThunks(phaseMoveThunks);
        });
        if (useColumnMoveTwoPhase) {
          chain = chain
            .then(function () {
              if (gapMs <= 0) {
                return undefined;
              }
              return new Promise(function (resolveGap) {
                deps.window.setTimeout(resolveGap, gapMs);
              });
            })
            .then(function () {
              return runAnimThunks(phaseEnterThunks);
            });
        }
        return chain.then(finishColumnMoveAnimWindow);
      }

      return Promise.all([]).then(function () {
        return new Promise(function (resolve) {
          deps.window.requestAnimationFrame(function () {
            afterLayout();
            runPhasedColumnMoveChain().then(function () {
              resolve();
            });
          });
        });
      });
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
    countVisibleOnPage: countVisibleOnPage,
    GRID_ROWS: GRID_ROWS,
    slotColumnIndex: slotColumnIndex,
    isCrossColumnSlotMove: isCrossColumnSlotMove,
    isDiagonalLayoutDelta: isDiagonalLayoutDelta,
    isBulkSnapshotReplace: isBulkSnapshotReplace,
    shouldSkipBoardAnimations: shouldSkipBoardAnimations,
    createBoardAnimator: createBoardAnimator,
  };
})(typeof window !== 'undefined' ? window : globalThis);
