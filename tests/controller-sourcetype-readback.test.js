'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const { CLOUD_DELIVERY_SAMPLE_TICKETS } = require('./fixtures/today-board-cloud-tickets.js');

function loadPipeline() {
  const sandbox = {
    console: console,
    Date: Date,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Math: Math,
    Number: Number,
    String: String,
    Error: Error,
    Set: Set,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'receiver', 'validate-request.js'), 'utf8'), sandbox);
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'controller', 'controller-cloud-ticket-readback.js'), 'utf8'),
    sandbox,
  );
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'controller', 'controller-send-number.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'transport', 'push-numbers-params.js'), 'utf8'), sandbox);
  return {
    Validate: sandbox.QMS.Receiver.Validate,
    Readback: sandbox.QMS.Controller.CloudTicketReadback,
    SendNumber: sandbox.QMS.Controller.SendNumber,
    PushNumbersParams: sandbox.QMS.Transport.PushNumbersParams,
  };
}

function pushParamsFromLocal(PushNumbersParams, SendNumber, tickets) {
  const def = SendNumber.sourceOptionForKey;
  return PushNumbersParams.ticketsToPushNumbersParams(tickets, function (key) {
    return def(key);
  });
}

test('cloud sourceType string → push_numbers keeps From_UberEat_OK (H1)', function () {
  const { Validate, Readback, SendNumber, PushNumbersParams } = loadPipeline();
  const local = Readback.mapCloudBoardTicketsToLocal(
    [{ no: 'C7458', status: 'ready', sourceType: 'From_UberEat_OK' }],
    Validate.parseSourceType,
  );
  assert.equal(local[0].sourceKey, 'uber');
  const params = pushParamsFromLocal(PushNumbersParams, SendNumber, local);
  assert.equal(params.ready[0].sourceType, 'From_UberEat_OK');
});

test('cloud sourceType object { no, sourceType } → correct sourceKey (H1/H2)', function () {
  const { Validate, Readback, SendNumber, PushNumbersParams } = loadPipeline();
  const local = Readback.mapCloudBoardTicketsToLocal(
    [
      {
        status: 'ready',
        sourceType: { no: 'C7459', sourceType: 'From_UberEat_OK' },
      },
    ],
    Validate.parseSourceType,
  );
  assert.equal(local[0].no, 'C7459');
  assert.equal(local[0].sourceKey, 'uber');
  assert.equal(local[0].sourceType, 'From_UberEat_OK');
  const params = pushParamsFromLocal(PushNumbersParams, SendNumber, local);
  assert.equal(params.ready[0].sourceType, 'From_UberEat_OK');
});

test('five sequential sends: refresh readback keeps point 092 and uber C7459 (QA pr64live)', function () {
  const { Validate, Readback, SendNumber, PushNumbersParams } = loadPipeline();
  const steps = [
    { no: '2001', sourceType: 'From_Store_OK', key: 'store' },
    { no: '092', sourceType: 'From_milksha_point_OK', key: 'point' },
    { no: 'C7459', sourceType: 'From_UberEat_OK', key: 'uber' },
    { no: '#6406', sourceType: 'From_FoodPanda_OK', key: 'fp' },
    { no: '1234', sourceType: 'From_Udd_OK', key: 'udd' },
  ];
  /** @type {Array<{ no: string, status: string, sourceType: string }>} */
  const cloudTickets = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    cloudTickets.push({ no: step.no, status: 'ready', sourceType: step.sourceType });
    const local = Readback.mapCloudBoardTicketsToLocal(cloudTickets, Validate.parseSourceType);
    const params = pushParamsFromLocal(PushNumbersParams, SendNumber, local);
    for (let j = 0; j <= i; j += 1) {
      const expect = steps[j];
      const row = params.ready.find(function (e) {
        return e.no === expect.no;
      });
      assert.equal(
        row && row.sourceType,
        expect.sourceType,
        'after send #' + (i + 1) + ' ticket ' + expect.no + ' must stay ' + expect.sourceType,
      );
      const loc = local.find(function (t) {
        return t.no === expect.no;
      });
      assert.equal(loc && loc.sourceKey, expect.key);
    }
  }
});

test('fixture cloud delivery sample maps all non-store sources', function () {
  const { Validate, Readback, SendNumber, PushNumbersParams } = loadPipeline();
  const local = Readback.mapCloudBoardTicketsToLocal(CLOUD_DELIVERY_SAMPLE_TICKETS, Validate.parseSourceType);
  const params = pushParamsFromLocal(PushNumbersParams, SendNumber, local);
  const byNo = Object.fromEntries(params.ready.map(function (r) {
    return [r.no, r.sourceType];
  }));
  assert.equal(byNo['578'], 'From_milksha_point_OK');
  assert.equal(byNo['C7458'], 'From_UberEat_OK');
  assert.equal(byNo['#6406'], 'From_FoodPanda_OK');
  assert.equal(byNo['7112'], 'From_Store_OK');
});
