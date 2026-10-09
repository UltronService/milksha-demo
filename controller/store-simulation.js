/**
 * Continuous store simulation — pure logic (injectable clock + RNG).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Controller = QMS.Controller || {};

  const SOURCE_KEYS = ['store', 'point', 'fp', 'uber', 'udd'];

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
   * @param {() => number} rng
   * @returns {string}
   */
  function pickSourceKey(rng) {
    const idx = Math.floor(rng() * SOURCE_KEYS.length);
    return SOURCE_KEYS[Math.min(SOURCE_KEYS.length - 1, Math.max(0, idx))];
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
    while (usedOnBoard.has(formatOrderNo(candidate)) && guard < ORDER_NO_MAX + 10) {
      guard += 1;
      candidate += 1;
      candidate = wrapOrderCounter(candidate);
    }
    state.lastIssuedNumber = candidate;
    return formatOrderNo(candidate);
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
        set.add(rec.no);
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
      const no = allocateNextNumber(state, used, rng);
      used.add(no);
      const prepMs = jitteredMs(timing.prepMeanMs, rng);
      const pickupMs = jitteredMs(timing.pickupMeanMs, rng);
      const enteredAtMs = state.nextNewOrderAtMs;
      state.records.push({
        no: no,
        sourceKey: pickSourceKey(rng),
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

    const endAt = t0 + durationMs;
    let now = t0;
    while (now < endAt && state.running) {
      timerSteps += 1;
      const res = reconcileSimulation(state, now, rng);
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
    };
  }

  QMS.Controller.StoreSimulation = {
    SOURCE_KEYS: SOURCE_KEYS,
    MODE_TIMING: MODE_TIMING,
    ORDER_NO_MIN: ORDER_NO_MIN,
    ORDER_NO_MAX: ORDER_NO_MAX,
    ALLOWED_PROJECT_ID: ALLOWED_PROJECT_ID,
    jitteredMs: jitteredMs,
    pickSourceKey: pickSourceKey,
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
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
