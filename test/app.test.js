// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices and the states like the host API does, and a fake OPNsense.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import {
  opnsense,
  silent,
  knownPath,
  trafficAnswer,
  arpEntry,
  NOW,
  RULE_UUID,
  PHONE_MAC,
  NAS_MAC,
} from './helpers/fixtures.js';

const CONFIG = { url: '192.168.1.1', api_key: 'key', api_secret: 'secret' };
const PREFIX = 'ext:test-integration';
const FIREWALL = `${PREFIX}:firewall:main`;
const WAN_GW = `${PREFIX}:gateway:WAN_DHCP`;
const WAN = `${PREFIX}:interface:wan`;
const RULE = `${PREFIX}:rule:${RULE_UUID}`;
const PHONE = `${PREFIX}:host:${PHONE_MAC.replace(/:/g, '')}`;
const NAS = `${PREFIX}:host:${NAS_MAC.replace(/:/g, '')}`;

/**
 * @description The integration, connected to a fake Gladys and a fake OPNsense.
 * @param {object} [options] - `{ config, fake, path }`.
 * @returns {Promise<object>} `{ gladys, app, fake, clock, path }`.
 */
async function startApp({ config = CONFIG, fake = opnsense(), path = knownPath() } = {}) {
  const clock = { now: NOW };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    request: fake,
    knownHostsPath: path,
    now: () => clock.now,
    logger: silent,
  });
  await gladys.connect();
  return { gladys, app, fake, clock, path };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

/**
 * @description The next reading, `seconds` later.
 * @param {object} context - `{ app, fake, clock }`.
 * @param {number} seconds - Seconds to move the clock.
 * @returns {Promise<void>}
 */
async function nextRound({ app, fake, clock }, seconds = 30) {
  clock.now += seconds * 1000;
  fake.answers['diagnostics/traffic/interface'] = trafficAnswer((clock.now - NOW) / 1000);
  await app.watcher.round();
}

test('the firewall, gateways, interfaces, rule and named hosts are offered, accepted by the host API checks', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ids = gladys.fake.discoveredDevices.map((device) => device.external_id);
  assert.deepEqual(ids.slice(0, 6), [
    FIREWALL,
    WAN_GW,
    `${PREFIX}:gateway:WAN_4G`,
    WAN,
    `${PREFIX}:interface:lan`,
    RULE,
  ]);
  // Hosts with a name only (default): the phone and the TV, not the NAS.
  assert.ok(ids.includes(PHONE));
  assert.ok(ids.includes(`${PREFIX}:host:3c2af4010203`));
  assert.ok(!ids.includes(NAS));
  assert.ok(gladys.fake.discoveredDevices.every((device) => device.should_poll === false));
  const firewall = gladys.fake.discoveredDevices[0];
  assert.equal(firewall.name, 'OPNsense fw');
  assert.ok(firewall.features.some((f) => f.external_id === `${FIREWALL}:temperature`));
  assert.ok(firewall.features.some((f) => f.external_id === `${FIREWALL}:vpn_peers`));
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /OPNsense 26\.7\.7 : 2\/2 passerelle/);
  assert.equal(gladys.fake.states.length, 0, 'nothing before a device exists');
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first reading is a baseline');
  // HTTP Basic with the key pair, never in the URL.
  const auth = fake.calls[0].headers.Authorization;
  assert.equal(auth, `Basic ${Buffer.from('key:secret').toString('base64')}`);
});

test('creating a device publishes all its states, then only what changed', async (t) => {
  const context = await startApp();
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, FIREWALL);
  assert.equal(gladys.fake.lastState(`${FIREWALL}:cpu`), 9);
  assert.equal(gladys.fake.lastState(`${FIREWALL}:memory`), 25);
  assert.equal(gladys.fake.lastState(`${FIREWALL}:disk`), 12);
  assert.equal(gladys.fake.lastState(`${FIREWALL}:temperature`), 49);
  assert.equal(gladys.fake.lastState(`${FIREWALL}:uptime`), 12.13);
  assert.equal(gladys.fake.lastState(`${FIREWALL}:updates`), 0);
  assert.equal(gladys.fake.lastState(`${FIREWALL}:version`), '26.7.7');
  assert.equal(gladys.fake.lastState(`${FIREWALL}:vpn_peers`), 1);
  const count = gladys.fake.states.length;
  await nextRound(context);
  assert.equal(gladys.fake.states.length, count, 'nothing changed');
  context.fake.answers['diagnostics/system/system_resources'].memory.used = 4294967296;
  await nextRound(context);
  assert.equal(gladys.fake.lastState(`${FIREWALL}:memory`), 50);
  assert.equal(gladys.fake.states.length, count + 1);
});

test('interfaces publish their rates from two readings of the counters', async (t) => {
  const context = await startApp();
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, WAN);
  assert.equal(gladys.fake.lastState(`${WAN}:received`), undefined, 'no rate from one reading');
  assert.equal(gladys.fake.lastState(`${WAN}:ipv4`), '90.12.34.56');
  await nextRound(context);
  assert.equal(gladys.fake.lastState(`${WAN}:received`), 80);
  assert.equal(gladys.fake.lastState(`${WAN}:sent`), 20);
});

test('a gateway going down publishes its state and fires one scene event', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, WAN_GW);
  assert.equal(gladys.fake.lastState(`${WAN_GW}:status`), 'Online');
  fake.answers['routes/gateway/status'].items[0] = {
    ...fake.answers['routes/gateway/status'].items[0],
    status: 'down',
    loss: '100.0 %',
    delay: '0.0 ms',
  };
  await nextRound(context);
  await nextRound(context);
  const events = eventsOf(gladys, TRIGGERS.GATEWAY_STATUS_CHANGED);
  assert.equal(events.length, 1, 'one event per transition');
  assert.equal(events[0].data.device, WAN_GW);
  assert.equal(events[0].data.status, 'offline');
  assert.equal(events[0].data.previous_status, 'online');
  assert.equal(events[0].data.loss, 100);
  assert.equal(gladys.fake.lastState(`${WAN_GW}:status`), 'Offline');
});

test('presence: arrived at once, left after the absence delay only', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, PHONE);
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
  const arp = fake.answers['diagnostics/interface/get_arp'];
  fake.answers['diagnostics/interface/get_arp'] = arp.filter((entry) => entry.mac !== PHONE_MAC);
  await nextRound(context, 120);
  assert.equal(eventsOf(gladys, TRIGGERS.NETWORK_DEVICE_PRESENCE).length, 0, 'not yet');
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
  await nextRound(context, 240);
  const [left] = eventsOf(gladys, TRIGGERS.NETWORK_DEVICE_PRESENCE);
  assert.equal(left.data.event, 'left');
  assert.equal(left.data.device, PHONE);
  assert.equal(left.data.mac, PHONE_MAC);
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 0);
  fake.answers['diagnostics/interface/get_arp'] = arp;
  await nextRound(context);
  const events = eventsOf(gladys, TRIGGERS.NETWORK_DEVICE_PRESENCE);
  assert.equal(events.at(-1).data.event, 'arrived');
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
});

test('presence: a present device is dated again every minute', async (t) => {
  // The SDK dates its heartbeat with Date.now().
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const context = await startApp();
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, PHONE);
  const count = () =>
    gladys.fake.states.filter((s) => s.device_feature_external_id === `${PHONE}:presence`).length;
  const first = count();
  t.mock.timers.tick(30000);
  await nextRound(context, 30);
  assert.equal(count(), first, 'within the heartbeat');
  t.mock.timers.tick(40000);
  await nextRound(context, 40);
  assert.equal(count(), first + 1, 'heartbeat');
});

test('a MAC address never met fires "new device" once, and survives a restart', async (t) => {
  const path = knownPath();
  const context = await startApp({ path });
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  fake.answers['diagnostics/interface/get_arp'].push(
    arpEntry('de:ad:be:ef:00:01', '192.168.1.99', 'igc1', '', 'Espressif Inc.'),
  );
  await nextRound(context);
  await nextRound(context);
  const events = eventsOf(gladys, TRIGGERS.NEW_NETWORK_DEVICE);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.mac, 'de:ad:be:ef:00:01');
  assert.equal(events[0].data.interface, 'lan');
  assert.equal(events[0].data.vendor, 'Espressif Inc.');

  const again = await startApp({ path, fake });
  t.after(() => again.gladys.fake.shutdown());
  await nextRound(again);
  assert.equal(eventsOf(again.gladys, TRIGGERS.NEW_NETWORK_DEVICE).length, 0, 'known on disk');
});

test('VPN peers and services fire their transitions', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  fake.answers['wireguard/service/show'].rows[2]['peer-status'] = 'online';
  fake.answers['core/service/search'].rows[0].running = 0;
  await nextRound(context);
  const [peer] = eventsOf(gladys, TRIGGERS.VPN_PEER_CHANGED);
  assert.equal(peer.data.peer, 'Phone');
  assert.equal(peer.data.state, 'connected');
  const [service] = eventsOf(gladys, TRIGGERS.SERVICE_STATE_CHANGED);
  assert.equal(service.data.service, 'unbound');
  assert.equal(service.data.state, 'stopped');
});

test('a rule switch toggles the rule, applies the filter, never fires an event', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const device = await created(gladys, RULE);
  assert.equal(gladys.fake.lastState(`${RULE}:enabled`), 0);
  const ack = await gladys.fake.setValue(device, device.features[0], 1);
  assert.equal(ack.success, true, ack.error);
  const posts = fake.calls.filter((call) => call.method === 'POST').map((call) => call.path);
  assert.deepEqual(posts, [`firewall/filter/toggle_rule/${RULE_UUID}/1`, 'firewall/filter/apply']);
  assert.equal(gladys.fake.lastState(`${RULE}:enabled`), 1);
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('read-only features refuse a command', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const device = await created(gladys, FIREWALL);
  const ack = await gladys.fake.setValue(device, device.features[0], 1);
  assert.equal(ack.success, false);
});

test('scene action get_status returns every declared output', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_STATUS, {});
  assert.equal(ack.success, true, ack.error);
  const { outputs } = ack.data;
  assert.equal(outputs.cpu, 9);
  assert.equal(outputs.gateways_online, 2);
  assert.equal(outputs.devices_present, 2);
  assert.equal(outputs.vpn_peers_online, 1);
  assert.equal(outputs.version, '26.7.7');
  assert.match(outputs.summary, /CPU 9 %/);
});

test('scene action wake_on_lan wakes a created host on its interface', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.WAKE_ON_LAN, { device: PHONE });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { mac: PHONE_MAC, interface: 'lan' });
  const call = fake.calls.find((c) => c.path === 'wol/wol/set');
  assert.deepEqual(call.body, { wake: { interface: 'lan', mac: PHONE_MAC } });
  const typed = await gladys.fake.sceneAction(SCENE_ACTIONS.WAKE_ON_LAN, {
    mac: 'AA-BB-CC-00-11-22',
  });
  assert.equal(typed.success, false, 'no interface known for a typed MAC');
});

test('scene action alias_address adds the IP of a device, refuses a bad alias', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.ALIAS_ADDRESS, {
    alias: 'kids_block',
    operation: 'add',
    device: PHONE,
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    alias: 'kids_block',
    address: '192.168.1.23',
    operation: 'add',
  });
  const call = fake.calls.find((c) => c.path === 'firewall/alias_util/add/kids_block');
  assert.deepEqual(call.body, { address: '192.168.1.23' });
  const bad = await gladys.fake.sceneAction(SCENE_ACTIONS.ALIAS_ADDRESS, {
    alias: 'kids block; rm',
    operation: 'add',
    address: '192.168.1.5',
  });
  assert.equal(bad.success, false);
});

test('scene action restart_service restarts it without firing "service started"', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  fake.answers['core/service/search'].rows[0].running = 0;
  await nextRound(context);
  fake.answers['core/service/search'].rows[0].running = 1;
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.RESTART_SERVICE, { service: 'unbound' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { service: 'unbound', running: true });
  assert.ok(fake.calls.some((c) => c.path === 'core/service/restart/unbound'));
  await nextRound(context);
  const states = eventsOf(gladys, TRIGGERS.SERVICE_STATE_CHANGED).map((e) => e.data.state);
  assert.deepEqual(states, ['stopped'], 'no "started" out of a scene action');
});

test('check_updates probes the mirror and never fires the update trigger itself', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  fake.answers['core/firmware/status'] = {
    status: 'update',
    all_packages: { opnsense: {}, 'php83-8.3.27': {} },
    status_reboot: '1',
    product: { product_version: '26.7.7', product_latest: '26.7.8', product_check: {} },
  };
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.CHECK_UPDATES, {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.outputs.updates, 2);
  assert.equal(ack.data.outputs.new_version, '26.7.8');
  assert.match(ack.data.outputs.summary, /2 OPNsense update\(s\) available \(26\.7\.8\)/);
  const probe = fake.calls.find((c) => c.path === 'core/firmware/status' && c.method === 'POST');
  assert.ok(probe, 'POST runs the check');
  await nextRound(context);
  assert.equal(eventsOf(gladys, TRIGGERS.FIRMWARE_UPDATE_AVAILABLE).length, 0);
});

test('a firmware check run by OPNsense itself fires the update trigger', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  fake.answers['core/firmware/status'] = {
    status: 'update',
    all_packages: { opnsense: {} },
    product: { product_version: '26.7.7', product_latest: '26.7.8', product_check: {} },
  };
  await nextRound(context, 11 * 60);
  const [event] = eventsOf(gladys, TRIGGERS.FIRMWARE_UPDATE_AVAILABLE);
  assert.equal(event.data.new_version, '26.7.8');
  assert.equal(event.data.updates, 1);
  assert.equal(event.data.reboot, false);
});

test('scene action reboot posts the reboot', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.REBOOT, {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(fake.count('core/system/reboot'), 1);
});

test('every widget content is valid for the core, in the four languages', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await created(gladys, WAN);
  for (const key of Object.values(WIDGETS)) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      const ack = await gladys.fake.widgetGet(key, { language, settings: {} });
      assert.equal(ack.success, true, `${key}: ${ack.error}`);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
  }
  const internet = await gladys.fake.widgetGet(WIDGETS.INTERNET, { settings: {} });
  assert.ok(internet.data.content.components.some((c) => c.type === 'chart'));
});

test('widget buttons: check for updates, reboot', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const check = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.CHECK_UPDATES);
  assert.equal(check.success, true, check.error);
  assert.match(check.data.message.fr, /OPNsense 26\.7\.7 est à jour/);
  const reboot = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.REBOOT);
  assert.match(reboot.data.message.en, /rebooting/);
  assert.equal(fake.count('core/system/reboot'), 1);
});

test('configuration actions: test the connection, forget the known devices', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.fr, /Connecté à fw\.home\.lan \(OPNsense 26\.7\.7\)/);
  const forget = await gladys.fake.action(ACTIONS.FORGET_DEVICES);
  assert.match(forget.data.message.en, /forgotten/);
});

test('errors become clear connection statuses', async (t) => {
  for (const [status, pattern] of [
    [401, /refuse la clé/],
    [404, /ne répond pas comme une API OPNsense/],
    ['ECONNREFUSED', /ne répond pas à https:\/\/192\.168\.1\.1/],
  ]) {
    const fake = opnsense({ statuses: { 'diagnostics/system/system_time': status } });
    const { gladys } = await startApp({ fake });
    t.after(() => gladys.fake.shutdown());
    assert.equal(gladys.fake.connectionStatus.connected, false, String(status));
    assert.match(gladys.fake.connectionStatus.message.fr, pattern);
  }
  const { gladys } = await startApp({ config: {} });
  t.after(() => gladys.fake.shutdown());
  assert.match(gladys.fake.connectionStatus.message.en, /Enter the address of OPNsense/);
});

test('without "Lobby: Dashboard", the privileges granted still work', async (t) => {
  // forum 11221: a user with only "Diagnostics: ARP Table" and "System: Gateways".
  const forbidden = [
    'diagnostics/system/system_time',
    'diagnostics/system/system_information',
    'diagnostics/system/system_resources',
    'diagnostics/system/system_disk',
    'diagnostics/system/system_temperature',
    'diagnostics/cpu_usage/stream',
    'core/firmware/status',
    'interfaces/overview/interfaces_info',
    'diagnostics/traffic/interface',
    'dnsmasq/leases/search',
    'kea/leases4/search',
    'wireguard/service/show',
    'core/service/search',
    'firewall/category/search_item',
    'firewall/filter/search_rule',
  ];
  const fake = opnsense({ statuses: Object.fromEntries(forbidden.map((path) => [path, 403])) });
  const { gladys } = await startApp({ fake });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(
    gladys.fake.connectionStatus.message.fr,
    /sans le droit « Lobby: Dashboard ».*2\/2 passerelle\(s\) en ligne/,
  );
  const offered = gladys.fake.discoveredDevices.map((d) => d.external_id);
  assert.ok(offered.includes(WAN_GW), 'the gateway');
  assert.ok(offered.includes(PHONE), 'the hosts of the ARP table');
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.fr, /n’a pas le droit « Lobby: Dashboard »/);
  assert.equal(fake.count('diagnostics/system/system_time'), 2, 'still the probe');
});

test('a missing plugin is skipped, the rest is read', async (t) => {
  const fake = opnsense({
    statuses: { 'wireguard/service/show': 404, 'dnsmasq/leases/search': 404 },
  });
  const { gladys } = await startApp({ fake });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, true);
  const firewall = gladys.fake.discoveredDevices[0];
  assert.ok(!firewall.features.some((f) => f.external_id.endsWith(':vpn_peers')));
  assert.equal(fake.count('kea/leases4/search'), 1, 'Kea after dnsmasq');
});

test('an empty rule category offers no rule; a new address starts a new baseline', async (t) => {
  const { gladys, app } = await startApp({ config: { ...CONFIG, rule_category: '' } });
  t.after(() => gladys.fake.shutdown());
  assert.ok(!gladys.fake.discoveredDevices.some((d) => d.external_id === RULE));
  await gladys.fake.configUpdated({ ...CONFIG, url: '10.0.0.1' });
  assert.equal(app.getConfig().url, 'https://10.0.0.1');
  assert.equal(gladys.fake.sceneEvents.length, 0);
  assert.ok(gladys.fake.discoveredDevices.some((d) => d.external_id === RULE));
  assert.equal(app.watcher.fetchedAt(), NOW);
});
