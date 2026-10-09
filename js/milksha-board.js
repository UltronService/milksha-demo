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
    titleTop: 72,
    titleH: 108,
    titleZh: 72,
    titleEn: 28,
    numFont: 88,
    creamPad: 40,
  };

  const LAYOUT_PORTRAIT = {
    W: 1080,
    H: 1920,
    split: 'col',
    titleTop: 115,
    titleH: 112,
    titleZh: 64,
    titleEn: 26,
    numFont: 76,
    creamPad: 36,
  };

  const BOARD_BG_SRC = 'assets/milksha-board-bg-1007.jpg';

  const DESIGN_LANDSCAPE_W = LAYOUT_LANDSCAPE.W;
  const DESIGN_LANDSCAPE_H = LAYOUT_LANDSCAPE.H;

  /**
   * Uniform scale to fit design canvas in viewport (no upscale cap).
   * @param {number} viewportW
   * @param {number} viewportH
   * @param {number} designW
   * @param {number} designH
   * @returns {number}
   */
  function computeViewportScale(viewportW, viewportH, designW, designH) {
    const vw = Number(viewportW);
    const vh = Number(viewportH);
    const dw = Number(designW);
    const dh = Number(designH);
    if (!vw || !vh || !dw || !dh) {
      return 1;
    }
    return Math.min(vw / dw, vh / dh);
  }

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
   * Primary time DESC; when equal, later payload index wins (stable newest-first for batch/reconnect).
   * @param {{ readyAt?: number, firstSeenAt?: number, payloadIndex?: number }} a
   * @param {{ readyAt?: number, firstSeenAt?: number, payloadIndex?: number }} b
   * @param {'readyAt' | 'firstSeenAt'} primaryKey
   * @returns {number}
   */
  function compareNewestFirst(a, b, primaryKey) {
    const ta = Number(a[primaryKey]) || 0;
    const tb = Number(b[primaryKey]) || 0;
    if (ta !== tb) {
      return tb - ta;
    }
    const ia = Number.isFinite(a.payloadIndex) ? a.payloadIndex : 0;
    const ib = Number.isFinite(b.payloadIndex) ? b.payloadIndex : 0;
    return ib - ia;
  }

  /**
   * @param {Array<{ source_type: string, number: string }>} numberContent
   * @returns {{ ready: Array<{ id: string, sourceKey: string, number: string }>, preparing: Array<{ id: string, sourceKey: string, number: string }> }}
   */
  function partitionNumberContent(numberContent) {
    const ready = [];
    const preparing = [];
    const readyIds = {};
    const prepIds = {};
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
        payloadIndex: i,
      };
      if (parsed.zone === 'ready') {
        if (!readyIds[entry.id]) {
          readyIds[entry.id] = true;
          ready.push(entry);
        }
      } else {
        if (!readyIds[entry.id] && !prepIds[entry.id]) {
          prepIds[entry.id] = true;
          preparing.push(entry);
        }
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
   * @param {{ id: string, number: string } | null | undefined} item
   * @returns {string}
   */
  function renderNumberChip(item) {
    if (!item || !item.number) {
      return '';
    }
    return (
      '<div class="milksha-board-chip" data-item-id="' +
      item.id +
      '"><span class="milksha-num">' +
      item.number +
      '</span></div>'
    );
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
      '<div class="milksha-board-canvas" id="milksha-board-canvas">' +
      '<div class="milksha-cloud-offline" id="milksha-cloud-offline" hidden aria-live="polite">離線</div>' +
      '<div class="milksha-cloud-paused" id="milksha-cloud-paused" hidden aria-live="polite">連線暫停</div>' +
      '<div class="milksha-board" id="milksha-board"></div></div></div>';

    const boardViewportEl = doc.getElementById('milksha-board-viewport');
    const boardCanvasEl = doc.getElementById('milksha-board-canvas');
    const boardEl = doc.getElementById('milksha-board');
    const cloudOfflineEl = doc.getElementById('milksha-cloud-offline');
    const cloudPausedEl = doc.getElementById('milksha-cloud-paused');

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
    let boardAnimator = null;
    let lastRenderedPrep = [];
    let lastRenderedReady = [];
    let lastRenderedPrepPage = 0;
    let lastRenderedReadyPage = 0;
    let lastAnimSkipReason = 'init';

    function layoutConfig() {
      return orientation === 'portrait' ? LAYOUT_PORTRAIT : LAYOUT_LANDSCAPE;
    }

    function landscapeArtLayout() {
      return QMS.Board && QMS.Board.LandscapeArtLayout ? QMS.Board.LandscapeArtLayout : null;
    }

    function useLandscapeArtGrid() {
      const cfg = layoutConfig();
      return orientation === 'landscape' && cfg.split === 'row' && Boolean(landscapeArtLayout());
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
      scale = computeViewportScale(vw, vh, cfg.W, cfg.H);
      const viewW = Math.round(cfg.W * scale);
      const viewH = Math.round(cfg.H * scale);
      if (boardViewportEl) {
        boardViewportEl.style.width = viewW + 'px';
        boardViewportEl.style.height = viewH + 'px';
      }
      if (boardCanvasEl) {
        boardCanvasEl.style.width = cfg.W + 'px';
        boardCanvasEl.style.height = cfg.H + 'px';
        boardCanvasEl.style.transform = 'scale(' + scale + ')';
        boardCanvasEl.style.transformOrigin = 'top left';
      }
      boardEl.style.width = cfg.W + 'px';
      boardEl.style.height = cfg.H + 'px';
      boardEl.style.transform = 'none';
      boardEl.classList.toggle('milksha-board--landscape-art', orientation === 'landscape');
      boardEl.style.backgroundImage =
        orientation === 'landscape' ? 'url("' + BOARD_BG_SRC + '")' : 'none';
      const art = landscapeArtLayout();
      const numFont = useLandscapeArtGrid() && art ? art.NUM_FONT_PX : cfg.numFont;
      rootEl.style.setProperty('--milksha-num-font', numFont + 'px');
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

    function prefersReducedMotion() {
      try {
        return Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
      } catch (_err) {
        return false;
      }
    }

    function canUseWebAnimations() {
      return typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
    }

    function ensureBoardAnimator() {
      if (boardAnimator || !QMS.MilkshaBoardAnim || !QMS.MilkshaBoardAnim.createBoardAnimator) {
        return boardAnimator;
      }
      boardAnimator = QMS.MilkshaBoardAnim.createBoardAnimator({
        document: doc,
        window: win,
        pageSize: PAGE_SIZE,
        layoutPageGrid: layoutPageGrid,
        pageCountForItems: pageCountForItems,
      });
      return boardAnimator;
    }

    function updateZonePageIndicator(zone, page, totalPages) {
      if (!zone) {
        return;
      }
      let ind = zone.querySelector('.milksha-pg-indicator');
      if (totalPages > 1) {
        if (!ind) {
          ind = doc.createElement('div');
          ind.className = useLandscapeArtGrid()
            ? 'milksha-pg-indicator milksha-pg-indicator--art'
            : 'milksha-pg-indicator';
          zone.appendChild(ind);
        }
        ind.textContent = String(page + 1) + '/' + String(totalPages);
      } else if (ind) {
        ind.remove();
      }
    }

    function zonesDomReady() {
      return Boolean(
        boardEl.querySelector('.milksha-zone.prep .milksha-zone-numbers') &&
          boardEl.querySelector('.milksha-zone.ready .milksha-zone-numbers'),
      );
    }

    function shouldSkipMotion(silentApply, prevPrep, prevReady, forceSnapshotSkip) {
      const animApi = QMS.MilkshaBoardAnim;
      if (!animApi || !animApi.shouldSkipBoardAnimations) {
        return { skip: true, reason: 'anim-module-missing' };
      }
      return animApi.shouldSkipBoardAnimations({
        isFirstPayload: isFirstPayload,
        silentApply: silentApply,
        forceSnapshotSkip: Boolean(forceSnapshotSkip),
        reduceMotion: prefersReducedMotion(),
        canUseWebAnimations: canUseWebAnimations(),
        prevPrep: prevPrep,
        nextPrep: prepItems,
        prevReady: prevReady,
        nextReady: readyItems,
      });
    }

    /**
     * @param {{ silentApply: boolean, clearAll: boolean, forceSnapshotSkip?: boolean }} viewOpts
     */
    function commitBoardView(viewOpts) {
      const readyPages = pageCountForItems(readyItems.length, PAGE_SIZE);
      const prepPages = pageCountForItems(prepItems.length, PAGE_SIZE);
      readyPage = clampPage(readyPage, readyPages);
      prepPage = clampPage(prepPage, prepPages);

      const prevPrep = lastRenderedPrep;
      const prevReady = lastRenderedReady;
      const prevPrepPage = lastRenderedPrepPage;
      const prevReadyPage = lastRenderedReadyPage;
      const motion = shouldSkipMotion(
        viewOpts.silentApply,
        prevPrep,
        prevReady,
        viewOpts.forceSnapshotSkip,
      );
      lastAnimSkipReason = motion.reason;
      const animator = ensureBoardAnimator();

      if (motion.skip || !animator || !zonesDomReady()) {
        if (animator) {
          animator.cancelAll(boardEl);
        }
        renderBoard();
      } else {
        animator.cancelAll(boardEl);
        const prepZone = boardEl.querySelector('.milksha-zone.prep');
        const readyZone = boardEl.querySelector('.milksha-zone.ready');
        if (viewOpts.clearAll) {
          animator.syncZone(prepZone, 'prep', prepItems, prepPage, {
            prevItems: prevPrep,
            prevPage: prevPrepPage,
            clearAll: true,
          });
          animator.syncZone(readyZone, 'ready', readyItems, readyPage, {
            prevItems: prevReady,
            prevPage: prevReadyPage,
            clearAll: true,
          });
        } else {
          animator.syncZone(prepZone, 'prep', prepItems, prepPage, {
            prevItems: prevPrep,
            prevPage: prevPrepPage,
            pageTurn: prevPrepPage !== prepPage,
          });
          animator.syncZone(readyZone, 'ready', readyItems, readyPage, {
            prevItems: prevReady,
            prevPage: prevReadyPage,
            pageTurn: prevReadyPage !== readyPage,
          });
        }
        updateZonePageIndicator(prepZone, prepPage, prepPages);
        updateZonePageIndicator(readyZone, readyPage, readyPages);
      }

      lastRenderedPrep = prepItems.slice();
      lastRenderedReady = readyItems.slice();
      lastRenderedPrepPage = prepPage;
      lastRenderedReadyPage = readyPage;
    }

    /**
     * @returns {Promise<void>}
     */
    function patchZonePage(zoneClass, items, page, totalPages) {
      const zoneKey = zoneClass.indexOf('prep') >= 0 ? 'prep' : 'ready';
      const zone = boardEl.querySelector('.milksha-zone.' + zoneClass);
      if (!zone) {
        renderBoard();
        lastRenderedPrep = prepItems.slice();
        lastRenderedReady = readyItems.slice();
        lastRenderedPrepPage = prepPage;
        lastRenderedReadyPage = readyPage;
        return;
      }
      const numbersLayer = zone.querySelector('.milksha-zone-numbers');
      const cellEls = numbersLayer
        ? numbersLayer.querySelectorAll('.milksha-num-cell')
        : zone.querySelectorAll('.milksha-num-cell');
      if (cellEls.length !== PAGE_SIZE) {
        renderBoard();
        if (zoneKey === 'prep') {
          lastRenderedPrepPage = page;
        } else {
          lastRenderedReadyPage = page;
        }
        return;
      }
      const prevItems = zoneKey === 'prep' ? lastRenderedPrep : lastRenderedReady;
      const prevPage = zoneKey === 'prep' ? lastRenderedPrepPage : lastRenderedReadyPage;
      const animator = ensureBoardAnimator();
      const pageMotionOk = !prefersReducedMotion() && canUseWebAnimations();
      if (pageMotionOk && animator) {
        const animDone = animator.syncZone(zone, zoneKey, items, page, {
          prevItems: prevItems,
          prevPage: prevPage,
          pageTurn: true,
        });
        if (zoneKey === 'prep') {
          lastRenderedPrepPage = page;
        } else {
          lastRenderedReadyPage = page;
        }
        return Promise.resolve(animDone).then(function () {
          return undefined;
        });
      } else {
        const cells = layoutPageGrid(items, page, PAGE_SIZE);
        for (let i = 0; i < PAGE_SIZE; i += 1) {
          const cell = cells[i];
          const el = cellEls[i];
          if (cell && cell.number) {
            el.innerHTML = renderNumberChip(cell);
          } else {
            el.innerHTML = '';
          }
        }
      }
      updateZonePageIndicator(zone, page, totalPages);
      if (zoneKey === 'prep') {
        lastRenderedPrepPage = page;
      } else {
        lastRenderedReadyPage = page;
      }
      return Promise.resolve();
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
        patchZonePage('ready', readyItems, readyPage, pages);
      }, PAGE_INTERVAL_MS);
      prepTimer = setInterval(function () {
        const pages = pageCountForItems(prepItems.length, PAGE_SIZE);
        if (pages <= 1) {
          return;
        }
        prepPage = (prepPage + 1) % pages;
        prepPageStartedAt = Date.now();
        patchZonePage('prep', prepItems, prepPage, pages);
      }, PAGE_INTERVAL_MS);
    }

    function renderZoneHtmlArt(cls, x, y, w, h, titleZh, titleEn, page, totalPages, items, pageStartedAt) {
      const cfg = layoutConfig();
      const art = landscapeArtLayout();
      if (!art) {
        return '';
      }
      const zoneKey = cls.indexOf('prep') >= 0 ? 'prep' : 'ready';
      const cream = art.creamRectForZone(zoneKey);
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
      z += '<div class="milksha-ztitle" style="margin-top:' + cfg.titleTop + 'px;height:' + cfg.titleH + 'px">';
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
      z += '<div class="milksha-art-numbers milksha-zone-numbers">';
      for (let i = 0; i < PAGE_SIZE; i += 1) {
        const center = art.cellCenterBoard(zoneKey, i);
        const pos = art.cellPositionInZone(x, center);
        const cell = cells[i];
        z +=
          '<div class="milksha-num-cell" style="left:' +
          pos.left +
          'px;top:' +
          pos.top +
          'px">';
        if (cell && cell.number) {
          z += renderNumberChip(cell);
        }
        z += '</div>';
      }
      z += '</div>';
      if (totalPages > 1) {
        const indLeft = cream.left - x + cream.width - 52;
        const indTop = cream.top + cream.height - 34;
        z +=
          '<div class="milksha-pg-indicator milksha-pg-indicator--art" style="left:' +
          indLeft +
          'px;top:' +
          indTop +
          'px" data-started-at="' +
          pageStartedAt +
          '">' +
          (page + 1) +
          '/' +
          totalPages +
          '</div>';
      }
      z += '</div>';
      return z;
    }

    function renderZoneHtml(cls, x, y, w, h, titleZh, titleEn, page, totalPages, items, pageStartedAt) {
      if (useLandscapeArtGrid()) {
        return renderZoneHtmlArt(cls, x, y, w, h, titleZh, titleEn, page, totalPages, items, pageStartedAt);
      }
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
      z += '<div class="milksha-ztitle" style="margin-top:' + cfg.titleTop + 'px;height:' + cfg.titleH + 'px">';
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
      const bodyTop = cfg.titleTop + cfg.titleH;
      const bodyH = h - bodyTop;
      z +=
        '<div class="milksha-zone-body" style="top:' +
        bodyTop +
        'px;height:' +
        bodyH +
        'px">';
      z += '<div class="milksha-cream" style="padding:' + cfg.creamPad + 'px">';
      z += '<div class="milksha-cream-grid milksha-zone-numbers">';
      for (let i = 0; i < PAGE_SIZE; i += 1) {
        const cell = cells[i];
        if (cell && cell.number) {
          z += '<div class="milksha-num-cell">' + renderNumberChip(cell) + '</div>';
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
      const prevPrepBefore = prepItems.slice();
      const prevReadyBefore = readyItems.slice();
      const wasBoardEmpty = isBoardFullyEmpty(prevReadyBefore, prevPrepBefore);
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
        const payloadIndex =
          prev && Number.isFinite(prev.payloadIndex)
            ? prev.payloadIndex
            : Number.isFinite(e.payloadIndex)
              ? e.payloadIndex
              : 0;
        nextMeta[e.id] = {
          firstSeenAt: prev && prev.firstSeenAt ? prev.firstSeenAt : now,
          readyAt: newReadyIds.indexOf(e.id) >= 0 ? now : readyAt,
          payloadIndex: payloadIndex,
        };
        nextReady.push({
          id: e.id,
          sourceKey: e.sourceKey,
          number: e.number,
          readyAt: nextMeta[e.id].readyAt,
          payloadIndex: payloadIndex,
        });
      }
      nextReady.sort(function (a, b) {
        return compareNewestFirst(a, b, 'readyAt');
      });

      const nextPrep = [];
      for (let j = 0; j < parts.preparing.length; j += 1) {
        const p = parts.preparing[j];
        const prev = metaById[p.id];
        const prepPayloadIndex =
          prev && Number.isFinite(prev.payloadIndex)
            ? prev.payloadIndex
            : Number.isFinite(p.payloadIndex)
              ? p.payloadIndex
              : 0;
        nextMeta[p.id] = {
          firstSeenAt: prev && prev.firstSeenAt ? prev.firstSeenAt : now,
          readyAt: prev && prev.readyAt ? prev.readyAt : null,
          payloadIndex: prepPayloadIndex,
        };
        nextPrep.push({
          id: p.id,
          sourceKey: p.sourceKey,
          number: p.number,
          firstSeenAt: nextMeta[p.id].firstSeenAt,
          payloadIndex: prepPayloadIndex,
        });
      }
      nextPrep.sort(function (a, b) {
        return compareNewestFirst(a, b, 'firstSeenAt');
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
      const clearAll = !wasBoardEmpty && isBoardFullyEmpty(readyItems, prepItems);
      commitBoardView({
        silentApply: silentApply,
        clearAll: clearAll,
        forceSnapshotSkip: Boolean(opts && opts.forceSnapshotSkip),
      });
      isFirstPayload = false;
    }

    function setOrientation(next) {
      orientation = next === 'portrait' ? 'portrait' : 'landscape';
      applyScale();
      if (boardAnimator) {
        boardAnimator.cancelAll(boardEl);
      }
      renderBoard();
      lastRenderedPrep = prepItems.slice();
      lastRenderedReady = readyItems.slice();
      lastRenderedPrepPage = prepPage;
      lastRenderedReadyPage = readyPage;
    }

    function setMuted(muted) {
      audio.setMuted(muted);
    }

    function setCloudOfflineVisible(visible) {
      if (!cloudOfflineEl) {
        return;
      }
      cloudOfflineEl.hidden = !visible;
    }

    function setCloudPausedVisible(visible) {
      if (!cloudPausedEl) {
        return;
      }
      cloudPausedEl.hidden = !visible;
    }

    function unlockAudio() {
      audio.unlock();
    }

    applyScale();
    renderBoard();
    lastRenderedPrep = prepItems.slice();
    lastRenderedReady = readyItems.slice();
    lastRenderedPrepPage = prepPage;
    lastRenderedReadyPage = readyPage;
    scheduleZoneTimers();

    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState !== 'visible') {
        return;
      }
      if (!boardAnimator) {
        return;
      }
      boardAnimator.cancelAll(boardEl);
      const chips = boardEl.querySelectorAll('.milksha-board-chip');
      for (let i = 0; i < chips.length; i += 1) {
        chips[i].style.opacity = '1';
        chips[i].style.transform = '';
      }
      const layers = boardEl.querySelectorAll('.milksha-zone-numbers');
      for (let j = 0; j < layers.length; j += 1) {
        layers[j].style.opacity = '1';
      }
    });

    win.addEventListener('resize', applyScale);
    win.addEventListener('orientationchange', applyScale);
    doc.addEventListener('fullscreenchange', applyScale);
    doc.addEventListener('webkitfullscreenchange', applyScale);
    doc.addEventListener('click', unlockAudio, { once: true });
    doc.addEventListener('keydown', unlockAudio, { once: true });

    const runtime = {
      brand: brand,
      applyPayload: applyPayload,
      setCloudOfflineVisible: setCloudOfflineVisible,
      setCloudPausedVisible: setCloudPausedVisible,
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
      isAnnouncing: function () {
        return ringRunning || ringQueue.length > 0;
      },
      destroy: function () {
        if (readyTimer) {
          clearInterval(readyTimer);
        }
        if (prepTimer) {
          clearInterval(prepTimer);
        }
        if (boardAnimator) {
          boardAnimator.cancelAll(boardEl);
        }
      },
      getAnimSkipReason: function () {
        return lastAnimSkipReason;
      },
      getBoardAnimProbe: function () {
        const animator = ensureBoardAnimator();
        return {
          skipReason: lastAnimSkipReason,
          opacityAnimRuns: animator && animator.getOpacityAnimRuns ? animator.getOpacityAnimRuns() : 0,
        };
      },
      resetBoardAnimProbe: function () {
        const animator = ensureBoardAnimator();
        if (animator && animator.resetOpacityAnimRuns) {
          animator.resetOpacityAnimRuns();
        }
      },
      clearPerfEvents: function () {
        win.__milkshaBoardPerfEvents = [];
      },
      getPerfEvents: function () {
        return (win.__milkshaBoardPerfEvents || []).slice();
      },
      advanceZonePageForTest: function (zoneKey) {
        if (zoneKey === 'prep') {
          const pages = pageCountForItems(prepItems.length, PAGE_SIZE);
          if (pages <= 1) {
            return Promise.resolve(false);
          }
          prepPage = (prepPage + 1) % pages;
          return patchZonePage('prep', prepItems, prepPage, pages).then(function () {
            return true;
          });
        }
        if (zoneKey === 'ready') {
          const pages = pageCountForItems(readyItems.length, PAGE_SIZE);
          if (pages <= 1) {
            return Promise.resolve(false);
          }
          readyPage = (readyPage + 1) % pages;
          return patchZonePage('ready', readyItems, readyPage, pages).then(function () {
            return true;
          });
        }
        return Promise.resolve(false);
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
    compareNewestFirst: compareNewestFirst,
    MAX_POP_PER_PUSH: MAX_POP_PER_PUSH,
    PAGE_SIZE: PAGE_SIZE,
    GRID_COLS: GRID_COLS,
    GRID_ROWS: GRID_ROWS,
    isBoardFullyEmpty: isBoardFullyEmpty,
    pageCountForItems: pageCountForItems,
    layoutPageGrid: layoutPageGrid,
    gridPositionsForCells: gridPositionsForCells,
    computeViewportScale: computeViewportScale,
    renderNumberChip: renderNumberChip,
    DESIGN_LANDSCAPE_W: DESIGN_LANDSCAPE_W,
    DESIGN_LANDSCAPE_H: DESIGN_LANDSCAPE_H,
    landscapeArtLayout: function () {
      return QMS.Board && QMS.Board.LandscapeArtLayout ? QMS.Board.LandscapeArtLayout : null;
    },
    bootMilkshaBoard: bootMilkshaBoard,
  };
  if (QMS.MilkshaBoardAnim) {
    QMS.MilkshaBoard.shouldSkipBoardAnimations = QMS.MilkshaBoardAnim.shouldSkipBoardAnimations;
    QMS.MilkshaBoard.diffVisibleSlots = QMS.MilkshaBoardAnim.diffVisibleSlots;
    QMS.MilkshaBoard.isBulkSnapshotReplace = QMS.MilkshaBoardAnim.isBulkSnapshotReplace;
    QMS.MilkshaBoard.visibleIdToSlot = QMS.MilkshaBoardAnim.visibleIdToSlot;
  }
  QMS.bootMilkshaBoard = bootMilkshaBoard;
})(typeof window !== 'undefined' ? window : globalThis);
