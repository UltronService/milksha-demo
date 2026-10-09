/**
 * Milksha board list diff + FLIP / opacity animations (board-only).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const DURATION_MS = 300;
  const PAGE_DURATION_MS = 500;
  const READY_HIGHLIGHT_MS = 3000;
  const BULK_SNAPSHOT_MIN_ITEMS = 6;
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
          resolve();
          return;
        }
        snapOpacity(el, to);
        resolve();
      };
      anim.oncancel = function () {
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
   * }} deps
   */
  function createBoardAnimator(deps) {
    let generation = 0;
    let opacityAnimRuns = 0;
    const highlightTimers = {};

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

    function clearChipHighlight(chip) {
      if (!chip) {
        return;
      }
      chip.classList.remove('milksha-board-chip--highlight', 'milksha-board-chip--unhighlighting');
    }

    function cancelZoneHighlights(zoneEl) {
      if (!zoneEl) {
        return;
      }
      const chips = zoneEl.querySelectorAll('.milksha-board-chip--highlight, .milksha-board-chip--unhighlighting');
      for (let i = 0; i < chips.length; i += 1) {
        clearChipHighlight(chips[i]);
      }
    }

    /**
     * @param {Element} chip
     * @param {string} timerKey
     */
    function scheduleReadyHighlight(chip, timerKey) {
      if (!chip) {
        return;
      }
      clearChipHighlight(chip);
      chip.classList.add('milksha-board-chip--highlight');
      if (highlightTimers[timerKey]) {
        clearTimeout(highlightTimers[timerKey]);
        delete highlightTimers[timerKey];
      }
      highlightTimers[timerKey] = setTimeout(function () {
        delete highlightTimers[timerKey];
        if (!chip.isConnected) {
          return;
        }
        chip.classList.add('milksha-board-chip--unhighlighting');
        let cleared = false;
        const finish = function () {
          if (cleared) {
            return;
          }
          cleared = true;
          chip.removeEventListener('transitionend', onEnd);
          clearChipHighlight(chip);
        };
        const onEnd = function (ev) {
          if (ev.target !== chip || ev.propertyName !== 'opacity') {
            return;
          }
          finish();
        };
        chip.addEventListener('transitionend', onEnd);
        setTimeout(finish, 400);
      }, READY_HIGHLIGHT_MS);
    }

    function cancelAll(boardEl) {
      bumpGeneration();
      Object.keys(highlightTimers).forEach(function (key) {
        clearTimeout(highlightTimers[key]);
        delete highlightTimers[key];
      });
      if (!boardEl || typeof boardEl.querySelectorAll !== 'function') {
        return;
      }
      const chips = boardEl.querySelectorAll('.milksha-board-chip');
      for (let i = 0; i < chips.length; i += 1) {
        clearMotionStyles(chips[i]);
      }
      const layers = boardEl.querySelectorAll('.milksha-zone-numbers');
      for (let j = 0; j < layers.length; j += 1) {
        clearMotionStyles(layers[j]);
      }
      cancelZoneHighlights(boardEl);
    }

    /**
     * @param {Element} zoneEl
     * @param {'prep' | 'ready'} zoneKey
     * @param {Array<{ id: string, number: string }>} items
     * @param {number} page
     * @param {{
     *   highlightIds?: string[],
     *   pageTurn?: boolean,
     *   clearAll?: boolean,
     *   prevItems: Array<{ id: string, number: string }>,
     *   prevPage: number,
     * }} opts
     */
    function syncZone(zoneEl, zoneKey, items, page, opts) {
      const gen = bumpGeneration();
      const numbersLayer = zoneEl.querySelector('.milksha-zone-numbers');
      if (!numbersLayer) {
        return Promise.resolve();
      }
      const highlightSet = {};
      const highlightIds = opts.highlightIds || [];
      for (let h = 0; h < highlightIds.length; h += 1) {
        highlightSet[highlightIds[h]] = true;
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

      if (opts.clearAll) {
        const existing = numbersLayer.querySelectorAll('.milksha-board-chip');
        for (let c = 0; c < existing.length; c += 1) {
          const chip = existing[c];
          promises.push(
            runOpacityAnim(chip, 1, 0, DURATION_MS, gen).then(function () {
              if (chip.parentNode) {
                chip.parentNode.removeChild(chip);
              }
            }),
          );
        }
        return Promise.all(promises);
      }

      if (pageTurn) {
        numbersLayer.setAttribute('data-page-turn-anim', '1');
        promises.push(
          runOpacityAnim(numbersLayer, 1, 0, PAGE_DURATION_MS / 2, gen).then(function () {
            if (getGeneration() !== gen) {
              return;
            }
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
            return runOpacityAnim(numbersLayer, 0, 1, PAGE_DURATION_MS / 2, gen);
          }),
        );
        return Promise.all(promises);
      }

      const removedChips = [];
      diff.removed.forEach(function (id) {
        const chip = chipById[id];
        if (!chip) {
          return;
        }
        removedChips.push(chip);
        promises.push(
          runOpacityAnim(chip, 1, 0, DURATION_MS, gen).then(function () {
            if (chip.parentNode) {
              chip.parentNode.removeChild(chip);
            }
          }),
        );
      });

      for (let i = 0; i < deps.pageSize; i += 1) {
        const cell = cells[i];
        const slot = slotEls[i];
        if (!cell || !cell.number) {
          continue;
        }
        const id = cell.id;
        let chip = chipById[id];
        if (!chip) {
          chip = deps.document.createElement('div');
          chip.className = 'milksha-board-chip';
          chip.setAttribute('data-item-id', id);
          chip.innerHTML = '<span class="milksha-num">' + cell.number + '</span>';
          snapOpacity(chip, 0);
          slot.appendChild(chip);
          notePerf('chip-dom', { id: id });
          chipById[id] = chip;
          if (diff.added.indexOf(id) >= 0) {
            promises.push(runOpacityAnim(chip, 0, 1, DURATION_MS, gen));
          } else {
            promises.push(runOpacityAnim(chip, 0, 1, DURATION_MS, gen));
          }
          if (zoneKey === 'ready' && highlightSet[id]) {
            scheduleReadyHighlight(chip, zoneKey + ':' + id);
          }
        } else if (chip.parentNode !== slot) {
          slot.appendChild(chip);
        }
      }

      const afterLayout = function () {
        diff.moved.forEach(function (mv) {
          const chip = chipById[mv.id];
          if (!chip) {
            return;
          }
          const before = rectsBefore[mv.id];
          if (!before) {
            return;
          }
          const after = chip.getBoundingClientRect();
          const dx = before.left - after.left;
          const dy = before.top - after.top;
          promises.push(animateTranslate(chip, dx, dy, DURATION_MS, gen, getGeneration));
        });
        diff.added.forEach(function (id) {
          if (zoneKey !== 'ready' || !highlightSet[id]) {
            return;
          }
          const chip = chipById[id];
          if (!chip) {
            return;
          }
          scheduleReadyHighlight(chip, zoneKey + ':' + id);
        });
      };

      for (let s = 0; s < deps.pageSize; s += 1) {
        const cellAt = cells[s];
        const slotAt = slotEls[s];
        if (cellAt && cellAt.number) {
          continue;
        }
        slotAt.innerHTML = '';
      }

      return Promise.all(removedChips.length ? promises : []).then(function () {
        return new Promise(function (resolve) {
          deps.window.requestAnimationFrame(function () {
            afterLayout();
            Promise.all(promises).then(resolve);
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
      DURATION_MS: DURATION_MS,
      PAGE_DURATION_MS: PAGE_DURATION_MS,
    };
  }

  QMS.MilkshaBoardAnim = {
    DURATION_MS: DURATION_MS,
    PAGE_DURATION_MS: PAGE_DURATION_MS,
    READY_HIGHLIGHT_MS: READY_HIGHLIGHT_MS,
    visibleIdToSlot: visibleIdToSlot,
    diffSlotMaps: diffSlotMaps,
    diffVisibleSlots: diffVisibleSlots,
    isBulkSnapshotReplace: isBulkSnapshotReplace,
    shouldSkipBoardAnimations: shouldSkipBoardAnimations,
    createBoardAnimator: createBoardAnimator,
  };
})(typeof window !== 'undefined' ? window : globalThis);
