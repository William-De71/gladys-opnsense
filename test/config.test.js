import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  normalizeUrl,
  hasCredentials,
  readLanguage,
  POLL_INTERVAL,
  ABSENCE_DELAY,
} from '../src/config.js';

test('the address: https by default, no path, a port kept', () => {
  assert.equal(normalizeUrl('192.168.1.1'), 'https://192.168.1.1');
  assert.equal(normalizeUrl(' https://fw.home.lan:8443/ui/ '), 'https://fw.home.lan:8443');
  assert.equal(normalizeUrl('http://10.0.0.1'), 'http://10.0.0.1');
  assert.equal(normalizeUrl('ftp://10.0.0.1'), null);
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl(undefined), null);
});

test('defaults, bounds and types of every field', () => {
  const config = normalizeConfig({});
  assert.equal(config.pollInterval, POLL_INTERVAL.default);
  assert.equal(config.absenceDelay, ABSENCE_DELAY.default);
  assert.equal(config.verifyTls, false);
  assert.equal(config.networkDevices, 'named');
  assert.equal(config.ruleCategory, 'gladys');
  assert.equal(config.language, 'auto');
  assert.equal(normalizeConfig({ poll_interval: '2' }).pollInterval, POLL_INTERVAL.min);
  assert.equal(normalizeConfig({ poll_interval: 1e6 }).pollInterval, POLL_INTERVAL.max);
  assert.equal(normalizeConfig({ absence_delay: '' }).absenceDelay, ABSENCE_DELAY.default);
  assert.equal(normalizeConfig({ verify_tls: 'true' }).verifyTls, true);
  assert.equal(normalizeConfig({ network_devices: 'everything' }).networkDevices, 'named');
  assert.equal(normalizeConfig({ rule_category: '' }).ruleCategory, '', 'empty turns rules off');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'auto');
});

test('credentials need an address, a key and a secret; a secret is kept as typed', () => {
  const config = normalizeConfig({ url: '10.0.0.1', api_key: ' k ', api_secret: ' s ' });
  assert.equal(config.apiKey, 'k');
  assert.equal(config.apiSecret, ' s ');
  assert.equal(hasCredentials(config), true);
  assert.equal(hasCredentials(normalizeConfig({ url: '10.0.0.1', api_key: 'k' })), false);
});

test('the stored language of the last widget request', () => {
  assert.equal(readLanguage({ last_language: 'de' }, 'en'), 'de');
  assert.equal(readLanguage({ last_language: 'german' }, 'en'), 'en');
  assert.equal(readLanguage(null, 'fr'), 'fr');
});
