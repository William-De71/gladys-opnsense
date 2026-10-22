// The known MAC addresses on disk: the dates of the new ones, and the files
// written by older versions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

import { createKnownHosts, NEW_HOST_WINDOW_MS } from '../src/store.js';
import { silent, knownPath, NOW } from './helpers/fixtures.js';

const DAY = 24 * 3600 * 1000;

test('the baseline has no date, the addresses met after it do, past the window they go', async () => {
  const path = knownPath();
  const known = createKnownHosts({ path, logger: silent });
  await known.load();
  await known.add(['aa:aa:aa:aa:aa:01']);
  await known.add(['aa:aa:aa:aa:aa:02'], NOW);
  await known.add(['aa:aa:aa:aa:aa:02'], NOW + DAY);
  assert.deepEqual(known.recent(NOW - NEW_HOST_WINDOW_MS), [
    { mac: 'aa:aa:aa:aa:aa:02', firstSeen: NOW },
  ]);

  const again = createKnownHosts({ path, logger: silent });
  await again.load();
  assert.deepEqual(again.recent(0), [{ mac: 'aa:aa:aa:aa:aa:02', firstSeen: NOW }]);
  await again.add(['aa:aa:aa:aa:aa:03'], NOW + 8 * DAY);
  const file = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(file.macs.length, 3);
  assert.deepEqual(file.firstSeen, { 'aa:aa:aa:aa:aa:03': NOW + 8 * DAY });

  await again.clear();
  assert.deepEqual(again.recent(0), []);
});

test('a version 1 file reads as old addresses, nothing new', async () => {
  const path = knownPath();
  await writeFile(path, JSON.stringify({ version: 1, macs: ['aa:aa:aa:aa:aa:01'] }));
  const known = createKnownHosts({ path, logger: silent });
  await known.load();
  assert.equal(known.initialized(), true);
  assert.equal(known.has('aa:aa:aa:aa:aa:01'), true);
  assert.deepEqual(known.recent(0), []);
});
