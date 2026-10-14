import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nextPresence, diffGateway, diffPeer, diffService, diffFirmware } from '../src/tracker.js';

const MIN = 60000;

test('presence: the baseline fires nothing, arriving is immediate, leaving waits', () => {
  assert.deepEqual(nextPresence(undefined, true, 0, 5 * MIN), {
    present: true,
    lastSeen: 0,
    event: null,
  });
  assert.deepEqual(nextPresence(undefined, false, 0, 5 * MIN), {
    present: false,
    lastSeen: null,
    event: null,
  });
  const here = { present: true, lastSeen: 0 };
  assert.equal(nextPresence(here, false, 4 * MIN, 5 * MIN).event, null);
  assert.equal(nextPresence(here, false, 4 * MIN, 5 * MIN).present, true);
  assert.equal(nextPresence(here, false, 5 * MIN, 5 * MIN).event, 'left');
  assert.equal(nextPresence({ present: false, lastSeen: 0 }, false, 9 * MIN, 5 * MIN).event, null);
  assert.equal(
    nextPresence({ present: false, lastSeen: 0 }, true, 9 * MIN, 5 * MIN).event,
    'arrived',
  );
});

test('gateways: a change of status, never from or to pending', () => {
  assert.equal(diffGateway(undefined, { status: 'offline' }), null);
  assert.deepEqual(diffGateway({ status: 'online' }, { status: 'offline' }), {
    previous: 'online',
  });
  assert.equal(diffGateway({ status: 'online' }, { status: 'online' }), null);
  assert.equal(diffGateway({ status: 'pending' }, { status: 'online' }), null);
  assert.equal(diffGateway({ status: 'online' }, { status: 'pending' }), null);
});

test('peers and services: a change after the baseline', () => {
  assert.equal(diffPeer(undefined, { online: true }), false);
  assert.equal(diffPeer({ online: false }, { online: true }), true);
  assert.equal(diffService(undefined, { running: false }), false);
  assert.equal(diffService({ running: true }, { running: false }), true);
});

test('firmware: new updates found by a check, once', () => {
  const none = { updates: 0, latest: '26.7.7' };
  const two = { updates: 2, latest: '26.7.8' };
  assert.equal(diffFirmware(undefined, two), false, 'baseline');
  assert.equal(diffFirmware(null, two), false, 'not read before');
  assert.equal(diffFirmware(none, two), true);
  assert.equal(diffFirmware({ updates: null, latest: null }, two), true, 'first check');
  assert.equal(diffFirmware(two, two), false);
  assert.equal(diffFirmware(two, { updates: 3, latest: '26.7.9' }), true, 'a newer release');
  assert.equal(diffFirmware(two, none), false);
});
