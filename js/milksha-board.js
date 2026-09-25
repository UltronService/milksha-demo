/**
 * Milksha dual-zone call board (ready + preparing). Vanilla JS, STB-oriented.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const PAGE_INTERVAL_MS = 6000;
  const FRESH_BORDER_MS = 10000;
  const OVERLAY_TOTAL_MS = 2800;
  const OVERLAY_IN_MS = 300;
  const OVERLAY_HOLD_MS = 2200;
  const OVERLAY_OUT_MS = 300;
  const MAX_POP_PER_PUSH = 3;

  const SOURCE_DEFS = [
    { prefix: 'From_Store_', key: 'store' },
    { prefix: 'From_milksha_point_', key: 'point' },
    { prefix: 'From_FoodPanda_', key: 'fp' },
    { prefix: 'From_UberEat_', key: 'uber' },
    { prefix: 'From_Udd_', key: 'udd' },
  ];

  const TAG_STYLES = {
    store: { t: '現場', bg: '#F2F2F2', fg: '#111', bd: '2px solid #111', icon: '店' },
    point: { t: '迷點', bg: '#009E73', fg: '#000', bd: '2px solid #009E73', icon: '迷' },
    fp: { t: '熊貓', bg: '#CC79A7', fg: '#000', bd: '2px solid #CC79A7', icon: '熊' },
    uber: { t: 'Uber', bg: '#0072B2', fg: '#fff', bd: '2px solid #0072B2', icon: 'U' },
    udd: { t: 'UDD', bg: '#E69F00', fg: '#000', bd: '2px solid #E69F00', icon: 'D' },
  };

  const LAYOUT_LANDSCAPE = {
    W: 1920,
    H: 1080,
    header: 80,
    split: 'row',
    readyFrac: 0.62,
    ready: { cols: 3, rows: 4, font: 140, tagSize: 30, titleH: 84, titleF: 50 },
    prep: { cols: 2, rows: 9, font: 64, tagSize: 24, titleH: 84, titleF: 42 },
    overlay: { font: 320, tag: 64 },
  };

  const LAYOUT_PORTRAIT = {
    W: 1080,
    H: 1920,
    header: 90,
    split: 'col',
    readyFrac: 0.6,
    ready: { cols: 2, rows: 4, font: 180, tagSize: 34, titleH: 90, titleF: 52 },
    prep: { cols: 3, rows: 5, font: 80, tagSize: 26, titleH: 84, titleF: 44 },
    overlay: { font: 300, tag: 64 },
  };

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
   * @param {string} sourceKey
   * @param {number} sizePx
   * @returns {string}
   */
  function renderTagHtml(sourceKey, sizePx) {
    const s = TAG_STYLES[sourceKey];
    if (!s) {
      return '';
    }
    return (
      '<span class="milksha-tag" style="background:' +
      s.bg +
      ';color:' +
      s.fg +
      ';border:' +
      s.bd +
      ';font-size:' +
      sizePx +
      'px"><b class="ic">' +
      s.icon +
      '</b>' +
      s.t +
      '</span>'
    );
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
      '<div class="milksha-board" id="milksha-board"></div></div>' +
      '<div class="milksha-ov" id="milksha-ov" aria-hidden="true">' +
      '<div class="milksha-ovbox" id="milksha-ovbox"></div></div>';

    const boardViewportEl = doc.getElementById('milksha-board-viewport');
    const boardEl = doc.getElementById('milksha-board');
    const ovEl = doc.getElementById('milksha-ov');
    const ovBoxEl = doc.getElementById('milksha-ovbox');

    let isFirstPayload = true;
    let prevReadyIdSet = new Set();
    const metaById = {};
    let readyItems = [];
    let prepItems = [];
    let freshUntil = {};
    let readyPage = 0;
    let prepPage = 0;
    let readyPageStartedAt = Date.now();
    let prepPageStartedAt = Date.now();
    let readyTimer = null;
    let prepTimer = null;
    let freshTimer = null;
    let clockTimer = null;
    let popQueue = [];
    let popRunning = false;
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
      const shortLandscape = orientation === 'landscape' && vh <= 500;
      const ovNumPx = Math.min(
        cfg.overlay.font,
        Math.round(vw * (shortLandscape ? 0.12 : 0.22)),
        Math.round(vh * (shortLandscape ? 0.26 : 0.55)),
      );
      const ovTagPx = Math.min(
        cfg.overlay.tag,
        Math.round(vw * (shortLandscape ? 0.055 : 0.08)),
        Math.round(vh * (shortLandscape ? 0.08 : 0.12)),
      );
      rootEl.style.setProperty('--milksha-ov-num', ovNumPx + 'px');
      rootEl.style.setProperty('--milksha-ov-tag', ovTagPx + 'px');
      rootEl.style.setProperty('--milksha-ov-peak', shortLandscape ? '0.72' : '1');
    }

    function formatClock() {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return h + ':' + m;
    }

    function pageCount(items, perPage) {
      if (!perPage || items.length === 0) {
        return 1;
      }
      return Math.max(1, Math.ceil(items.length / perPage));
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

    function slicePage(items, page, perPage) {
      const start = page * perPage;
      return items.slice(start, start + perPage);
    }

    function progressWidth(startedAt) {
      const elapsed = Date.now() - startedAt;
      return Math.min(1, elapsed / PAGE_INTERVAL_MS);
    }

    function scheduleZoneTimers() {
      if (readyTimer) {
        clearInterval(readyTimer);
      }
      if (prepTimer) {
        clearInterval(prepTimer);
      }
      readyTimer = setInterval(function () {
        const cfg = layoutConfig();
        const perPage = cfg.ready.cols * cfg.ready.rows;
        const pages = pageCount(readyItems, perPage);
        if (pages <= 1) {
          return;
        }
        readyPage = (readyPage + 1) % pages;
        readyPageStartedAt = Date.now();
        renderBoard();
      }, PAGE_INTERVAL_MS);
      prepTimer = setInterval(function () {
        const cfg = layoutConfig();
        const perPage = cfg.prep.cols * cfg.prep.rows;
        const pages = pageCount(prepItems, perPage);
        if (pages <= 1) {
          return;
        }
        prepPage = (prepPage + 1) % pages;
        prepPageStartedAt = Date.now();
        renderBoard();
      }, PAGE_INTERVAL_MS);
    }

    function scheduleFreshSweep() {
      if (freshTimer) {
        clearInterval(freshTimer);
      }
      freshTimer = setInterval(function () {
        const now = Date.now();
        let changed = false;
        const keys = Object.keys(freshUntil);
        for (let i = 0; i < keys.length; i += 1) {
          if (freshUntil[keys[i]] <= now) {
            delete freshUntil[keys[i]];
            changed = true;
          }
        }
        if (changed) {
          renderBoard();
        }
      }, 500);
    }

    function renderBoard() {
      const cfg = layoutConfig();
      const vert = cfg.split === 'col';
      const logoSrc = brand.assets && brand.assets.logo ? brand.assets.logo : '';
      const hH = cfg.header;
      const rW = vert ? cfg.W : Math.round(cfg.W * cfg.readyFrac);
      const rH = vert ? Math.round((cfg.H - hH) * cfg.readyFrac) : cfg.H - hH;
      const pW = vert ? cfg.W : cfg.W - rW;
      const pH = vert ? cfg.H - hH - rH : cfg.H - hH;

      const readyPer = cfg.ready.cols * cfg.ready.rows;
      const prepPer = cfg.prep.cols * cfg.prep.rows;
      const readyPages = pageCount(readyItems, readyPer);
      const prepPages = pageCount(prepItems, prepPer);
      readyPage = clampPage(readyPage, readyPages);
      prepPage = clampPage(prepPage, prepPages);

      const readySlice = slicePage(readyItems, readyPage, readyPer);
      const prepSlice = slicePage(prepItems, prepPage, prepPer);

      function zoneHtml(cls, x, y, w, hh, title, sub, page, totalPages, zcfg, slice, isReady, progStart) {
        const showPager = totalPages > 1;
        let z =
          '<div class="milksha-zone ' +
          cls +
          (vert ? ' portrait' : '') +
          '" style="left:' +
          x +
          'px;top:' +
          y +
          'px;width:' +
          w +
          'px;height:' +
          hh +
          'px">';
        z +=
          '<div class="milksha-ztitle" style="height:' +
          zcfg.titleH +
          'px;font-size:' +
          zcfg.titleF +
          'px"><span>' +
          title +
          ' <em>' +
          sub +
          '</em></span>';
        if (showPager) {
          z +=
            '<span class="milksha-pg" style="font-size:' +
            Math.round(zcfg.titleF * 0.7) +
            'px">' +
            (page + 1) +
            '/' +
            totalPages +
            '</span>';
        }
        z += '</div>';
        z +=
          '<div class="milksha-grid" style="grid-template-columns:repeat(' +
          zcfg.cols +
          ',minmax(0,1fr));grid-template-rows:repeat(' +
          zcfg.rows +
          ',1fr);height:' +
          (hh - zcfg.titleH - 24) +
          'px">';
        for (let i = 0; i < zcfg.cols * zcfg.rows; i += 1) {
          const item = slice[i];
          if (!item) {
            z += '<div class="milksha-card ' + (isReady ? 'r' : 'p') + '"></div>';
            continue;
          }
          const fresh = isReady && freshUntil[item.id] && freshUntil[item.id] > Date.now();
          if (isReady) {
            z +=
              '<div class="milksha-card r' +
              (fresh ? ' fresh' : '') +
              '"><div>' +
              renderTagHtml(item.sourceKey, zcfg.tagSize) +
              '</div><div class="milksha-num" style="font-size:' +
              zcfg.font +
              'px">' +
              item.number +
              '</div></div>';
          } else {
            z +=
              '<div class="milksha-card p">' +
              renderTagHtml(item.sourceKey, zcfg.tagSize) +
              '<span class="milksha-num" style="font-size:' +
              zcfg.font +
              'px">' +
              item.number +
              '</span></div>';
          }
        }
        z += '</div>';
        if (showPager) {
          const pw = progressWidth(progStart);
          z +=
            '<div class="milksha-prog-wrap"><span class="milksha-prog-bar" style="transform:scaleX(' +
            pw +
            ')"></span></div>';
        }
        return z + '</div>';
      }

      const logoTag = logoSrc
        ? '<img src="' + logoSrc + '" alt="' + brand.displayName + '">'
        : brand.displayName;

      let html =
        '<div class="milksha-hdr" style="height:' +
        hH +
        'px"><div class="milksha-logo milksha-logo-fallback">' +
        logoTag +
        '</div><div class="milksha-htitle">取餐叫號</div><div class="milksha-clock" id="milksha-clock">' +
        formatClock() +
        '</div></div>';

      html += zoneHtml(
        'milksha-ready ready',
        0,
        hH,
        rW,
        rH,
        '可取餐',
        '請取餐 Ready',
        readyPage,
        readyPages,
        cfg.ready,
        readySlice,
        true,
        readyPageStartedAt,
      );
      html += zoneHtml(
        'milksha-prep prep',
        vert ? 0 : rW,
        vert ? hH + rH : hH,
        pW,
        pH,
        '準備中',
        'Preparing',
        prepPage,
        prepPages,
        cfg.prep,
        prepSlice,
        false,
        prepPageStartedAt,
      );

      boardEl.innerHTML = html;
    }

    function runPopQueue() {
      if (popRunning || popQueue.length === 0) {
        return;
      }
      const nextId = popQueue.shift();
      const item = findItem(nextId);
      if (!item) {
        runPopQueue();
        return;
      }
      popRunning = true;
      const cfg = layoutConfig();
      ovBoxEl.className = 'milksha-ovbox';
      ovBoxEl.innerHTML =
        '<div>' +
        renderTagHtml(item.sourceKey, cfg.overlay.tag) +
        '</div><div class="milksha-ovnum">' +
        item.number +
        '</div><div class="milksha-ovtxt">' +
        brand.copy.pickupHint +
        '</div>';
      ovEl.style.opacity = '1';
      ovEl.classList.add('visible');
      ovEl.setAttribute('aria-hidden', 'false');

      audio.playDingDong().then(function () {
        logSound(item.id);
      });

      requestAnimationFrame(function () {
        ovBoxEl.classList.add('phase-in');
      });

      setTimeout(function () {
        ovBoxEl.classList.remove('phase-in');
        ovBoxEl.classList.add('phase-out');
      }, OVERLAY_IN_MS + OVERLAY_HOLD_MS);

      setTimeout(function () {
        ovEl.style.opacity = '0';
        ovEl.classList.remove('visible');
        ovEl.setAttribute('aria-hidden', 'true');
        ovBoxEl.className = 'milksha-ovbox';
        popRunning = false;
        runPopQueue();
      }, OVERLAY_TOTAL_MS);
    }

    /**
     * @param {Array<{ source_type: string, number: string }>} numberContent
     */
    function applyPayload(numberContent) {
      const now = Date.now();
      const parts = partitionNumberContent(numberContent);
      const newReadyIds = detectNewlyReady(prevReadyIdSet, parts.ready);

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
          delete freshUntil[k];
        }
      });
      Object.keys(nextMeta).forEach(function (k) {
        metaById[k] = nextMeta[k];
      });

      readyItems = nextReady;
      prepItems = nextPrep;

      if (!isFirstPayload && newReadyIds.length > 0) {
        readyPage = 0;
        readyPageStartedAt = now;
        const split = splitPopQueue(newReadyIds);
        for (let p = 0; p < split.popIds.length; p += 1) {
          popQueue.push(split.popIds[p]);
        }
        for (let f = 0; f < newReadyIds.length; f += 1) {
          freshUntil[newReadyIds[f]] = now + FRESH_BORDER_MS;
        }
        runPopQueue();
      }

      prevReadyIdSet = new Set();
      for (let r = 0; r < readyItems.length; r += 1) {
        prevReadyIdSet.add(readyItems[r].id);
      }

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
    scheduleFreshSweep();
    clockTimer = setInterval(function () {
      const el = doc.getElementById('milksha-clock');
      if (el) {
        el.textContent = formatClock();
      }
    }, 10000);

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
        if (freshTimer) {
          clearInterval(freshTimer);
        }
        if (clockTimer) {
          clearInterval(clockTimer);
        }
      },
    };

    QMS.runtime = runtime;
    return runtime;
  }

  QMS.MilkshaBoard = {
    parseSourceType: parseSourceType,
    partitionNumberContent: partitionNumberContent,
    detectNewlyReady: detectNewlyReady,
    splitPopQueue: splitPopQueue,
    makeItemId: makeItemId,
    MAX_POP_PER_PUSH: MAX_POP_PER_PUSH,
    bootMilkshaBoard: bootMilkshaBoard,
  };
  QMS.bootMilkshaBoard = bootMilkshaBoard;
})(typeof window !== 'undefined' ? window : globalThis);
