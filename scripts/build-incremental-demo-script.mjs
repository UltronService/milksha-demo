#!/usr/bin/env node
/**
 * Build demo/milksha-demo-script.json — each frame differs from previous by one number change.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @typedef {{ source_type: string, number: string }} Row */

const STEPS = [
  { note: '開店清空', delta: 'clear' },
  { note: '現場 1001 進準備中', add: { st: 'From_Store_Preparing', num: '1001' } },
  { note: '現場 1002 進準備中', add: { st: 'From_Store_Preparing', num: '1002' } },
  { note: '1001 轉可取餐', toReady: { from: 'From_Store_Preparing', to: 'From_Store_OK', num: '1001' } },
  { note: '迷點 021 進準備中', add: { st: 'From_milksha_point_Preparing', num: '021' } },
  { note: '1002 轉可取餐', toReady: { from: 'From_Store_Preparing', to: 'From_Store_OK', num: '1002' } },
  { note: '熊貓 #5037 進準備中', add: { st: 'From_FoodPanda_Preparing', num: '#5037' } },
  { note: '021 轉可取餐', toReady: { from: 'From_milksha_point_Preparing', to: 'From_milksha_point_OK', num: '021' } },
  { note: '1001 取餐離開', remove: { st: 'From_Store_OK', num: '1001' } },
  { note: '#5037 轉可取餐', toReady: { from: 'From_FoodPanda_Preparing', to: 'From_FoodPanda_OK', num: '#5037' } },
  { note: 'Uber 5512A 進準備中', add: { st: 'From_UberEat_Preparing', num: '5512A' } },
  { note: '5512A 轉可取餐', toReady: { from: 'From_UberEat_Preparing', to: 'From_UberEat_OK', num: '5512A' } },
  { note: '1002 取餐離開', remove: { st: 'From_Store_OK', num: '1002' } },
  { note: '021 取餐離開', remove: { st: 'From_milksha_point_OK', num: '021' } },
  { note: '#5037 取餐離開', remove: { st: 'From_FoodPanda_OK', num: '#5037' } },
  { note: '5512A 取餐離開（收店前最後一筆）', remove: { st: 'From_UberEat_OK', num: '5512A' } },
];

function rowKey(row) {
  return row.source_type + '\0' + row.number;
}

function parseSourceKey(sourceType) {
  if (sourceType.includes('Store')) return 'store';
  if (sourceType.includes('milksha_point')) return 'point';
  if (sourceType.includes('FoodPanda')) return 'fp';
  if (sourceType.includes('Uber')) return 'uber';
  if (sourceType.includes('Udd')) return 'udd';
  return 'store';
}

function readyToken(sourceType, number) {
  return `${parseSourceKey(sourceType)}:${number}`;
}

/** @param {Row[]} rows @returns {Set<string>} */
function readyIds(rows) {
  const s = new Set();
  for (const r of rows) {
    if (/_OK$/.test(r.source_type)) {
      s.add(readyToken(r.source_type, r.number));
    }
  }
  return s;
}

/** @type {Row[]} */
let state = [];

const frames = [];

for (let i = 0; i < STEPS.length; i += 1) {
  const step = STEPS[i];
  const prevReady = readyIds(state);

  if (step.delta === 'clear') {
    state = [];
  } else if (step.add) {
    state = state.concat([{ source_type: step.add.st, number: step.add.num }]);
  } else if (step.toReady) {
    state = state.map((r) => {
      if (r.number === step.toReady.num && r.source_type === step.toReady.from) {
        return { source_type: step.toReady.to, number: r.number };
      }
      return r;
    });
  } else if (step.remove) {
    state = state.filter(
      (r) => !(r.number === step.remove.num && r.source_type === step.remove.st),
    );
  }

  const nextReady = readyIds(state);
  const expectRing = [];
  if (i > 0) {
    for (const id of nextReady) {
      if (!prevReady.has(id)) {
        expectRing.push(id);
      }
    }
  }

  const ts = `2026-10-24-12-00-${String(i).padStart(2, '0')}:000${i}`;
  frames.push({
    _note: step.note,
    _expectRing: expectRing,
    request: {
      isEncrypt: false,
      serviceSpecialData_Json: {
        target: 'milkshademo001',
        data: {
          number_content: state.map((r) => ({ ...r })),
          newsTicker_content: [],
          newsTickerSpeed: 0,
        },
      },
      merchant_id: 'milksha',
      account: 'demo001',
      timeStmp: ts,
      serviceSpecialData_Json_Md5Hash: 'DEMO-INCREMENTAL',
      signature: 'DEMO-NO-SIGNATURE',
    },
  });
}

writeFileSync(join(ROOT, 'demo', 'milksha-demo-script.json'), JSON.stringify(frames, null, 2) + '\n');
console.log('Wrote', frames.length, 'frames');
