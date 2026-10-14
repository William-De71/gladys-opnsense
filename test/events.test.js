// Scene payloads against the manifest and the limits of the core: flat data,
// at most 30 keys, scalar values, strings of at most 1,000 characters; every
// declared variable and every filter field present; outputs exactly the
// declared ones.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TRIGGERS,
  gatewayEvent,
  presenceEvent,
  newHostEvent,
  peerEvent,
  serviceEvent,
  firmwareEvent,
  statusOutputs,
  firmwareOutputs,
} from '../src/events.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, PHONE_MAC } from './helpers/fixtures.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const triggers = byKey(manifest.scene_triggers);
const actions = byKey(manifest.scene_actions);

const host = {
  mac: PHONE_MAC,
  name: 'pixel-8',
  ip: '192.168.1.23',
  iface: 'lan',
  vendor: 'Google',
};
const firmware = {
  status: 'update',
  updates: 2,
  version: '26.7.7',
  latest: '26.7.8',
  reboot: true,
};

/**
 * @description Every event, in a language.
 * @param {string} language - The language.
 * @returns {Array<object>} The events.
 */
const events = (language) => [
  gatewayEvent(
    fakeGladys,
    {
      gateway: { name: 'WAN_DHCP', status: 'degraded', delay: 312.5, loss: 4 },
      previous: 'online',
    },
    language,
  ),
  presenceEvent(fakeGladys, { host, event: 'left' }, language),
  newHostEvent({ host: { ...host, name: null, vendor: 'x'.repeat(2000) } }, language),
  peerEvent({ peer: { name: 'Laptop', iface: 'Home', online: true, endpoint: null } }, language),
  serviceEvent(
    { service: { id: 'unbound', name: 'unbound', description: 'Unbound DNS', running: false } },
    language,
  ),
  firmwareEvent(firmware, language),
];

test('every trigger of the manifest has a builder, and back', () => {
  const keys = events('en').map((event) => event.key);
  assert.deepEqual([...new Set(keys)].sort(), Object.values(TRIGGERS).sort());
  assert.deepEqual([...triggers.keys()].sort(), Object.values(TRIGGERS).sort());
});

test('event data is flat, bounded, and carries every variable and filter field', () => {
  for (const language of LANGUAGES) {
    for (const { key, data } of events(language)) {
      const trigger = triggers.get(key);
      assert.ok(Object.keys(data).length <= 30, key);
      for (const [name, value] of Object.entries(data)) {
        const type = typeof value;
        assert.ok(
          ['string', 'number', 'boolean'].includes(type) || value === null,
          `${key}.${name}`,
        );
        if (type === 'string') {
          assert.ok(value.length <= 1000, `${key}.${name}: ${value.length}`);
        }
        if (type === 'number') {
          assert.ok(Number.isFinite(value), `${key}.${name}`);
        }
      }
      for (const variable of trigger.variables) {
        assert.ok(variable.key in data, `${key}: variable ${variable.key}`);
        const expected = variable.type;
        assert.equal(typeof data[variable.key], expected, `${key}.${variable.key}`);
      }
      for (const field of trigger.fields ?? []) {
        assert.ok(field.key in data, `${key}: field ${field.key}`);
      }
    }
  }
});

test('the filter values sent are among the options of the manifest', () => {
  const values = (trigger, field) =>
    triggers
      .get(trigger)
      .fields.find((f) => f.key === field)
      .options.map((o) => o.value);
  const [gateway, presence, , peer, service] = events('en');
  assert.ok(values('gateway_status_changed', 'status').includes(gateway.data.status));
  assert.ok(values('network_device_presence', 'event').includes(presence.data.event));
  assert.ok(values('vpn_peer_changed', 'state').includes(peer.data.state));
  assert.ok(values('service_state_changed', 'state').includes(service.data.state));
  assert.equal(presence.data.device, 'ext:opnsense:host:a483e7123456');
});

test('summaries in the language asked', () => {
  const [gateway, presence] = events('fr');
  assert.equal(
    gateway.data.summary,
    'La passerelle WAN_DHCP est dégradée : 312,5 ms, 4 % de perte.',
  );
  assert.equal(presence.data.summary, 'pixel-8 a quitté le réseau.');
  assert.equal(
    firmwareEvent(firmware, 'en').data.summary,
    '2 OPNsense update(s) available (26.7.8). A reboot will be needed.',
  );
});

test('scene action outputs: exactly the declared ones, scalars, -1 when unknown', () => {
  const outputs = {
    get_status: statusOutputs({ system: null, gateways: [], hosts: [], peers: [] }, 'en'),
    check_updates: firmwareOutputs(null, 'en'),
  };
  for (const [key, values] of Object.entries(outputs)) {
    const declared = actions
      .get(key)
      .outputs.map((output) => output.key)
      .sort();
    assert.deepEqual(Object.keys(values).sort(), declared, key);
    for (const output of actions.get(key).outputs) {
      assert.equal(typeof values[output.key], output.type, `${key}.${output.key}`);
    }
  }
  assert.equal(outputs.get_status.cpu, -1);
  assert.equal(outputs.check_updates.updates, -1);
});
