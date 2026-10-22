// Every widget content through validateWidgetContent (the checks of the core,
// which only run in debug mode in production) and the content budget of a
// card, in the four languages and in the edge cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildOverviewWidget,
  buildInternetWidget,
  buildNetworkWidget,
  buildVpnWidget,
  readInternetSettings,
  readNetworkSettings,
  formatUptime,
  NETWORK_SHOW,
} from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { NOW, MINUTE } from './helpers/fixtures.js';

const types = (content) => content.components.map((component) => component.type);

/**
 * @description Assert a content is valid and within the budget of a card.
 * @param {object} content - The content.
 * @param {string} label - For the messages.
 */
function assertValid(content, label) {
  assert.deepEqual(validateWidgetContent(content), [], label);
  const count = (list) => types(content).filter((type) => list.includes(type)).length;
  assert.ok(content.components.length <= 8, label);
  assert.ok(count(['value', 'gauge']) <= 6, label);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1, label);
  assert.ok(count(['text']) <= 2, label);
  assert.ok(count(['status']) <= 1, label);
  assert.ok(count(['button']) <= 4, label);
  assert.ok(content.ttl_seconds >= 10 && content.ttl_seconds <= 3600, label);
}

const system = {
  hostname: 'fw.home.lan',
  version: '26.7.7',
  cpu: 9,
  memory: 92.4,
  disk: 12,
  temperature: 71,
  uptimeDays: 12.13,
  firmware: { updates: 3, version: '26.7.7', latest: '26.7.8' },
};
const gateways = Array.from({ length: 9 }, (_, i) => ({
  name: `GATEWAY_WITH_A_VERY_LONG_NAME_${i}`,
  status: ['online', 'offline', 'degraded', 'pending'][i % 4],
  delay: 12.3,
  loss: i,
}));
const hosts = Array.from({ length: 20 }, (_, i) => ({
  mac: `00:00:00:00:00:${String(i).padStart(2, '0')}`,
  name: i % 3 ? `host-${i}-with-a-name-far-too-long-to-fit-on-one-line-of-the-card` : null,
  ip: `192.168.1.${i + 10}`,
  iface: 'opt12',
  vendor: 'Some Manufacturer Incorporated',
  present: i % 2 === 0,
  lastSeen: NOW - i * MINUTE,
}));

test('overview: valid in every language, with and without the optional parts', () => {
  for (const language of LANGUAGES) {
    const full = buildOverviewWidget({
      system,
      gateways,
      language,
      now: NOW,
      fetchedAt: NOW,
      pollSeconds: 30,
    });
    assertValid(full, `full ${language}`);
    assert.deepEqual(types(full), [
      'text',
      'gauge',
      'gauge',
      'gauge',
      'value',
      'status',
      'button',
      'button',
    ]);
    const bare = buildOverviewWidget({
      system: {
        hostname: null,
        version: null,
        cpu: null,
        memory: null,
        disk: null,
        temperature: null,
        uptimeDays: null,
        firmware: null,
      },
      gateways: [],
      language,
      now: NOW,
      fetchedAt: NOW,
      pollSeconds: 5,
    });
    assertValid(bare, `bare ${language}`);
  }
});

test('overview: the reboot asks for a confirmation, the colors follow the load', () => {
  const content = buildOverviewWidget({
    system,
    gateways,
    language: 'en',
    now: NOW,
    fetchedAt: NOW,
    pollSeconds: 30,
  });
  const reboot = content.components.find((c) => c.type === 'button' && c.action.key === 'reboot');
  assert.equal(reboot.action.confirm, true);
  assert.equal(content.components[2].color, 'danger', 'memory at 92 %');
  assert.equal(content.components[4].color, 'warning', '71 °C');
  assert.equal(formatUptime(12.13, 'fr'), '12 j 3 h');
});

test('internet: tiles, chart once the interface exists, a message without WAN', () => {
  const gateway = gateways[0];
  const iface = { id: 'wan', name: 'WAN', ipv4: '90.12.34.56', inMbps: 80, outMbps: 20 };
  for (const language of LANGUAGES) {
    const content = buildInternetWidget({
      gateway,
      iface,
      language,
      pollSeconds: 30,
      featureId: (key) => `ext:opnsense:interface:wan:${key}`,
    });
    assertValid(content, language);
    assert.ok(types(content).includes('chart'));
    assertValid(
      buildInternetWidget({ gateway: null, iface: null, language, pollSeconds: 30 }),
      language,
    );
  }
  const noChart = buildInternetWidget({ gateway, iface, language: 'en', pollSeconds: 30 });
  assert.ok(!types(noChart).includes('chart'));
  assert.deepEqual(readInternetSettings({ interval: 'nope' }).interval, 'last-day');
});

test('network: present, absent, all and new, valid with long names and many hosts', () => {
  const recent = hosts.map((host, i) => ({ mac: host.mac, firstSeen: NOW - i * MINUTE }));
  for (const language of LANGUAGES) {
    for (const show of NETWORK_SHOW) {
      const content = buildNetworkWidget({
        hosts,
        language,
        now: NOW,
        pollSeconds: 30,
        show,
        recent,
      });
      assertValid(content, `${show} ${language}`);
      const list = content.components.find((c) => c.type === 'card-list');
      assert.ok(list.items.length <= 8);
    }
    assertValid(buildNetworkWidget({ hosts: [], language, now: NOW, pollSeconds: 30 }), language);
  }
  const content = buildNetworkWidget({
    hosts,
    language: 'en',
    now: NOW,
    pollSeconds: 30,
    created: new Set([hosts[2].mac]),
  });
  const [first] = content.components[1].items;
  assert.match(first.subtitle, /^192\.168\.1\.\d+/, 'the IP first: the line is cut');
  assert.equal(readNetworkSettings({ show: 'x' }).show, 'present');
  assert.equal(readNetworkSettings({ show: 'new' }).show, 'new');
});

test('network: the new devices, newest first, even one not read since a restart', () => {
  const recent = [
    { mac: 'de:ad:be:ef:00:01', firstSeen: NOW - 3 * 60 * MINUTE },
    { mac: hosts[4].mac, firstSeen: NOW - 2 * 24 * 60 * MINUTE },
  ];
  const content = buildNetworkWidget({
    hosts,
    language: 'fr',
    now: NOW,
    pollSeconds: 30,
    show: 'new',
    recent,
  });
  assertValid(content, 'new');
  assert.match(content.components[0].text, /^2 nouveau\(x\) en 7 jours/);
  const [unread, known] = content.components[1].items;
  assert.equal(unread.title, 'de:ad:be:ef:00:01');
  assert.equal(unread.subtitle, 'nouveau, il y a 3 h');
  assert.equal(unread.badge.text, 'Parti');
  assert.equal(known.subtitle, '192.168.1.14 · nouveau, il y a 2 jours');
  const empty = buildNetworkWidget({
    hosts,
    language: 'en',
    now: NOW,
    pollSeconds: 30,
    show: 'new',
  });
  assert.match(empty.components[1].text, /No new device/);
});

test('vpn: peers online first, a message without peer', () => {
  const peers = [
    { name: 'Phone', iface: 'Home', online: false, handshakeAt: null },
    { name: 'Laptop', iface: 'Home', online: true, handshakeAt: NOW - 2 * MINUTE },
  ];
  for (const language of LANGUAGES) {
    const content = buildVpnWidget({ peers, language, now: NOW, pollSeconds: 30 });
    assertValid(content, language);
    assert.equal(content.components[1].items[0].title, 'Laptop');
    assertValid(buildVpnWidget({ peers: [], language, now: NOW, pollSeconds: 30 }), language);
  }
});
