/**
 * Demo controls for Milksha board (?demo=1).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const SOURCE_OPTIONS = [
    { key: 'store', label: '現場', preparing: 'From_Store_Preparing', ready: 'From_Store_OK' },
    { key: 'point', label: '迷點', preparing: 'From_milksha_point_Preparing', ready: 'From_milksha_point_OK' },
    { key: 'fp', label: '熊貓', preparing: 'From_FoodPanda_Preparing', ready: 'From_FoodPanda_OK' },
    { key: 'uber', label: 'Uber', preparing: 'From_UberEat_Preparing', ready: 'From_UberEat_OK' },
    { key: 'udd', label: 'UDD', preparing: 'From_Udd_Preparing', ready: 'From_Udd_OK' },
  ];

  /**
   * @param {object} runtime
   * @param {object} [options]
   */
  function attachMilkshaDemo(runtime, options) {
    const opts = options || {};
    const doc = opts.document || root.document;
    const win = opts.window || root;
    const board = runtime;
    if (!board || !board.applyPayload) {
      return null;
    }

    const scriptUrl = opts.scriptUrl || 'demo/milksha-demo-script.json';
    let frames = [];
    let stepIndex = 0;
    let currentContent = [];
    let autoPlay = false;
    let autoIntervalSec = 8;
    let autoTimer = null;
    let drawerOpen = false;
    let idleTimer = null;
    let nextPushAt = 0;
    let countdownTimer = null;

    const handle = doc.createElement('button');
    handle.type = 'button';
    handle.className = 'milksha-demo-handle';
    handle.textContent = '⚙ 展示';
    handle.setAttribute('aria-label', '展示控制');

    const drawer = doc.createElement('aside');
    drawer.className = 'milksha-demo-drawer';
    drawer.setAttribute('aria-label', '展示控制 Demo');
    drawer.innerHTML = buildDrawerHtml();

    doc.body.appendChild(handle);
    doc.body.appendChild(drawer);

    const elStep = drawer.querySelector('#ms-demo-step');
    const elCountdown = drawer.querySelector('#ms-demo-countdown');
    const elPre = drawer.querySelector('#ms-demo-pre');
    const elAutoLabel = drawer.querySelector('#ms-demo-auto-label');
    const btnPush = drawer.querySelector('#ms-demo-push');
    const btnClose = drawer.querySelector('#ms-demo-close');
    const btnAuto = drawer.querySelector('#ms-demo-auto');
    const btnClear = drawer.querySelector('#ms-demo-clear');
    const btnReset = drawer.querySelector('#ms-demo-reset');
    const btnAdd = drawer.querySelector('#ms-demo-add');
    const btnRandReady = drawer.querySelector('#ms-demo-rand-ready');
    const btnRandTake = drawer.querySelector('#ms-demo-rand-take');
    const selSource = drawer.querySelector('#ms-demo-source');
    const inpNumber = drawer.querySelector('#ms-demo-number');
    const statePrep = drawer.querySelector('#ms-demo-state-prep');
    const stateReady = drawer.querySelector('#ms-demo-state-ready');
    const btnLand = drawer.querySelector('#ms-demo-land');
    const btnPort = drawer.querySelector('#ms-demo-port');

    function buildDrawerHtml() {
      let srcOpts = '';
      for (let i = 0; i < SOURCE_OPTIONS.length; i += 1) {
        srcOpts +=
          '<option value="' + SOURCE_OPTIONS[i].key + '">' + SOURCE_OPTIONS[i].label + '</option>';
      }
      return (
        '<h3><span>展示控制 <span class="milksha-demo-lbl">Demo</span></span>' +
        '<button type="button" class="milksha-demo-btn" id="ms-demo-close">✕</button></h3>' +
        '<div class="milksha-demo-row"><span class="milksha-demo-lbl">目前步驟</span> <b id="ms-demo-step">0 / 0</b>' +
        '<span class="milksha-demo-lbl">　下次推送</span> <b id="ms-demo-countdown">—</b></div>' +
        '<button type="button" class="milksha-demo-btn big" id="ms-demo-push">▶ 模擬推送（下一步）</button>' +
        '<div class="milksha-demo-sec"></div>' +
        '<div class="milksha-demo-row"><b>自動播放</b> <button type="button" class="milksha-demo-btn" id="ms-demo-auto">關</button>' +
        '<span id="ms-demo-auto-label">每 8 秒</span></div>' +
        '<div class="milksha-demo-row"><span class="milksha-demo-lbl">間隔</span>' +
        '<button type="button" class="milksha-demo-btn" data-interval="5">5 秒</button>' +
        '<button type="button" class="milksha-demo-btn sel" data-interval="8">8 秒</button>' +
        '<button type="button" class="milksha-demo-btn" data-interval="10">10 秒</button></div>' +
        '<div class="milksha-demo-sec"></div>' +
        '<div class="milksha-demo-row"><b>手動加號</b></div>' +
        '<div class="milksha-demo-row"><select id="ms-demo-source">' +
        srcOpts +
        '</select><input id="ms-demo-number" type="text" placeholder="號碼" maxlength="8" /></div>' +
        '<div class="milksha-demo-row">' +
        '<button type="button" class="milksha-demo-btn sel" id="ms-demo-state-prep">準備中</button>' +
        '<button type="button" class="milksha-demo-btn" id="ms-demo-state-ready">可取餐</button>' +
        '<button type="button" class="milksha-demo-btn" id="ms-demo-add">＋ 加入並推送</button></div>' +
        '<div class="milksha-demo-row">' +
        '<button type="button" class="milksha-demo-btn" id="ms-demo-rand-ready">隨機一筆→可取餐</button>' +
        '<button type="button" class="milksha-demo-btn" id="ms-demo-rand-take">隨機取走一筆</button></div>' +
        '<div class="milksha-demo-sec"></div>' +
        '<div class="milksha-demo-row">' +
        '<button type="button" class="milksha-demo-btn" id="ms-demo-clear">清空畫面（空陣列）</button>' +
        '<button type="button" class="milksha-demo-btn" id="ms-demo-reset">重置劇本</button></div>' +
        '<div class="milksha-demo-row"><b>提示音</b> <button type="button" class="milksha-demo-btn" id="ms-demo-mute">開</button>' +
        '<span class="milksha-demo-lbl">　版面</span>' +
        '<button type="button" class="milksha-demo-btn sel" id="ms-demo-land">橫</button>' +
        '<button type="button" class="milksha-demo-btn" id="ms-demo-port">直</button></div>' +
        '<div class="milksha-demo-sec"></div>' +
        '<div class="milksha-demo-lbl">最近一次推送的資料</div>' +
        '<pre class="milksha-demo-pre" id="ms-demo-pre">[]</pre>' +
        '<div class="milksha-demo-lbl">快捷鍵：D＝開/關面板　空白鍵＝模擬推送　A＝自動播放</div>'
      );
    }

    let manualState = 'preparing';

    function resetIdle() {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      if (!drawerOpen) {
        return;
      }
      idleTimer = setTimeout(function () {
        setDrawerOpen(false);
      }, 10000);
    }

    function setDrawerOpen(open) {
      drawerOpen = open;
      drawer.classList.toggle('open', open);
      handle.hidden = open;
      if (open) {
        resetIdle();
      } else if (idleTimer) {
        clearTimeout(idleTimer);
      }
    }

    function updatePreview() {
      const preview = JSON.stringify({ number_content: currentContent }, null, 2);
      elPre.textContent = preview;
      elStep.textContent = frames.length ? stepIndex + ' / ' + frames.length : '—';
    }

    function scheduleAuto() {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
      if (!autoPlay) {
        nextPushAt = 0;
        elCountdown.textContent = '—';
        return;
      }
      nextPushAt = Date.now() + autoIntervalSec * 1000;
      autoTimer = setInterval(function () {
        pushNextFrame();
      }, autoIntervalSec * 1000);
    }

    function tickCountdown() {
      if (!autoPlay || !nextPushAt) {
        elCountdown.textContent = '—';
        return;
      }
      const sec = Math.max(0, Math.ceil((nextPushAt - Date.now()) / 1000));
      elCountdown.textContent = sec + ' 秒後';
    }

    function extractContent(frame) {
      if (!frame || !frame.request) {
        return [];
      }
      const data = frame.request.serviceSpecialData_Json;
      if (!data || !data.data) {
        return [];
      }
      return data.data.number_content || [];
    }

    function pushContent(content) {
      currentContent = content.slice();
      board.applyPayload(currentContent);
      updatePreview();
      nextPushAt = autoPlay ? Date.now() + autoIntervalSec * 1000 : 0;
    }

    function pushNextFrame() {
      if (!frames.length) {
        return;
      }
      if (stepIndex >= frames.length) {
        stepIndex = 0;
      }
      const content = extractContent(frames[stepIndex]);
      pushContent(content);
      stepIndex += 1;
      if (stepIndex >= frames.length) {
        stepIndex = 0;
      }
      updatePreview();
    }

    function loadScript() {
      return fetch(scriptUrl, { cache: 'no-cache' })
        .then(function (res) {
          if (!res.ok) {
            throw new Error('HTTP ' + res.status);
          }
          return res.json();
        })
        .then(function (data) {
          frames = Array.isArray(data) ? data : [];
          stepIndex = 0;
          updatePreview();
        })
        .catch(function () {
          frames = [];
          updatePreview();
        });
    }

    function sourceTypeFor(key, state) {
      for (let i = 0; i < SOURCE_OPTIONS.length; i += 1) {
        if (SOURCE_OPTIONS[i].key === key) {
          return state === 'ready' ? SOURCE_OPTIONS[i].ready : SOURCE_OPTIONS[i].preparing;
        }
      }
      return 'From_Store_Preparing';
    }

    handle.addEventListener('click', function () {
      setDrawerOpen(true);
    });
    btnClose.addEventListener('click', function () {
      setDrawerOpen(false);
    });
    drawer.addEventListener('click', resetIdle);
    drawer.addEventListener('keydown', resetIdle);

    btnPush.addEventListener('click', function () {
      pushNextFrame();
      resetIdle();
    });

    btnAuto.addEventListener('click', function () {
      autoPlay = !autoPlay;
      btnAuto.textContent = autoPlay ? '開' : '關';
      btnAuto.classList.toggle('sel', autoPlay);
      scheduleAuto();
      resetIdle();
    });

    drawer.querySelectorAll('[data-interval]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        autoIntervalSec = Number(btn.getAttribute('data-interval')) || 8;
        elAutoLabel.textContent = '每 ' + autoIntervalSec + ' 秒';
        drawer.querySelectorAll('[data-interval]').forEach(function (b) {
          b.classList.toggle('sel', b === btn);
        });
        scheduleAuto();
        resetIdle();
      });
    });

    statePrep.addEventListener('click', function () {
      manualState = 'preparing';
      statePrep.classList.add('sel');
      stateReady.classList.remove('sel');
    });
    stateReady.addEventListener('click', function () {
      manualState = 'ready';
      stateReady.classList.add('sel');
      statePrep.classList.remove('sel');
    });

    btnAdd.addEventListener('click', function () {
      const key = selSource.value;
      const num = (inpNumber.value || '').trim();
      if (!num) {
        return;
      }
      const st = sourceTypeFor(key, manualState === 'ready' ? 'ready' : 'preparing');
      currentContent = currentContent.concat([{ source_type: st, number: num }]);
      pushContent(currentContent);
      resetIdle();
    });

    btnRandReady.addEventListener('click', function () {
      const snap = board.getSnapshot();
      const pool = snap.preparing;
      if (!pool.length) {
        return;
      }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const st = sourceTypeFor(pick.sourceKey, 'ready');
      currentContent = currentContent
        .filter(function (row) {
          if (row.number !== pick.number) {
            return true;
          }
          const parsed = QMS.MilkshaBoard && QMS.MilkshaBoard.parseSourceType(row.source_type);
          return !parsed || parsed.sourceKey !== pick.sourceKey;
        })
        .concat([{ source_type: st, number: pick.number }]);
      pushContent(currentContent);
      resetIdle();
    });

    btnRandTake.addEventListener('click', function () {
      const snap = board.getSnapshot();
      const pool = snap.ready.concat(snap.preparing);
      if (!pool.length) {
        return;
      }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      currentContent = currentContent.filter(function (row) {
        return row.number !== pick.number;
      });
      pushContent(currentContent);
      resetIdle();
    });

    btnClear.addEventListener('click', function () {
      pushContent([]);
      resetIdle();
    });

    btnReset.addEventListener('click', function () {
      stepIndex = 0;
      if (frames.length) {
        pushContent(extractContent(frames[0]));
      } else {
        pushContent([]);
      }
      resetIdle();
    });

    const btnMute = drawer.querySelector('#ms-demo-mute');
    let muted = false;
    btnMute.addEventListener('click', function () {
      muted = !muted;
      board.setMuted(muted);
      btnMute.textContent = muted ? '關' : '開';
      resetIdle();
    });

    btnLand.addEventListener('click', function () {
      board.setOrientation('landscape');
      btnLand.classList.add('sel');
      btnPort.classList.remove('sel');
      resetIdle();
    });
    btnPort.addEventListener('click', function () {
      board.setOrientation('portrait');
      btnPort.classList.add('sel');
      btnLand.classList.remove('sel');
      resetIdle();
    });

    doc.addEventListener('keydown', function (ev) {
      const tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return;
      }
      if (ev.key === 'd' || ev.key === 'D' || ev.key === 'ContextMenu') {
        ev.preventDefault();
        setDrawerOpen(!drawerOpen);
        return;
      }
      if (ev.key === ' ' || ev.code === 'Space') {
        ev.preventDefault();
        pushNextFrame();
        resetIdle();
        return;
      }
      if (ev.key === 'a' || ev.key === 'A') {
        ev.preventDefault();
        btnAuto.click();
      }
    });

    countdownTimer = setInterval(tickCountdown, 250);

    loadScript().then(function () {
      if (frames.length) {
        pushContent(extractContent(frames[0]));
        stepIndex = 1;
        updatePreview();
      }
    });

    return {
      destroy: function () {
        if (autoTimer) {
          clearInterval(autoTimer);
        }
        if (idleTimer) {
          clearTimeout(idleTimer);
        }
        if (countdownTimer) {
          clearInterval(countdownTimer);
        }
        handle.remove();
        drawer.remove();
      },
    };
  }

  QMS.attachMilkshaDemo = attachMilkshaDemo;
})(typeof window !== 'undefined' ? window : globalThis);
