/**
 * POS receive log viewer (tools/pos-receive-log). QA stores + fake-cloud only.
 */
(function (root) {
  'use strict';

  const QMS = root.QMS || {};
  const Format = QMS.Tools && QMS.Tools.PosReceiveLogFormat;

  /**
   * @param {{ boxId?: string, ip?: string, status?: string, clockSynced?: boolean, delayMs?: number }} row
   * @returns {{ boxId: string, ipMasked: string, delayText: string, statusText: string, clockText: string }}
   */
  function mapBoxReportRow(row) {
    const boxId = row && row.boxId ? String(row.boxId) : '';
    const ipMasked = Format ? Format.formatIpForDisplay(row && row.ip ? String(row.ip) : '') : '';
    const delayText = Format ? Format.formatReceiveDelayCell(row ? row.delayMs : null) : '';
    let statusText = '未回報';
    if (row && row.status === 'reported') {
      statusText = '已回報';
    } else if (row && row.status === 'not_reported') {
      statusText = '未回報';
    }
    let clockText = '未校正';
    if (row && row.clockSynced === true) {
      clockText = '已校正';
    } else if (row && row.clockSynced === false) {
      clockText = '未校正';
    }
    return { boxId: boxId, ipMasked: ipMasked, delayText: delayText, statusText: statusText, clockText: clockText };
  }

  /**
   * @param {HTMLElement} container
   * @param {Array<object>} boxReports
   */
  function renderBoxReportsTable(container, boxReports) {
    if (!container) {
      return;
    }
    const rows = Array.isArray(boxReports) ? boxReports : [];
    const table = document.createElement('table');
    table.className = 'box-reports-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['boxId', 'IP', '狀態', '時鐘', '比收件晚（秒）'].forEach(function (label) {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(function (raw) {
      const mapped = mapBoxReportRow(raw);
      const tr = document.createElement('tr');
      [mapped.boxId, mapped.ipMasked, mapped.statusText, mapped.clockText, mapped.delayText].forEach(function (cell) {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.replaceChildren(table);
  }

  QMS.Tools = QMS.Tools || {};
  QMS.Tools.PosReceiveLogApp = {
    mapBoxReportRow: mapBoxReportRow,
    renderBoxReportsTable: renderBoxReportsTable,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
