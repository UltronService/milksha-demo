/**
 * Continuous store simulation — pure logic (injectable clock + RNG).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Controller = QMS.Controller || {};

  const SOURCE_KEYS = ['store', 'point', 'fp', 'uber', 'udd'];

  /** Sum ≈ 1 — store majority; remainder split across delivery / 你訂 sources. */
  const SOURCE_PICK_WEIGHTS = {
    store: 0.7,
    point: 0.075,
    fp: 0.075,
    uber: 0.075,
    udd: 0.075,
  };

  const BOARD_NUMBER_FOUR_DIGIT = /^\d{4}$/;
  const BOARD_NUMBER_DIGIT_3_TO_4 = /^\d{3,4}$/;
  const BOARD_NUMBER_DIGIT_4_TO_6 = /^\d{4,6}$/;
  const BOARD_NUMBER_ALNUM_4_TO_6 = /^[A-Za-z0-9]{4,6}$/;
  const ALNUM_POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const MODE_TIMING = {
    normal: {
      arrivalMeanMs: 20000,
      prepMeanMs: 60000,
      pickupMeanMs: 30000,
    },
    peak: {
      arrivalMeanMs: 5000,
      prepMeanMs: 60000,
      pickupMeanMs: 30000,
    },
  };

  const SKIP_NUMBER_PROBABILITY = 0.25;
  const ORDER_NO_MIN = 1;
  const ORDER_NO_MAX = 9999;
  const ALLOWED_PROJECT_ID = 'milksha-qms-dev';
  const RECONCILE_ORDER_GUARD = 20000;

  /**
   * @param {() => number} rng — uniform [0, 1)
   * @returns {number}
   */
  function jitteredMs(meanMs, rng) {
    const m = Math.max(1, Number(meanMs) || 1);
    const factor = 0.5 + rng() * 1.0;
    return Math.max(1, Math.round(m * factor));
  }

  /**
   * @param {string} sourceKey
   * @param {string} no
   * @returns {string}
   */
  function ticketCompositeKey(sourceKey, no) {
    return String(sourceKey || 'store') + ':' + String(no);
  }

  /**
   * Mirrors `normalizeBoardDisplayNumber` when MilkshaBoard is not loaded (Node tests).
   * @param {unknown} raw
   * @param {string} sourceKey
   * @returns {string | null}
   */
  function normalizeSimNumber(raw, sourceKey) {
    const MB = root.QMS && root.QMS.MilkshaBoard;
    if (MB && typeof MB.normalizeBoardDisplayNumber === 'function') {
      return MB.normalizeBoardDisplayNumber(typeof raw === 'string' ? raw : String(raw == null ? '' : raw), sourceKey);
    }
    if (typeof raw !== 'string') {
      return null;
    }
    const key = sourceKey || 'store';
    let working = typeof raw === 'string' ? raw : String(raw == null ? '' : raw);
    if (key === 'fp') {
      working = working.replace(/#/g, '');
    }
    const trimmed = working.trim();
    if (trimmed.length > 6) {
      return null;
    }
    if (key === 'store') {
      return BOARD_NUMBER_FOUR_DIGIT.test(trimmed) ? trimmed : null;
    }
    if (key === 'point') {
      return BOARD_NUMBER_DIGIT_3_TO_4.test(trimmed) ? trimmed : null;
    }
    if (key === 'fp') {
      return BOARD_NUMBER_DIGIT_4_TO_6.test(trimmed) ? trimmed : null;
    }
    if (key === 'uber' || key === 'udd') {
      if (!BOARD_NUMBER_ALNUM_4_TO_6.test(trimmed)) {
        return null;
      }
      return trimmed.toUpperCase();
    }
    return null;
  }

  /**
   * @param {() => number} rng
   * @returns {string}
   */
  function pickSourceKey(rng) {
    const r = rng();
    let acc = 0;
    for (let i = 0; i < SOURCE_KEYS.length; i += 1) {
      const key = SOURCE_KEYS[i];
      acc += SOURCE_PICK_WEIGHTS[key] != null ? SOURCE_PICK_WEIGHTS[key] : 0;
      if (r < acc) {
        return key;
      }
    }
    return SOURCE_KEYS[0];
  }

  /**
   * @param {number} length
   * @param {() => number} rng
   * @returns {string}
   */
  function randomDigitString(length, rng) {
    let s = '';
    for (let i = 0; i < length; i += 1) {
      s += String(Math.floor(rng() * 10));
    }
    return s;
  }

  /**
   * @param {() => number} rng
   * @returns {string}
   */
  function randomPointNumber(rng) {
    const len = rng() < 0.5 ? 3 : 4;
    return randomDigitString(len, rng);
  }

  /**
   * @param {number} minLen
   * @param {number} maxLen
   * @param {() => number} rng
   * @returns {string}
   */
  function randomAlnumNumber(minLen, maxLen, rng) {
    const lo = Math.max(1, minLen);
    const hi = Math.max(lo, maxLen);
    const len = lo + Math.floor(rng() * (hi - lo + 1));
    let s = '';
    for (let i = 0; i < len; i += 1) {
      s += ALNUM_POOL.charAt(Math.floor(rng() * ALNUM_POOL.length));
    }
    return s;
  }

  /**
   * @param {() => number} rng
   * @returns {string}
   */
  function randomFpNumber(rng) {
    const len = 4 + Math.floor(rng() * 3);
    return randomDigitString(len, rng);
  }

  /**
   * @param {() => number} rng
   * @returns {string}
   */
  function randomUberHexNumber(rng) {
    return randomAlnumNumber(4, 6, rng);
  }

  /**
   * @param {number} n
   * @returns {string}
   */
  function formatOrderNo(n) {
    const v = Math.max(ORDER_NO_MIN, Math.min(ORDER_NO_MAX, Math.floor(Number(n) || ORDER_NO_MIN)));
    return String(v).padStart(4, '0');
  }

  /**
   * @param {string} no
   * @returns {number}
   */
  function parseOrderNo(no) {
    const n = Number(String(no || '').trim());
    if (!Number.isFinite(n)) {
      return 0;
    }
    return n;
  }

  /**
   * @param {Array<{ no: string }>} tickets
   * @returns {number}
   */
  function maxNumericTicketNo(tickets) {
    let max = 0;
    (tickets || []).forEach(function (t) {
      const sk = t && t.sourceKey ? t.sourceKey : 'store';
      if (sk !== 'store') {
        return;
      }
      const n = parseOrderNo(t.no);
      if (n > max) {
        max = n;
      }
    });
    return max;
  }

  /**
   * @param {Set<string>} usedOnBoard
   * @returns {number}
   */
  function wrapOrderCounter(n) {
    let v = n;
    if (v > ORDER_NO_MAX) {
      v = ORDER_NO_MIN;
    }
    if (v < ORDER_NO_MIN) {
      v = ORDER_NO_MIN;
    }
    return v;
  }

  /**
   * @param {SimulationState} state
   * @param {Set<string>} usedOnBoard
   * @param {() => number} rng
   * @returns {string}
   */
  function allocateNextNumber(state, usedOnBoard, rng) {
    let candidate = state.lastIssuedNumber > 0 ? state.lastIssuedNumber + 1 : ORDER_NO_MIN;
    candidate = wrapOrderCounter(candidate);
    if (rng() < SKIP_NUMBER_PROBABILITY) {
      candidate += 1 + Math.floor(rng() * 3);
      candidate = wrapOrderCounter(candidate);
    }
    let guard = 0;
    while (usedOnBoard.has(ticketCompositeKey('store', formatOrderNo(candidate))) && guard < ORDER_NO_MAX + 10) {
      guard += 1;
      candidate += 1;
      candidate = wrapOrderCounter(candidate);
    }
    state.lastIssuedNumber = candidate;
    return formatOrderNo(candidate);
  }

  /**
   * @param {string} sourceKey
   * @param {SimulationState} state
   * @param {Set<string>} usedOnBoard — composite keys `sourceKey:no`
   * @param {() => number} rng
   * @returns {string}
   */
  function allocateNumberForSource(sourceKey, state, usedOnBoard, rng) {
    const key = sourceKey || 'store';
    if (key === 'store') {
      return allocateNextNumber(state, usedOnBoard, rng);
    }
    let guard = 0;
    while (guard < 400) {
      guard += 1;
      let raw;
      if (key === 'point') {
        raw = randomPointNumber(rng);
      } else if (key === 'fp') {
        raw = randomFpNumber(rng);
      } else if (key === 'uber') {
        raw = randomUberHexNumber(rng);
      } else if (key === 'udd') {
        raw = randomAlnumNumber(4, 6, rng);
      } else {
        raw = allocateNextNumber(state, usedOnBoard, rng);
      }
      const normalized = normalizeSimNumber(raw, key);
      if (!normalized) {
        continue;
      }
      const composite = ticketCompositeKey(key, normalized);
      if (!usedOnBoard.has(composite)) {
        return normalized;
      }
    }
    return allocateNextNumber(state, usedOnBoard, rng);
  }

  /**
   * @param {SimRecord[]} records
   * @param {number} nowMs
   * @returns {Set<string>}
   */
  function activeNumbersOnBoard(records, nowMs) {
    const set = new Set();
    (records || []).forEach(function (rec) {
      if (nowMs < rec.removeAtMs) {
        set.add(ticketCompositeKey(rec.sourceKey, rec.no));
      }
    });
    return set;
  }

  /**
   * @param {Partial<SimulationState>} [seed]
   * @returns {SimulationState}
   */
  function createSimulationState(seed) {
    const base = {
      mode: null,
      running: false,
      stoppedReason: null,
      startedAtMs: 0,
      lastIssuedNumber: 0,
      nextNewOrderAtMs: 0,
      records: [],
      sendCount: 0,
      frozenAtMs: null,
    };
    return Object.assign(base, seed || {});
  }

  /**
   * @param {SimRecord[]} records
   * @param {number} nowMs
   * @returns {Array<{ no: string, status: string, sourceKey: string, updatedAt: string }>}
   */
  function recordsToTickets(records, nowMs) {
    const iso = new Date(nowMs).toISOString();
    const out = [];
    (records || []).forEach(function (rec) {
      if (nowMs >= rec.removeAtMs) {
        return;
      }
      const status = nowMs >= rec.readyAtMs ? 'ready' : 'preparing';
      out.push({
        no: rec.no,
        status: status,
        sourceKey: rec.sourceKey,
        updatedAt: iso,
      });
    });
    return out;
  }

  /**
   * @param {SimulationState} state
   * @param {number} nowMs
   */
  function pruneRemovedRecords(state, nowMs) {
    state.records = (state.records || []).filter(function (rec) {
      return nowMs < rec.removeAtMs;
    });
  }

  /**
   * @param {SimulationState} state
   * @param {string} reason
   */
  function stopSimulation(state, reason, nowMs) {
    state.running = false;
    state.stoppedReason = reason || 'stopped';
    if (Number.isFinite(nowMs)) {
      state.frozenAtMs = nowMs;
    }
  }

  /**
   * @param {SimulationState} state
   * @param {'normal'|'peak'} mode
   * @param {number} nowMs
   * @param {Array<{ no: string, sourceKey?: string }>} existingTickets
   * @param {() => number} rng
   */
  function startOrSwitchSimulation(state, mode, nowMs, existingTickets, rng) {
    const timing = MODE_TIMING[mode];
    if (!timing) {
      return;
    }
    const maxNo = maxNumericTicketNo(existingTickets);
    if (maxNo > state.lastIssuedNumber) {
      state.lastIssuedNumber = maxNo;
    }
    if (!state.running) {
      state.startedAtMs = nowMs;
      state.stoppedReason = null;
      state.frozenAtMs = null;
      state.nextNewOrderAtMs = nowMs;
    }
    state.mode = mode;
    state.running = true;
  }

  /**
   * @param {SimulationState} state
   * @param {number} nowMs
   * @param {() => number} rng
   * @returns {{ tickets: object[], changed: boolean }}
   */
  function reconcileSimulation(state, nowMs, rng) {
    let changed = false;
    if (!state.running || !state.mode) {
      const viewNow = state.frozenAtMs != null ? state.frozenAtMs : nowMs;
      return { tickets: recordsToTickets(state.records, viewNow), changed: false };
    }

    const beforeLen = state.records.length;
    pruneRemovedRecords(state, nowMs);
    if (state.records.length !== beforeLen) {
      changed = true;
    }

    const timing = MODE_TIMING[state.mode];
    let guard = 0;
    while (state.running && nowMs >= state.nextNewOrderAtMs && guard < RECONCILE_ORDER_GUARD) {
      guard += 1;
      const used = activeNumbersOnBoard(state.records, nowMs);
      const sourceKey = pickSourceKey(rng);
      const no = allocateNumberForSource(sourceKey, state, used, rng);
      used.add(ticketCompositeKey(sourceKey, no));
      const prepMs = jitteredMs(timing.prepMeanMs, rng);
      const pickupMs = jitteredMs(timing.pickupMeanMs, rng);
      const enteredAtMs = state.nextNewOrderAtMs;
      state.records.push({
        no: no,
        sourceKey: sourceKey,
        enteredAtMs: enteredAtMs,
        readyAtMs: enteredAtMs + prepMs,
        removeAtMs: enteredAtMs + prepMs + pickupMs,
      });
      state.nextNewOrderAtMs = enteredAtMs + jitteredMs(timing.arrivalMeanMs, rng);
      changed = true;
    }

    return {
      tickets: recordsToTickets(state.records, nowMs),
      changed: changed,
    };
  }

  /**
   * @param {SimulationState} state
   * @param {number} nowMs
   * @returns {number|null}
   */
  function nextWakeAtMs(state, nowMs) {
    if (!state.running) {
      return null;
    }
    let next = state.nextNewOrderAtMs;
    (state.records || []).forEach(function (rec) {
      if (rec.readyAtMs > nowMs) {
        next = Math.min(next, rec.readyAtMs);
      }
      if (rec.removeAtMs > nowMs) {
        next = Math.min(next, rec.removeAtMs);
      }
    });
    if (!Number.isFinite(next) || next <= nowMs) {
      return nowMs + 50;
    }
    return next;
  }

  /**
   * @param {string} storeId
   * @param {string} projectId
   * @returns {{ allowed: boolean, reason: string }}
   */
  function simulationEligibility(storeId, projectId) {
    void storeId;
    const pid = String(projectId || '').trim() || ALLOWED_PROJECT_ID;
    if (pid !== ALLOWED_PROJECT_ID) {
      return { allowed: false, reason: '持續模擬僅限 Firebase 專案 milksha-qms-dev' };
    }
    return { allowed: true, reason: '' };
  }

  /**
   * @param {'normal'|'peak'} mode
   * @param {number} durationMs
   * @param {{ now: () => number, rng: () => number }} clock
   * @param {Array<{ no: string }>} [seedTickets]
   * @returns {object}
   */
  function runSimulationAnalysis(mode, durationMs, clock, seedTickets) {
    const rng = clock.rng;
    const state = createSimulationState();
    const t0 = clock.now();
    startOrSwitchSimulation(state, mode, t0, seedTickets || [], rng);

    const arrivals = [];
    const boardCounts = [];
    const prepGt10 = [];
    const recordLenSamples = [];
    let prevCount = 0;
    let sends = 0;
    let lastSnapshot = '';
    let timerSteps = 0;
    let skipCount = 0;
    let orderCount = 0;
    let prevIssued = 0;

    const endAt = t0 + durationMs;
    let now = t0;
    while (now < endAt && state.running) {
      timerSteps += 1;
      const beforeOrders = state.records.length;
      const res = reconcileSimulation(state, now, rng);
      if (state.records.length > beforeOrders) {
        for (let ri = beforeOrders; ri < state.records.length; ri += 1) {
          const rec = state.records[ri];
          if (rec.sourceKey !== 'store') {
            continue;
          }
          const n = parseOrderNo(rec.no);
          orderCount += 1;
          if (prevIssued > 0) {
            let expected = prevIssued + 1;
            if (expected > ORDER_NO_MAX) {
              expected = ORDER_NO_MIN;
            }
            if (n !== expected) {
              skipCount += 1;
            }
          }
          prevIssued = n;
        }
      }
      recordLenSamples.push(state.records.length);
      const snap = JSON.stringify(
        res.tickets.map(function (t) {
          return t.no + ':' + t.status;
        }),
      );
      if (res.changed || snap !== lastSnapshot) {
        sends += 1;
        lastSnapshot = snap;
      }
      const count = res.tickets.length;
      boardCounts.push(count);
      const prep = res.tickets.filter(function (t) {
        return t.status === 'preparing';
      }).length;
      prepGt10.push(prep > 10 ? 1 : 0);
      if (count > prevCount) {
        arrivals.push(now);
      }
      prevCount = count;
      const wake = nextWakeAtMs(state, now);
      if (wake == null) {
        break;
      }
      now = Math.min(endAt, wake);
    }

    const gaps = [];
    for (let i = 1; i < arrivals.length; i += 1) {
      gaps.push(arrivals[i] - arrivals[i - 1]);
    }
    gaps.sort(function (a, b) {
      return a - b;
    });
    boardCounts.sort(function (a, b) {
      return a - b;
    });
    recordLenSamples.sort(function (a, b) {
      return a - b;
    });

    function percentile(sorted, p) {
      if (!sorted.length) {
        return 0;
      }
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
      return sorted[idx];
    }

    const msHour = 3600000;
    const msDay = 86400000;

    return {
      mode: mode,
      durationMs: durationMs,
      sendEstimate: sends,
      timerSteps: timerSteps,
      maxInternalRecords: recordLenSamples.length ? recordLenSamples[recordLenSamples.length - 1] : 0,
      medianInternalRecords: recordLenSamples.length ? percentile(recordLenSamples, 0.5) : 0,
      sendsPerHour: durationMs > 0 ? (sends * msHour) / durationMs : 0,
      sendsPerDay: durationMs > 0 ? (sends * msDay) / durationMs : 0,
      arrivalGapMs: {
        min: gaps.length ? gaps[0] : 0,
        median: gaps.length ? percentile(gaps, 0.5) : 0,
        max: gaps.length ? gaps[gaps.length - 1] : 0,
        count: gaps.length,
      },
      boardCount: {
        min: boardCounts.length ? boardCounts[0] : 0,
        median: boardCounts.length ? percentile(boardCounts, 0.5) : 0,
        p05: boardCounts.length ? percentile(boardCounts, 0.05) : 0,
        p95: boardCounts.length ? percentile(boardCounts, 0.95) : 0,
        max: boardCounts.length ? boardCounts[boardCounts.length - 1] : 0,
      },
      prepOver10Ratio: prepGt10.length
        ? prepGt10.reduce(function (a, b) {
            return a + b;
          }, 0) / prepGt10.length
        : 0,
      skipRatio: orderCount > 1 ? skipCount / orderCount : 0,
      skipCount: skipCount,
      orderCount: orderCount,
    };
  }

  /**
   * Cloud/board push guard (mirrors backend PR #20 rules for simulator output).
   * @param {Array<{ no: string, status?: string }>} tickets
   * @returns {{ ok: true } | { ok: false, reason: string, no?: string }}
   */
  function validateTicketsForBoardPush(tickets) {
    const list = Array.isArray(tickets) ? tickets : [];
    const ready = new Set();
    const prep = new Set();
    for (let i = 0; i < list.length; i += 1) {
      const row = list[i];
      const sourceKey = String(row && row.sourceKey != null ? row.sourceKey : 'store');
      const rawNo = String(row && row.no != null ? row.no : '').trim();
      const no = normalizeSimNumber(rawNo, sourceKey);
      if (!no) {
        return { ok: false, reason: 'invalid-number', no: rawNo, sourceKey: sourceKey };
      }
      const id = ticketCompositeKey(sourceKey, no);
      const status = String(row.status || '');
      if (status === 'ready') {
        if (ready.has(id)) {
          return { ok: false, reason: 'duplicate-in-list', no: no, sourceKey: sourceKey };
        }
        if (prep.has(id)) {
          return { ok: false, reason: 'same-ticket-prep-and-ready', no: no, sourceKey: sourceKey };
        }
        ready.add(id);
        continue;
      }
      if (prep.has(id)) {
        return { ok: false, reason: 'duplicate-in-list', no: no, sourceKey: sourceKey };
      }
      if (ready.has(id)) {
        return { ok: false, reason: 'same-ticket-prep-and-ready', no: no, sourceKey: sourceKey };
      }
      prep.add(id);
    }
    if (list.length > 50) {
      return { ok: false, reason: 'list-over-50', no: String(list.length) };
    }
    return { ok: true };
  }

  QMS.Controller.StoreSimulation = {
    SOURCE_KEYS: SOURCE_KEYS,
    SOURCE_PICK_WEIGHTS: SOURCE_PICK_WEIGHTS,
    MODE_TIMING: MODE_TIMING,
    ORDER_NO_MIN: ORDER_NO_MIN,
    ORDER_NO_MAX: ORDER_NO_MAX,
    ALLOWED_PROJECT_ID: ALLOWED_PROJECT_ID,
    jitteredMs: jitteredMs,
    pickSourceKey: pickSourceKey,
    ticketCompositeKey: ticketCompositeKey,
    normalizeSimNumber: normalizeSimNumber,
    allocateNumberForSource: allocateNumberForSource,
    formatOrderNo: formatOrderNo,
    parseOrderNo: parseOrderNo,
    maxNumericTicketNo: maxNumericTicketNo,
    wrapOrderCounter: wrapOrderCounter,
    allocateNextNumber: allocateNextNumber,
    createSimulationState: createSimulationState,
    recordsToTickets: recordsToTickets,
    startOrSwitchSimulation: startOrSwitchSimulation,
    stopSimulation: stopSimulation,
    reconcileSimulation: reconcileSimulation,
    nextWakeAtMs: nextWakeAtMs,
    simulationEligibility: simulationEligibility,
    runSimulationAnalysis: runSimulationAnalysis,
    activeNumbersOnBoard: activeNumbersOnBoard,
    validateTicketsForBoardPush: validateTicketsForBoardPush,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
