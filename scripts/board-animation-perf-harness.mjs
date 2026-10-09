/** Injected into board page for perf sampling. */
export const BOARD_PERF_INIT_SCRIPT = () => {
  window.__boardPerfSession = null;
  window.__milkshaBoardPerfEvents = [];

  window.startBoardPerfSession = function startBoardPerfSession(name) {
    const session = {
      name: name,
      frames: [],
      longTasks: [],
      startedAt: performance.now(),
    };
    window.__boardPerfSession = session;
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const po = new PerformanceObserver(function (list) {
          const entries = list.getEntries();
          for (let i = 0; i < entries.length; i += 1) {
            const e = entries[i];
            session.longTasks.push({ start: e.startTime, duration: e.duration });
          }
        });
        po.observe({ entryTypes: ['longtask'] });
        session.longTaskObserver = po;
      } catch (_err) {
        /* ignore */
      }
    }
    let last = performance.now();
    function tick(now) {
      if (!window.__boardPerfSession || window.__boardPerfSession !== session) {
        return;
      }
      const dt = now - last;
      if (last > 0) {
        session.frames.push(dt);
      }
      last = now;
      session.rafId = requestAnimationFrame(tick);
    }
    session.rafId = requestAnimationFrame(tick);
  };

  window.stopBoardPerfSession = function stopBoardPerfSession() {
    const session = window.__boardPerfSession;
    if (!session) {
      return null;
    }
    if (session.longTaskObserver) {
      session.longTaskObserver.disconnect();
    }
    if (session.rafId) {
      cancelAnimationFrame(session.rafId);
    }
    window.__boardPerfSession = null;
    const frames = session.frames.filter(function (f) {
      return f > 0 && Number.isFinite(f);
    });
    const over50 = frames.filter(function (f) {
      return f > 50;
    }).length;
    const sum = frames.reduce(function (a, b) {
      return a + b;
    }, 0);
    const avgFrameMs = frames.length ? sum / frames.length : 0;
    const avgFps = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;
    const lt = session.longTasks;
    let longTaskMaxMs = 0;
    for (let i = 0; i < lt.length; i += 1) {
      if (lt[i].duration > longTaskMaxMs) {
        longTaskMaxMs = lt[i].duration;
      }
    }
    return {
      name: session.name,
      avgFps: Math.round(avgFps * 10) / 10,
      framesOver50ms: over50,
      longTaskCount: lt.length,
      longTaskMaxMs: Math.round(longTaskMaxMs * 10) / 10,
      frameSamples: frames.length,
      durationMs: Math.round(performance.now() - session.startedAt),
    };
  };
};

export async function primeBoard(page) {
  await page.goto(`http://127.0.0.1:${process.env.MILKSHA_E2E_PORT || 8877}/?mode=local`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), { timeout: 25000 });
  await page.evaluate(() => {
    window.QMS.runtime.clearPerfEvents?.();
    window.__milkshaBoardPerfEvents = [];
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
  });
}

export async function runPerfScenario(page, name, action, settleMs) {
  await page.evaluate((scenarioName) => {
    window.QMS.runtime.clearPerfEvents?.();
    window.__milkshaBoardPerfEvents = [];
    window.startBoardPerfSession(scenarioName);
  }, name);
  await action();
  await page.waitForTimeout(settleMs || 650);
  return page.evaluate(() => window.stopBoardPerfSession());
}
