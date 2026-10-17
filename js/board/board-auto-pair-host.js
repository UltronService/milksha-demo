/**
 * Board auto-pair host: cloud bind orchestration + hint UI timer.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  const HINT_ID = 'milksha-board-bind-hint';

  /**
   * @param {typeof root} win
   * @param {unknown} err
   */
  function warnBindFailedOnce(win, err) {
    if (win.__milkshaBoardAutoPairBindWarned) {
      return;
    }
    win.__milkshaBoardAutoPairBindWarned = true;
    try {
      win.console.warn('[board-auto-pair] bind failed', err && err.message ? err.message : err);
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * @param {Document} doc
   * @returns {HTMLElement|null}
   */
  function ensureHintElement(doc) {
    const existing = doc.getElementById(HINT_ID);
    if (existing) {
      return existing;
    }
    const canvas = doc.getElementById('milksha-board-canvas');
    if (!canvas) {
      return null;
    }
    const el = doc.createElement('div');
    el.id = HINT_ID;
    el.className = 'milksha-board-bind-hint';
    el.hidden = true;
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<span class="milksha-board-bind-hint__prefix">已綁定：</span>' +
      '<span class="milksha-board-bind-hint__name"></span>' +
      '<span class="milksha-board-bind-hint__suffix"></span>';
    canvas.appendChild(el);
    return el;
  }

  /**
   * @param {HTMLElement} el
   * @param {object} state
   * @param {Date} now
   */
  function renderBindHint(el, state, now) {
    const AutoPair = QMS.Board.AutoPair;
    if (!AutoPair || !state) {
      return;
    }
    const nameEl = el.querySelector('.milksha-board-bind-hint__name');
    const suffixEl = el.querySelector('.milksha-board-bind-hint__suffix');
    if (!nameEl || !suffixEl) {
      return;
    }
    const storeName = String(state.storeName || '');
    const storeNumber = String(state.storeNumber || '');
    nameEl.textContent = storeName;
    const year = AutoPair.taipeiCalendarYear(now);
    if (year >= AutoPair.MIN_YEAR_FOR_CLOCK) {
      const TB = QMS.Board.TodayBoard;
      const ymd = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
      const hm = TB && TB.formatTaipeiClockHM ? TB.formatTaipeiClockHM(now) : '00:00';
      suffixEl.textContent = storeNumber + ' ' + ymd + ' ' + hm;
      suffixEl.classList.add('milksha-board-bind-hint__time');
    } else {
      suffixEl.textContent = storeNumber;
      suffixEl.classList.remove('milksha-board-bind-hint__time');
    }
  }

  /**
   * @param {object} options
   */
  function startBoardAutoPair(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const win = opts.window || root;
    const doc = opts.document || win.document;
    const local = opts.localStorage || win.localStorage;
    const session = opts.sessionStorage || win.sessionStorage;
    const AutoPair = QMS.Board.AutoPair;
    const BoardBindApi = QMS.Transport && QMS.Transport.BoardBindApi;
    if (!AutoPair || !BoardBindApi) {
      return { stop: function () {} };
    }
    if (win.__milkshaBoardAutoPairController) {
      return win.__milkshaBoardAutoPairController;
    }

    const brandId = String(opts.brandId || '').trim();
    const storeId = String(opts.storeId || '').trim();
    const cloudApi = opts.cloudApi;
    const ensureAuth =
      typeof opts.ensureAuth === 'function'
        ? opts.ensureAuth
        : function () {
            return Promise.resolve();
          };
    const nowFn = typeof opts.now === 'function' ? opts.now : function () {
      return new Date();
    };
    const setTimeoutFn = opts.setTimeout || win.setTimeout.bind(win);
    const clearTimeoutFn = opts.clearTimeout || win.clearTimeout.bind(win);

    const hintEl = opts.hintEl || ensureHintElement(doc);
    let hintState = null;
    let minuteTimer = null;
    let stopped = false;

    function syncHintVisibility() {
      if (!hintEl) {
        return;
      }
      const show = hintState && AutoPair.shouldShowBindHint(local, session);
      if (!show) {
        hintEl.hidden = true;
        return;
      }
      renderBindHint(hintEl, hintState, nowFn());
      hintEl.hidden = false;
    }

    function armMinuteTimer() {
      if (minuteTimer) {
        clearTimeoutFn(minuteTimer);
        minuteTimer = null;
      }
      if (!hintState || !AutoPair.shouldShowBindHint(local, session)) {
        return;
      }
      const wait = AutoPair.msUntilNextTaipeiMinute(nowFn());
      minuteTimer = setTimeoutFn(function () {
        minuteTimer = null;
        syncHintVisibility();
        armMinuteTimer();
      }, wait);
    }

    function applyHintFontFromBoard() {
      if (!hintEl) {
        return;
      }
      const stage = doc.getElementById('board-root');
      if (!stage || !stage.style) {
        return;
      }
      const raw = stage.style.getPropertyValue('--milksha-num-font');
      const numPx = parseFloat(raw) || 88;
      const hintPx = AutoPair.bindHintFontPx(numPx);
      stage.style.setProperty('--milksha-bind-hint-font', hintPx + 'px');
    }

    function onBindSuccess(result, machineId) {
      const record = {
        brandId: brandId,
        storeId: storeId,
        machineId: machineId,
        storeName: result.storeName,
        storeNumber: result.storeNumber,
      };
      AutoPair.writeBindRecord(local, record);
      if (result.isFirstBind) {
        AutoPair.markBindHintSessionActive(local, session);
        hintState = {
          storeName: result.storeName,
          storeNumber: result.storeNumber,
        };
        applyHintFontFromBoard();
        syncHintVisibility();
        armMinuteTimer();
      }
    }

    function runBind() {
      if (stopped || !brandId || !storeId || !cloudApi) {
        return Promise.resolve();
      }
      if (!AutoPair.shouldSendBoardBind(local, brandId, storeId)) {
        const record = AutoPair.readBindRecord(local);
        if (record && AutoPair.shouldShowBindHint(local, session)) {
          hintState = {
            storeName: record.storeName,
            storeNumber: record.storeNumber,
          };
          applyHintFontFromBoard();
          syncHintVisibility();
          armMinuteTimer();
        }
        return Promise.resolve();
      }
      const machineId = AutoPair.getOrCreateMachineId(local);
      return ensureAuth()
        .then(function () {
          return BoardBindApi.requestBoardBind(cloudApi, {
            brandId: brandId,
            storeId: storeId,
            machineId: machineId,
          });
        })
        .then(function (result) {
          onBindSuccess(result, machineId);
        })
        .catch(function (err) {
          warnBindFailedOnce(win, err);
        });
    }

    runBind();

    const resizeHandler = function () {
      applyHintFontFromBoard();
    };
    win.addEventListener('resize', resizeHandler);

    const controller = {
      stop: function () {
        stopped = true;
        if (minuteTimer) {
          clearTimeoutFn(minuteTimer);
          minuteTimer = null;
        }
        win.removeEventListener('resize', resizeHandler);
        if (win.__milkshaBoardAutoPairController === controller) {
          win.__milkshaBoardAutoPairController = null;
        }
      },
      refreshHintForTests: function () {
        syncHintVisibility();
      },
      getHintStateForTests: function () {
        return hintState;
      },
    };
    win.__milkshaBoardAutoPairController = controller;
    return controller;
  }

  QMS.Board.AutoPairHost = {
    HINT_ID: HINT_ID,
    ensureHintElement: ensureHintElement,
    startBoardAutoPair: startBoardAutoPair,
    warnBindFailedOnce: warnBindFailedOnce,
  };
})(typeof window !== 'undefined' ? window : globalThis);
