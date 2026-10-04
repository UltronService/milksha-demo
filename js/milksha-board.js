/**
 * Milksha dual-zone call board (preparing left, ready right). Vanilla JS, STB-oriented.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const PAGE_INTERVAL_MS = 6000;
  const MAX_POP_PER_PUSH = 3;
  const PAGE_SIZE = 10;
  const GRID_COLS = 2;
  const GRID_ROWS = 5;

  const SOURCE_DEFS = [
    { prefix: 'From_Store_', key: 'store' },
    { prefix: 'From_milksha_point_', key: 'point' },
    { prefix: 'From_FoodPanda_', key: 'fp' },
    { prefix: 'From_UberEat_', key: 'uber' },
    { prefix: 'From_Udd_', key: 'udd' },
  ];

  const LAYOUT_LANDSCAPE = {
    W: 1920,
    H: 1080,
    split: 'row',
    titleH: 112,
    titleZh: 72,
    titleEn: 28,
    numFont: 88,
    creamPad: 48,
  };

  const LAYOUT_PORTRAIT = {
    W: 1080,
    H: 1920,
    split: 'col',
    titleH: 112,
    titleZh: 64,
    titleEn: 26,
    numFont: 76,
    creamPad: 40,
  };

  const PREP_WAVES_SRC = 'assets/milksha-prep-waves.svg';

  /**
   * @param {string} sourceType
   * @returns {{ sourceKey: string, zone: 'ready' | 'preparing' } | null}
   */
  function parseSourceType(sourceType) {
    if (!sourceType || typeof sourceType !== 'string') {
      return null;
    }
    for (let i = 0; i < SOURCE_DEFS.length; i += 1) {
      const def = SOURCE_DEFS[i];
      if (sourceType.indexOf(def.prefix) !== 0) {
        continue;
      }
      const rest = sourceType.slice(def.prefix.length);
      if (rest === 'OK') {
        return { sourceKey: def.key, zone: 'ready' };
      }
      if (rest === 'Preparing') {
        return { sourceKey: def.key, zone: 'preparing' };
      }
      return null;
    }
    return null;
  }

  /**
   * @param {string} sourceKey
   * @param {string} number
   * @returns {string}
   */
  function makeItemId(sourceKey, number) {
    return sourceKey + ':' + String(number);
  }

  /**
   * @param {Array<{ source_type: string, number: string }>} numberContent
   * @returns {{ ready: Array<{ id: string, sourceKey: string, number: string }>, preparing: Array<{ id: string, sourceKey: string, number: string }> }}
   */
  function partitionNumberContent(numberContent) {
    const ready = [];
    const preparing = [];
    const readyIds = {};
    const list = Array.isArray(numberContent) ? numberContent : [];

    for (let i = 0; i < list.length; i += 1) {
      const row = list[i];
      if (!row || typeof row.number !== 'string') {
        continue;
      }
      const parsed = parseSourceType(row.source_type);
      if (!parsed) {
        continue;
      }
      const entry = {
        id: makeItemId(parsed.sourceKey, row.number),
        sourceKey: parsed.sourceKey,
        number: row.number,
      };
      if (parsed.zone === 'ready') {
        if (!readyIds[entry.id]) {
          readyIds[entry.id] = true;
          ready.push(entry);
        }
      } else {
        preparing.push(entry);
      }
    }

    const prepFiltered = [];
    for (let j = 0; j < preparing.length; j += 1) {
      if (!readyIds[preparing[j].id]) {
        prepFiltered.push(preparing[j]);
      }
    }

    return { ready: ready, preparing: prepFiltered };
  }

  /**
   * @param {Set<string> | Record<string, boolean>} prevReadyIds
   * @param {Array<{ id: string }>} readyList
   * @returns {string[]}
   */
  function detectNewlyReady(prevReadyIds, readyList) {
    const out = [];
    for (let i = 0; i < readyList.length; i += 1) {
      const id = readyList[i].id;
      const wasReady =
        prevReadyIds && typeof prevReadyIds.has === 'function'
          ? prevReadyIds.has(id)
          : Boolean(prevReadyIds[id]);
      if (!wasReady) {
        out.push(id);
      }
    }
    return out;
  }

  /**
   * @param {string[]} newlyReadyIds
   * @returns {{ popIds: string[], silentFreshIds: string[] }}
   */
  function splitPopQueue(newlyReadyIds) {
    const popIds = newlyReadyIds.slice(0, MAX_POP_PER_PUSH);
    const silentFreshIds = newlyReadyIds.slice(MAX_POP_PER_PUSH);
    return { popIds: popIds, silentFreshIds: silentFreshIds };
  }

  /**
   * @param {Array<unknown>} ready
   * @param {Array<unknown>} preparing
   * @returns {boolean}
   */
  function isBoardFullyEmpty(ready, preparing) {
    const r = Array.isArray(ready) ? ready : [];
    const p = Array.isArray(preparing) ? preparing : [];
    return r.length === 0 && p.length === 0;
  }

  /**
   * @param {number} itemCount
   * @param {number} [perPage]
   * @returns {number}
   */
  function pageCountForItems(itemCount, perPage) {
    const size = perPage || PAGE_SIZE;
    if (itemCount <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(itemCount / size));
  }

  /**
   * @param {Array<{ number: string }>} items
   * @param {number} page
   * @param {number} [perPage]
   * @returns {Array<{ number: string } | null>}
   */
  function layoutPageGrid(items, page, perPage) {
    const size = perPage || PAGE_SIZE;
    const start = page * size;
    const slice = items.slice(start, start + size);
    const cells = new Array(size).fill(null);
    for (let i = 0; i < slice.length && i < size; i += 1) {
      cells[i] = slice[i];
    }
    return cells;
  }

  /**
   * @param {Array<{ number: string } | null>} cells
   * @returns {{ row: number, col: number }[]}
   */
  function gridPositionsForCells(cells) {
    const positions = [];
    for (let i = 0; i < cells.length; i += 1) {
      if (!cells[i]) {
        continue;
      }
      const col = i < GRID_ROWS ? 0 : 1;
      const row = i < GRID_ROWS ? i : i - GRID_ROWS;
      positions.push({ row: row, col: col, index: i, number: cells[i].number });
    }
    return positions;
  }

  /**
   * @param {object} brand
   * @param {object} [options]
   */
  function bootMilkshaBoard(brand, options) {
    const opts = options || {};
    const doc = opts.document || root.document;
    const win = opts.window || root;
    const rootEl = doc.getElementById('board-root');
    if (!rootEl) {
      return;
    }

    let orientation = resolveOrientation(
      win,
      opts.orientation ||
        (win.location
          ? new URLSearchParams(win.location.search).get('orientation') || ''
          : ''),
    );

    const audio = QMS.createAudioManager({
      muted: brand.audio.mutedDefault === true,
    });
    audio.setBrandAudio(brand.audio);

    rootEl.className = 'milksha-stage';
    rootEl.innerHTML =
      '<div class="milksha-board-viewport" id="milksha-board-viewport">' +
      '<div class="milksha-board" id="milksha-board"></div></div>';

    const boardViewportEl = doc.getElementById('milksha-board-viewport');
    const boardEl = doc.getElementById('milksha-board');

    let prevReadyIdSet = new Set();
    let isFirstPayload = true;
    let boardChimePolicy = null;

    function ensureBoardChimePolicy() {
      if (boardChimePolicy) {
        return boardChimePolicy;
      }
      if (!QMS.Receiver || !QMS.Receiver.createBoardChimePolicy) {
        return null;
      }
      boardChimePolicy = QMS.Receiver.createBoardChimePolicy({
        getBusinessDate: function () {
          if (QMS.Board && QMS.Board.TodayBoard) {
            return QMS.Board.TodayBoard.taipeiBusinessDate();
          }
          return '';
        },
        newlyReadyIds: function (prev, next) {
          if (QMS.Transport && QMS.Transport.BoardSeq) {
            return QMS.Transport.BoardSeq.newlyReadyIds(prev, next);
          }
          const out = [];
          next.forEach(function (id) {
            if (!prev.has(id)) {
              out.push(id);
            }
          });
          return out;
        },
      });
      return boardChimePolicy;
    }
    const metaById = {};
    let readyItems = [];
    let prepItems = [];
    let readyPage = 0;
    let prepPage = 0;
    let readyPageStartedAt = Date.now();
    let prepPageStartedAt = Date.now();
    let readyTimer = null;
    let prepTimer = null;
    let ringQueue = [];
    let ringRunning = false;
    let scale = 1;

    function layoutConfig() {
      return orientation === 'portrait' ? LAYOUT_PORTRAIT : LAYOUT_LANDSCAPE;
    }

    function logSound(itemId) {
      if (!win.__milkshaSoundLog) {
        win.__milkshaSoundLog = [];
      }
      win.__milkshaSoundLog.push(itemId);
    }

    function findItem(id) {
      for (let i = 0; i < readyItems.length; i += 1) {
        if (readyItems[i].id === id) {
          return readyItems[i];
        }
      }
      return null;
    }

    function applyScale() {
      const cfg = layoutConfig();
      const vw = win.innerWidth || cfg.W;
      const vh = win.innerHeight || cfg.H;
      scale = Math.min(vw / cfg.W, vh / cfg.H, 1);
      const viewW = Math.round(cfg.W * scale);
      const viewH = Math.round(cfg.H * scale);
      if (boardViewportEl) {
        boardViewportEl.style.width = viewW + 'px';
        boardViewportEl.style.height = viewH + 'px';
      }
      boardEl.style.width = cfg.W + 'px';
      boardEl.style.height = cfg.H + 'px';
      boardEl.style.transform = 'scale(' + scale + ')';
      boardEl.style.transformOrigin = 'top left';
      boardEl.style.marginLeft = '0';
      boardEl.style.marginTop = '0';
      rootEl.style.setProperty('--milksha-num-font', cfg.numFont + 'px');
    }

    function clampPage(page, count) {
      if (count <= 0) {
        return 0;
      }
      if (page < 0) {
        return 0;
      }
      if (page >= count) {
        return count - 1;
      }
      return page;
    }

    function scheduleZoneTimers() {
      if (readyTimer) {
        clearInterval(readyTimer);
      }
      if (prepTimer) {
        clearInterval(prepTimer);
      }
      readyTimer = setInterval(function () {
        const pages = pageCountForItems(readyItems.length, PAGE_SIZE);
        if (pages <= 1) {
          return;
        }
        readyPage = (readyPage + 1) % pages;
        readyPageStartedAt = Date.now();
        renderBoard();
      }, PAGE_INTERVAL_MS);
      prepTimer = setInterval(function () {
        const pages = pageCountForItems(prepItems.length, PAGE_SIZE);
        if (pages <= 1) {
          return;
        }
        prepPage = (prepPage + 1) % pages;
        prepPageStartedAt = Date.now();
        renderBoard();
      }, PAGE_INTERVAL_MS);
    }

    function renderZoneHtml(cls, x, y, w, h, titleZh, titleEn, page, totalPages, items, pageStartedAt) {
      const cfg = layoutConfig();
      const cells = layoutPageGrid(items, page, PAGE_SIZE);
      let z =
        '<div class="milksha-zone ' +
        cls +
        '" style="left:' +
        x +
        'px;top:' +
        y +
        'px;width:' +
        w +
        'px;height:' +
        h +
        'px">';
      if (cls.indexOf('prep') >= 0) {
        z +=
          '<img class="milksha-prep-waves" src="' +
          PREP_WAVES_SRC +
          '" alt="" decoding="async" />';
      }
      z += '<div class="milksha-ztitle" style="height:' + cfg.titleH + 'px">';
      z +=
        '<span class="milksha-ztitle-zh" style="font-size:' +
        cfg.titleZh +
        'px">' +
        titleZh +
        '</span>';
      z +=
        '<span class="milksha-ztitle-en" style="font-size:' +
        cfg.titleEn +
        'px">' +
        titleEn +
        '</span>';
      z += '</div>';
      const bodyTop = cfg.titleH;
      const bodyH = h - bodyTop;
      z +=
        '<div class="milksha-zone-body" style="top:' +
        bodyTop +
        'px;height:' +
        bodyH +
        'px">';
      z += '<div class="milksha-cream" style="padding:' + cfg.creamPad + 'px">';
      z += '<div class="milksha-cream-grid">';
      for (let i = 0; i < PAGE_SIZE; i += 1) {
        const cell = cells[i];
        if (cell && cell.number) {
          z +=
            '<div class="milksha-num-cell"><span class="milksha-num">' +
            cell.number +
            '</span></div>';
        } else {
          z += '<div class="milksha-num-cell"></div>';
        }
      }
      z += '</div>';
      if (totalPages > 1) {
        z +=
          '<div class="milksha-pg-indicator" data-started-at="' +
          pageStartedAt +
          '">' +
          (page + 1) +
          '/' +
          totalPages +
          '</div>';
      }
      z += '</div></div></div>';
      return z;
    }

    function renderBoard() {
      const cfg = layoutConfig();
      const vert = cfg.split === 'col';
      const halfW = Math.round(cfg.W / 2);
      const fullH = cfg.H;

      const readyPages = pageCountForItems(readyItems.length, PAGE_SIZE);
      const prepPages = pageCountForItems(prepItems.length, PAGE_SIZE);
      readyPage = clampPage(readyPage, readyPages);
      prepPage = clampPage(prepPage, prepPages);

      let html = '';

      if (vert) {
        const halfH = Math.round(cfg.H / 2);
        html += renderZoneHtml(
          'milksha-prep prep',
          0,
          0,
          cfg.W,
          halfH,
          '準備中',
          'Preparing',
          prepPage,
          prepPages,
          prepItems,
          prepPageStartedAt,
        );
        html += renderZoneHtml(
          'milksha-ready ready',
          0,
          halfH,
          cfg.W,
          halfH,
          '請取餐',
          'Pick Up Now',
          readyPage,
          readyPages,
          readyItems,
          readyPageStartedAt,
        );
      } else {
        html += renderZoneHtml(
          'milksha-prep prep',
          0,
          0,
          halfW,
          fullH,
          '準備中',
          'Preparing',
          prepPage,
          prepPages,
          prepItems,
          prepPageStartedAt,
        );
        html += renderZoneHtml(
          'milksha-ready ready',
          halfW,
          0,
          halfW,
          fullH,
          '請取餐',
          'Pick Up Now',
          readyPage,
          readyPages,
          readyItems,
          readyPageStartedAt,
        );
      }

      boardEl.innerHTML = html;
    }

    function runRingQueue() {
      if (ringRunning || ringQueue.length === 0) {
        return;
      }
      const nextId = ringQueue.shift();
      const item = findItem(nextId);
      if (!item) {
        runRingQueue();
        return;
      }
      ringRunning = true;
      audio.playDingDong().then(function () {
        logSound(item.id);
        ringRunning = false;
        runRingQueue();
      });
    }

    /**
     * @param {Array<{ source_type: string, number: string }>} numberContent
     */
    function applyPayload(numberContent, opts) {
      const now = Date.now();
      const parts = partitionNumberContent(numberContent);
      const newReadyIds = detectNewlyReady(prevReadyIdSet, parts.ready);
      const nextReadyIdSet = new Set();
      for (let nr = 0; nr < parts.ready.length; nr += 1) {
        nextReadyIdSet.add(parts.ready[nr].id);
      }
      const silentApply = Boolean(opts && opts.silent);
      const chimePolicy = ensureBoardChimePolicy();
      let ringIds = [];
      if (chimePolicy) {
        ringIds = chimePolicy.pickRingIds(prevReadyIdSet, nextReadyIdSet, { silent: silentApply });
      } else if (!isFirstPayload && !silentApply && newReadyIds.length > 0) {
        ringIds = newReadyIds;
      }

      const nextMeta = {};
      const nextReady = [];
      for (let i = 0; i < parts.ready.length; i += 1) {
        const e = parts.ready[i];
        const prev = metaById[e.id];
        const readyAt = prev && prev.readyAt ? prev.readyAt : now;
        nextMeta[e.id] = {
          firstSeenAt: prev && prev.firstSeenAt ? prev.firstSeenAt : now,
          readyAt: newReadyIds.indexOf(e.id) >= 0 ? now : readyAt,
        };
        nextReady.push({
          id: e.id,
          sourceKey: e.sourceKey,
          number: e.number,
          readyAt: nextMeta[e.id].readyAt,
        });
      }
      nextReady.sort(function (a, b) {
        return b.readyAt - a.readyAt;
      });

      const nextPrep = [];
      for (let j = 0; j < parts.preparing.length; j += 1) {
        const p = parts.preparing[j];
        const prev = metaById[p.id];
        nextMeta[p.id] = {
          firstSeenAt: prev && prev.firstSeenAt ? prev.firstSeenAt : now,
          readyAt: prev && prev.readyAt ? prev.readyAt : null,
        };
        nextPrep.push({
          id: p.id,
          sourceKey: p.sourceKey,
          number: p.number,
          firstSeenAt: nextMeta[p.id].firstSeenAt,
        });
      }
      nextPrep.sort(function (a, b) {
        return a.firstSeenAt - b.firstSeenAt;
      });

      Object.keys(metaById).forEach(function (k) {
        if (!nextMeta[k]) {
          delete metaById[k];
        }
      });
      Object.keys(nextMeta).forEach(function (k) {
        metaById[k] = nextMeta[k];
      });

      readyItems = nextReady;
      prepItems = nextPrep;

      if (!silentApply && ringIds.length > 0) {
        readyPage = 0;
        readyPageStartedAt = now;
        const split = splitPopQueue(ringIds);
        for (let p = 0; p < split.popIds.length; p += 1) {
          ringQueue.push(split.popIds[p]);
        }
        runRingQueue();
      }

      prevReadyIdSet = nextReadyIdSet;
      isFirstPayload = false;
      renderBoard();
    }

    function setOrientation(next) {
      orientation = next === 'portrait' ? 'portrait' : 'landscape';
      applyScale();
      renderBoard();
    }

    function setMuted(muted) {
      audio.setMuted(muted);
    }

    function unlockAudio() {
      audio.unlock();
    }

    applyScale();
    renderBoard();
    scheduleZoneTimers();

    win.addEventListener('resize', applyScale);
    doc.addEventListener('click', unlockAudio, { once: true });
    doc.addEventListener('keydown', unlockAudio, { once: true });

    const runtime = {
      brand: brand,
      applyPayload: applyPayload,
      setOrientation: setOrientation,
      setMuted: setMuted,
      getOrientation: function () {
        return orientation;
      },
      getSnapshot: function () {
        return {
          ready: readyItems.slice(),
          preparing: prepItems.slice(),
        };
      },
      destroy: function () {
        if (readyTimer) {
          clearInterval(readyTimer);
        }
        if (prepTimer) {
          clearInterval(prepTimer);
        }
      },
    };

    QMS.runtime = runtime;
    return runtime;
  }

  /**
   * @param {typeof root} win
   * @param {string} orientation
   * @returns {'landscape' | 'portrait'}
   */
  function resolveOrientation(win, orientation) {
    const o = (orientation || '').trim().toLowerCase();
    if (o === 'landscape' || o === 'portrait') {
      return o;
    }
    if (win && win.innerWidth && win.innerHeight) {
      return win.innerWidth >= win.innerHeight ? 'landscape' : 'portrait';
    }
    return 'landscape';
  }

  QMS.MilkshaBoard = {
    parseSourceType: parseSourceType,
    partitionNumberContent: partitionNumberContent,
    detectNewlyReady: detectNewlyReady,
    splitPopQueue: splitPopQueue,
    makeItemId: makeItemId,
    MAX_POP_PER_PUSH: MAX_POP_PER_PUSH,
    PAGE_SIZE: PAGE_SIZE,
    GRID_COLS: GRID_COLS,
    GRID_ROWS: GRID_ROWS,
    isBoardFullyEmpty: isBoardFullyEmpty,
    pageCountForItems: pageCountForItems,
    layoutPageGrid: layoutPageGrid,
    gridPositionsForCells: gridPositionsForCells,
    bootMilkshaBoard: bootMilkshaBoard,
  };
  QMS.bootMilkshaBoard = bootMilkshaBoard;
})(typeof window !== 'undefined' ? window : globalThis);
