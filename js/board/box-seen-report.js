/**
 * Box-seen report: per-ticket data/paint timing, batched cloud upload.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  const DEFAULT_MIN_SEND_GAP_MS = 2000;
  const DEFAULT_MAX_QUEUE = 200;
  const DEFAULT_MAX_RETRIES = 3;
  function parseSourceType(st) {
    const Validate = QMS.Receiver && QMS.Receiver.Validate;
    if (Validate && Validate.parseSourceType) {
      return Validate.parseSourceType(st);
    }
    if (typeof st !== 'string') {
      return null;
    }
    if (st === 'From_Store_OK') {
      return { sourceKey: 'store', zone: 'ready' };
    }
    if (st === 'From_Store_Preparing') {
      return { sourceKey: 'store', zone: 'preparing' };
    }
    return null;
  }

  function makeItemId(sourceKey, number) {
    const Validate = QMS.Receiver && QMS.Receiver.Validate;
    if (Validate && Validate.itemId) {
      return Validate.itemId(sourceKey, number);
    }
    return sourceKey + ':' + String(number);
  }

  /**
   * @param {object} opts
   */
  function createBoxSeenReporter(opts) {
    const storeId = String(opts.storeId || '');
    const boxId = String(opts.boxId || '');
    const transportDefault = opts.transport === 'realtime' ? 'realtime' : 'poll';
    const getTransport =
      opts.getTransport ||
      function () {
        return transportDefault;
      };
    const pageVersion = String(opts.pageVersion || '');
    const clock = opts.clock;
    const cloudApi = opts.cloudApi;
    const nowFn = opts.now || function () {
      return Date.now();
    };
    const isOffline = opts.isOffline || function () {
      return false;
    };
    const minSendGapMs =
      opts.minSendGapMs != null && Number.isFinite(Number(opts.minSendGapMs))
        ? Number(opts.minSendGapMs)
        : DEFAULT_MIN_SEND_GAP_MS;
    const maxQueue =
      opts.maxQueue != null && Number.isFinite(Number(opts.maxQueue))
        ? Number(opts.maxQueue)
        : DEFAULT_MAX_QUEUE;
    const maxRetries =
      opts.maxRetries != null && Number.isFinite(Number(opts.maxRetries))
        ? Number(opts.maxRetries)
        : DEFAULT_MAX_RETRIES;
    const storage = root.localStorage || null;
    const reportedTicketStore =
      QMS.Board.createReportedTicketStore &&
      QMS.Board.createReportedTicketStore({
        storage: storage,
        storeId: storeId,
        maxEntries: 500,
      });

    /** @type {Record<string, { ticketNo: string, intakeLogId: string, firstDataAtLocalMs: number, firstPaintAtLocalMs: number | null }>} */
    const tracking = {};
    /** @type {Array<{ ticketNo: string, intakeLogId: string, firstDataAtLocalMs: number, firstPaintAtLocalMs: number }>} */
    const sendQueue = [];
    let lastSendAtMs = null;
    let sendInFlight = null;
    let pendingFlush = null;

    function isReported(ticketNo, intakeLogId) {
      if (!reportedTicketStore) {
        return false;
      }
      return reportedTicketStore.hasReported(ticketNo, intakeLogId);
    }

    function markReported(items) {
      if (!reportedTicketStore) {
        return;
      }
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        reportedTicketStore.markReported(it.ticketNo, it.intakeLogId);
      }
    }

    function trimQueue() {
      while (sendQueue.length > maxQueue) {
        sendQueue.shift();
      }
    }

    function enqueueReady(item) {
      if (isReported(item.ticketNo, item.intakeLogId)) {
        return;
      }
      for (let i = 0; i < sendQueue.length; i += 1) {
        const q = sendQueue[i];
        if (q.ticketNo === item.ticketNo && q.intakeLogId === item.intakeLogId) {
          return;
        }
      }
      sendQueue.push(item);
      trimQueue();
    }

    function maybeEnqueueFromTracking(itemId) {
      const t = tracking[itemId];
      if (!t || t.firstPaintAtLocalMs == null) {
        return;
      }
      const intakeLogId = t.intakeLogId;
      if (!intakeLogId) {
        return;
      }
      enqueueReady({
        ticketNo: t.ticketNo,
        intakeLogId: intakeLogId,
        firstDataAtLocalMs: t.firstDataAtLocalMs,
        firstPaintAtLocalMs: t.firstPaintAtLocalMs,
      });
    }

    /**
     * @param {Array<object>} tickets
     */
    function ingestTickets(tickets) {
      const list = Array.isArray(tickets) ? tickets : [];
      const ts = nowFn();
      for (let i = 0; i < list.length; i += 1) {
        const ticket = list[i];
        if (!ticket || typeof ticket !== 'object') {
          continue;
        }
        const intakeLogId = ticket.firstIntakeLogId != null ? String(ticket.firstIntakeLogId).trim() : '';
        if (!intakeLogId) {
          continue;
        }
        const st = ticket.sourceType || ticket.source_type || 'From_Store_OK';
        const parsed = parseSourceType(st);
        if (!parsed) {
          continue;
        }
        const no = String(ticket.no || '').trim();
        if (!no) {
          continue;
        }
        const itemId = makeItemId(parsed.sourceKey, no);
        if (!tracking[itemId]) {
          tracking[itemId] = {
            ticketNo: no,
            intakeLogId: intakeLogId,
            firstDataAtLocalMs: ts,
            firstPaintAtLocalMs: null,
          };
        }
      }
    }

    /**
     * @param {string[]} itemIds
     */
    function notePaintedItemIds(itemIds) {
      const ids = Array.isArray(itemIds) ? itemIds : [];
      const ts = nowFn();
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        const t = tracking[id];
        if (!t || t.firstPaintAtLocalMs != null) {
          continue;
        }
        t.firstPaintAtLocalMs = ts;
        maybeEnqueueFromTracking(id);
      }
      scheduleSend();
    }

    function buildPayload(items) {
      const clockState = clock && clock.getState ? clock.getState() : { clockSynced: false, clockOffsetMs: null };
      const payloadItems = items.map(function (it) {
        const correctedData =
          clock && clock.toCorrectedLocalMs ? clock.toCorrectedLocalMs(it.firstDataAtLocalMs) : null;
        const correctedPaint =
          clock && clock.toCorrectedLocalMs ? clock.toCorrectedLocalMs(it.firstPaintAtLocalMs) : null;
        return {
          ticketNo: it.ticketNo,
          intakeLogId: it.intakeLogId,
          firstDataLocalMs: it.firstDataAtLocalMs,
          firstPaintLocalMs: it.firstPaintAtLocalMs,
          firstDataCorrectedMs: clockState.clockSynced ? correctedData : null,
          firstPaintCorrectedMs: clockState.clockSynced ? correctedPaint : null,
        };
      });
      return {
        storeId: storeId,
        boxId: boxId,
        transport: getTransport() === 'realtime' ? 'realtime' : 'poll',
        pageVersion: pageVersion,
        clockSynced: Boolean(clockState.clockSynced),
        clockOffsetMs: clockState.clockSynced ? clockState.clockOffsetMs : null,
        items: payloadItems,
      };
    }

    async function attemptSend(batch) {
      if (!cloudApi || typeof cloudApi.boxSeenReport !== 'function') {
        return false;
      }
      if (isOffline()) {
        return false;
      }
      if (!batch.length) {
        return true;
      }
      try {
        const body = buildPayload(batch);
        await cloudApi.boxSeenReport(body);
        markReported(batch);
        return true;
      } catch (e) {
        return false;
      }
    }

    async function flushSendInternal() {
      if (sendInFlight) {
        return sendInFlight;
      }
      const run = async function () {
        if (!sendQueue.length) {
          return;
        }
        if (isOffline()) {
          return;
        }
        const now = nowFn();
        if (lastSendAtMs != null && now - lastSendAtMs < minSendGapMs) {
          return;
        }
        const batch = sendQueue.splice(0, sendQueue.length);
        lastSendAtMs = nowFn();
        const ok = await attemptSend(batch);
        if (!ok) {
          for (let i = 0; i < batch.length; i += 1) {
            const item = batch[i];
            const nextRetries = (item._sendRetries || 0) + 1;
            if (nextRetries < maxRetries) {
              item._sendRetries = nextRetries;
              sendQueue.push(item);
            }
          }
          trimQueue();
        }
      };
      sendInFlight = run().finally(function () {
        sendInFlight = null;
      });
      return sendInFlight;
    }

    function scheduleSend() {
      if (pendingFlush) {
        return;
      }
      pendingFlush = root.setTimeout(function () {
        pendingFlush = null;
        flushSendInternal().catch(function () {
          /* never affect board */
        });
      }, 0);
    }

    function getQueueDepth() {
      return sendQueue.length;
    }

    function _enqueueTestItem(item) {
      sendQueue.push({
        ticketNo: String(item.ticketNo),
        intakeLogId: String(item.intakeLogId),
        firstDataAtLocalMs: Number(item.firstDataAtLocalMs) || 0,
        firstPaintAtLocalMs: Number(item.firstPaintAtLocalMs) || 0,
      });
      trimQueue();
    }

    function _peekQueueTicketNos() {
      return sendQueue.map(function (q) {
        return q.ticketNo;
      });
    }

    return {
      ingestTickets: ingestTickets,
      notePaintedItemIds: notePaintedItemIds,
      flushSend: flushSendInternal,
      scheduleSend: scheduleSend,
      getQueueDepth: getQueueDepth,
      _enqueueTestItem: _enqueueTestItem,
      _peekQueueTicketNos: _peekQueueTicketNos,
    };
  }

  /**
   * @param {object} opts
   */
  function attachBoxSeenToBoard(opts) {
    const resolved = QMS.Board.resolveBoxId ? QMS.Board.resolveBoxId() : { boxId: '' };
    const clock = QMS.Board.createBoxSeenClock({ resyncIntervalMs: 600000 });
    const reporter = createBoxSeenReporter({
      storeId: opts.storeId,
      boxId: resolved.boxId,
      transport: opts.transport === 'realtime' ? 'realtime' : 'poll',
      getTransport: opts.getTransport,
      pageVersion: opts.pageVersion || '',
      clock: clock,
      cloudApi: opts.cloudApi,
      isOffline: opts.isOffline,
    });
    return { clock: clock, reporter: reporter };
  }

  QMS.Board.createBoxSeenReporter = createBoxSeenReporter;
  QMS.Board.attachBoxSeenToBoard = attachBoxSeenToBoard;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
