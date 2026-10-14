// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, and a
// single invalid field rejects the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  buildFirewallDevice,
  buildGatewayDevice,
  buildInterfaceDevice,
  buildRuleDevice,
  buildHostDevice,
  buildFirewallStates,
  idFromExternalId,
  hostName,
  macId,
  macOf,
} from '../src/device.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, RULE_UUID, PHONE_MAC } from './helpers/fixtures.js';

const system = { hostname: 'fw.home.lan', version: '26.7.7' };
const gateway = { name: 'WAN_DHCP', status: 'online', delay: 8.4, loss: 0 };
const iface = { id: 'wan', name: 'WAN', status: 'up', ipv4: '90.12.34.56' };
const rule = { uuid: RULE_UUID, name: 'Block kids internet', enabled: false };
const host = { mac: PHONE_MAC, name: 'pixel-8', vendor: 'Google, Inc.' };

/**
 * @description Every device, in a language.
 * @param {string} language - The language.
 * @returns {Array<object>} The devices.
 */
const devices = (language) => [
  buildFirewallDevice(fakeGladys, system, { temperature: true, wireguard: true }, language),
  buildGatewayDevice(fakeGladys, gateway, language),
  buildInterfaceDevice(fakeGladys, iface, language),
  buildRuleDevice(fakeGladys, rule, language),
  buildHostDevice(fakeGladys, host, language),
];

// DEVICE_FEATURE_UNITS_BY_CATEGORY of the Gladys core (server/utils/constants.js,
// master of 2026-10-14), for the categories used here.
const UNITS = {
  'level-sensor': [DEVICE_FEATURE_UNITS.PERCENT],
  'device-temperature-sensor': [DEVICE_FEATURE_UNITS.CELSIUS, DEVICE_FEATURE_UNITS.FAHRENHEIT],
  duration: [DEVICE_FEATURE_UNITS.MILLISECONDS, DEVICE_FEATURE_UNITS.DAYS],
  datarate: [DEVICE_FEATURE_UNITS.MEGABITS_PER_SECOND],
};
// Pairs with an icon in the Gladys front (front/src/utils/consts.js).
const PAIRS = [
  [DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.DEVICE_TEMPERATURE_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.DURATION, DEVICE_FEATURE_TYPES.DURATION.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER],
  [DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT],
  [DEVICE_FEATURE_CATEGORIES.DATARATE, DEVICE_FEATURE_TYPES.DATARATE.RATE],
  [DEVICE_FEATURE_CATEGORIES.SWITCH, DEVICE_FEATURE_TYPES.SWITCH.BINARY],
  [DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.PUSH],
];

test('devices are never polled by Gladys: the integration has its own timer', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        assert.equal(typeof feature.read_only, 'boolean', feature.external_id);
        assert.equal(typeof feature.has_feedback, 'boolean', feature.external_id);
        assert.ok(feature.name, feature.external_id);
      }
    }
  }
});

test('every category / type pair has an icon in Gladys, every unit belongs to its category', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      assert.ok(
        PAIRS.some(([category, type]) => feature.category === category && feature.type === type),
        `${feature.external_id}: ${feature.category} / ${feature.type}`,
      );
      if (feature.unit) {
        assert.ok(
          UNITS[feature.category]?.includes(feature.unit),
          `${feature.external_id}: ${feature.unit}`,
        );
      }
    }
  }
});

test('only the rule switch is a command', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      const command = feature.category === DEVICE_FEATURE_CATEGORIES.SWITCH;
      assert.equal(feature.read_only, !command, feature.external_id);
      assert.equal(feature.has_feedback, command, feature.external_id);
    }
  }
});

test('names tell the devices apart; a host without a name shows its maker and MAC', () => {
  const names = devices('fr').map((device) => device.name);
  assert.deepEqual(names, [
    'OPNsense fw',
    'Passerelle WAN_DHCP',
    'Interface WAN',
    'Règle Block kids internet',
    'pixel-8',
  ]);
  assert.equal(
    hostName({ mac: PHONE_MAC, name: null, vendor: 'Google, Inc.' }),
    `Google ${PHONE_MAC}`,
  );
  assert.equal(hostName({ mac: PHONE_MAC, name: null, vendor: null }), PHONE_MAC);
});

test('the optional features of the firewall', () => {
  const bare = buildFirewallDevice(fakeGladys, system, {}, 'en');
  const keys = bare.features.map((feature) => feature.external_id.split(':').pop());
  assert.deepEqual(keys, ['cpu', 'memory', 'disk', 'uptime', 'updates', 'version']);
});

test('external ids are built on stable platform ids and read back', () => {
  const ids = devices('en').map((device) => device.external_id);
  assert.deepEqual(ids, [
    'ext:opnsense:firewall:main',
    'ext:opnsense:gateway:WAN_DHCP',
    'ext:opnsense:interface:wan',
    `ext:opnsense:rule:${RULE_UUID}`,
    'ext:opnsense:host:a483e7123456',
  ]);
  assert.equal(idFromExternalId(`${ids[4]}:presence`, 'host'), 'a483e7123456');
  assert.equal(idFromExternalId(ids[3], 'rule'), RULE_UUID);
  assert.equal(idFromExternalId(ids[3], 'host'), null);
  assert.equal(macOf(macId(PHONE_MAC)), PHONE_MAC);
});

test('unknown values are not published', () => {
  const states = buildFirewallStates(
    fakeGladys,
    { cpu: 12.5, memory: null, version: '26.7.7' },
    'en',
  );
  assert.deepEqual(states, [
    { device_feature_external_id: 'ext:opnsense:firewall:main:cpu', state: 12.5 },
    { device_feature_external_id: 'ext:opnsense:firewall:main:version', text: '26.7.7' },
  ]);
});
