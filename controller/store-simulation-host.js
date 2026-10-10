/**
 * Browser host: timers, send batching, lifecycle hooks for store simulation.
 */
(function (root) {
  'use strict';

  const QMS = root.QMS || {};
  const Sim = QMS.Controller && QMS.Controller.StoreSimulation;
  if (!Sim) {
    return;
  }

  const SEND_RETRY_LIMIT = 3;
  const SEND_RETRY_DELAY_MS = 800;

  /**
   * @param {object} deps
   * @param {() => number} deps.now
   * @param {() => number} deps.rng
   * @param {() => string} deps.storeId
   * @param {() => string} deps.projectId
   * @param {() => Array<object>} deps.getTickets
   * @param {(list: Array<object>) => void} deps.setTickets
   * @param {() => Promise<{ isSuccess?: boolean }>} deps.sendBoard
   * @param {(text: string) => void} deps.showBanner
   * @param {(text: string) => void} deps.onStatus
   */
  function createStoreSimulationHost(deps) {
    const state = Sim.createSimulationState();
    let timer = null;
    let sendInFlight = false;
    let dirty = false;
    let lastTicketsJson = '';
    let pendingSendRetries = 0;

    function clearTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function statusLine() {
      if (!state.mode) {
        deps.onStatus('模擬：已停止');
        return;
      }
      const now = deps.now();
      const elapsed = state.startedAtMs > 0 ? Math.max(0, now - state.startedAtMs) : 0;
      const modeLabel = state.mode === 'peak' ? '尖峰' : '一般';
      const runLabel = state.running ? '運行中' : '已停止';
      deps.onStatus('模擬：' + modeLabel + ' · ' + runLabel + ' · 已跑 ' + formatMmSs(elapsed));
    }

    function formatMmSs(ms) {
      const sec = Math.floor(ms / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return String(m) + ':' + String(s).padStart(2, '0');
    }

    function scheduleWake() {
      clearTimer();
      if (!state.running) {
        statusLine();
        return;
      }
      const now = deps.now();
      const at = Sim.nextWakeAtMs(state, now);
      const delay = at == null ? 1000 : Math.max(50, at - now);
      timer = setTimeout(function () {
        wake(false);
      }, delay);
      statusLine();
    }

    function ticketsJson(list) {
      return JSON.stringify(
        (list || []).map(function (t) {
          return { no: t.no, status: t.status, sourceKey: t.sourceKey };
        }),
      );
    }

    function markDirtyFromList(list) {
      const json = ticketsJson(list);
      if (json !== lastTicketsJson) {
        dirty = true;
      }
    }

    async function attemptSend(retryIndex) {
      const list = deps.getTickets();
      if (Sim.validateTicketsForBoardPush) {
        const check = Sim.validateTicketsForBoardPush(list);
        if (!check.ok) {
          deps.showBanner('模擬名單不符合看板規則：' + check.reason + (check.no ? ' (' + check.no + ')' : ''));
          dirty = false;
          return false;
        }
      }
      const json = ticketsJson(list);
      if (json === lastTicketsJson) {
        dirty = false;
        pendingSendRetries = 0;
        return true;
      }
      sendInFlight = true;
      try {
        const res = await deps.sendBoard();
        sendInFlight = false;
        if (res && res.isSuccess === false) {
          throw new Error('send rejected');
        }
        if (!state.running) {
          dirty = false;
          return true;
        }
        state.sendCount += 1;
        lastTicketsJson = json;
        dirty = false;
        pendingSendRetries = 0;
        deps.showBanner('');
        return true;
      } catch (e) {
        sendInFlight = false;
        if (!state.running) {
          dirty = false;
          return false;
        }
        if (retryIndex + 1 < SEND_RETRY_LIMIT) {
          await new Promise(function (resolve) {
            setTimeout(resolve, SEND_RETRY_DELAY_MS);
          });
          if (!state.running) {
            dirty = false;
            return false;
          }
          return attemptSend(retryIndex + 1);
        }
        pendingSendRetries += 1;
        dirty = true;
        deps.showBanner('模擬送出失敗，將於下次名單變化時再試（' + pendingSendRetries + '）');
        return false;
      }
    }

    async function flushSend() {
      if (!dirty || sendInFlight) {
        return;
      }
      if (!state.running) {
        dirty = false;
        return;
      }
      await attemptSend(0);
    }

    function applyTickets(list) {
      deps.setTickets(list);
      markDirtyFromList(list);
    }

    function wake(fromVisibility) {
      if (!state.running && !fromVisibility) {
        statusLine();
        return;
      }
      const res = Sim.reconcileSimulation(state, deps.now(), deps.rng);
      applyTickets(res.tickets);
      statusLine();
      flushSend()
        .catch(function () {
          /* attemptSend handles banner */
        })
        .finally(function () {
          if (state.running) {
            scheduleWake();
          } else {
            statusLine();
          }
        });
    }

    function start(mode) {
      const elig = Sim.simulationEligibility(deps.storeId(), deps.projectId());
      if (!elig.allowed) {
        deps.showBanner(elig.reason);
        return false;
      }
      pendingSendRetries = 0;
      Sim.startOrSwitchSimulation(state, mode, deps.now(), deps.getTickets(), deps.rng);
      wake(false);
      return true;
    }

    function stop(reason) {
      Sim.stopSimulation(state, reason || 'user_stop', deps.now());
      clearTimer();
      dirty = false;
      statusLine();
    }

    function onPageHide() {
      stop('page_hide');
    }

    function onVisibilityChange() {
      if (typeof document !== 'undefined' && !document.hidden && state.running) {
        wake(true);
      }
    }

    return {
      getState: function () {
        return state;
      },
      start: start,
      stop: stop,
      wake: wake,
      onPageHide: onPageHide,
      onVisibilityChange: onVisibilityChange,
      dispose: function () {
        stop('dispose');
      },
      isRunning: function () {
        return Boolean(state.running);
      },
      getMode: function () {
        return state.mode;
      },
      hasPendingTimer: function () {
        return timer != null;
      },
      flushSend: flushSend,
      getSendCount: function () {
        return state.sendCount;
      },
      isFrozen: function () {
        return !state.running && state.frozenAtMs != null;
      },
    };
  }

  QMS.Controller.StoreSimulationHost = {
    createStoreSimulationHost: createStoreSimulationHost,
    SEND_RETRY_LIMIT: SEND_RETRY_LIMIT,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
