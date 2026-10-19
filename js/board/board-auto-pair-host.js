/**
 * Board auto-pair host: cloud pair orchestration + hint UI timer.
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
   * @param {typeof root} win
   * @param {string} message
   */
  function showPairBootError(win, message) {
    const text = String(message || '').trim() || '找不到目標叫號機';
    if (QMS.showBootError) {
      QMS.showBootError(text);
      return;
    }
    try {
      win.console.error('[board-auto-pair]', text);
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
      return { stop: function () {}, whenPaired: Promise.resolve() };
    }
    if (win.__milkshaBoardAutoPairController) {
      return win.__milkshaBoardAutoPairController;
    }

    const brandPack = opts.brandPack || opts.brand || null;
    const brandId = String(
      opts.brandId || (brandPack && brandPack.brandId) || '',
    ).trim();
    const StoreId = QMS.Shared && QMS.Shared.StoreId;
    const storeNumberRaw = String(opts.storeNumber || opts.storeId || '').trim();
    const storeNumber =
      StoreId && StoreId.normalizeStoreId
        ? StoreId.normalizeStoreId(storeNumberRaw)
        : storeNumberRaw.toLowerCase();
    const cloudApi = opts.cloudApi;
    const signInWithCustomToken =
      typeof opts.signInWithCustomToken === 'function' ? opts.signInWithCustomToken : null;
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

    function restoreHintFromRecord() {
      const record = AutoPair.readBindRecord(local);
      if (!record || !AutoPair.shouldShowBindHint(local, session)) {
        return;
      }
      hintState = {
        storeName: record.storeName,
        storeNumber: record.storeNumber,
      };
      applyHintFontFromBoard();
      syncHintVisibility();
      armMinuteTimer();
    }

    /**
     * @param {object} result
     * @param {string} deviceId
     */
    function onPairSuccess(result, deviceId) {
      const record = {
        brandId: brandId,
        storeId: result.storeId,
        deviceId: deviceId,
        storeName: result.storeName,
        storeNumber: result.storeNumber,
      };
      AutoPair.writeBindRecord(local, record);
      if (AutoPair.shouldActivateBindHint(result.isFirstBind, local)) {
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

    function handlePairFailure(err) {
      warnBindFailedOnce(win, err);
      if (err && err.pairOkFalse) {
        showPairBootError(win, err.message || '找不到目標叫號機');
        return;
      }
      const msg =
        err && err.response && err.response.message
          ? String(err.response.message)
          : err && err.message
            ? String(err.message)
            : '找不到目標叫號機';
      showPairBootError(win, msg);
    }

    function runPair() {
      if (stopped || !cloudApi) {
        return Promise.resolve(null);
      }
      const deviceId = String(opts.deviceId || AutoPair.getOrCreateDeviceId(local)).trim();
      const record = AutoPair.readBindRecord(local);
      let payload;
      if (AutoPair.hasBindRecord(local) && record) {
        payload = {
          mode: 'read',
          storeId: String(record.storeId || '').trim(),
          deviceId: deviceId,
        };
      } else {
        const apiBrand = AutoPair.resolveApiBrand(
          brandPack || { brandId: brandId },
        );
        if (!apiBrand || !storeNumber) {
          return Promise.resolve(null);
        }
        payload = {
          brand: apiBrand,
          storeNumber: storeNumber,
          deviceId: deviceId,
        };
      }
      return BoardBindApi.requestBoardAutoPair(cloudApi, payload)
        .then(function (result) {
          if (!signInWithCustomToken) {
            const err = new Error('signInWithCustomToken missing');
            err.status = 500;
            throw err;
          }
          return signInWithCustomToken(result.customToken).then(function () {
            onPairSuccess(result, deviceId);
            return result;
          });
        })
        .catch(function (err) {
          handlePairFailure(err);
          throw err;
        });
    }

    const whenPaired = runPair().catch(function () {
      return null;
    });

    restoreHintFromRecord();

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
      whenPaired: whenPaired,
      runPairForTests: runPair,
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
    showPairBootError: showPairBootError,
  };
})(typeof window !== 'undefined' ? window : globalThis);
