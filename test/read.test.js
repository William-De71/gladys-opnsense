import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toNumber,
  normalizeMac,
  parseUptime,
  parseVersion,
  readTemperature,
  readFirmware,
  readSystem,
  readGateways,
  readInterfaces,
  readHosts,
  readPeers,
  readServices,
  readRules,
} from '../src/read.js';
import { defaultAnswers, trafficAnswer, RULE_UUID, PHONE_MAC, TV_MAC } from './helpers/fixtures.js';

const raw = defaultAnswers();

test('numbers, MAC addresses, uptime and versions as OPNsense writes them', () => {
  assert.equal(toNumber('8.4 ms'), 8.4);
  assert.equal(toNumber('0.0 %'), 0);
  assert.equal(toNumber('~'), null);
  assert.equal(normalizeMac('A4-83-E7-12-34-56'), 'a4:83:e7:12:34:56');
  assert.equal(normalizeMac('incomplete'), null);
  assert.equal(parseUptime('12 days, 03:00:00'), 12.13);
  assert.equal(parseUptime('1 Tag, 12:00:00'), 1.5, 'the word is translated');
  assert.equal(parseUptime('06:00:00'), 0.25);
  assert.equal(parseUptime('N/A'), null);
  assert.equal(parseVersion('OPNsense 26.7.7_2-amd64'), '26.7.7_2');
});

test('the temperature: the hottest CPU sensor, else the hottest one', () => {
  assert.equal(readTemperature(raw['diagnostics/system/system_temperature']), 49);
  assert.equal(readTemperature([{ type: 'zone', temperature: '41.5' }]), 41.5);
  assert.equal(readTemperature([]), null);
});

test('the firmware: never checked, up to date, updates, upgrade', () => {
  assert.equal(readFirmware({ status: 'none', product: { product_check: null } }).updates, null);
  assert.equal(readFirmware(raw['core/firmware/status']).updates, 0);
  const update = readFirmware({
    status: 'update',
    all_packages: { a: {}, b: {}, c: {} },
    status_reboot: '1',
    product: { product_version: '26.7.7', product_latest: '26.7.8' },
  });
  assert.deepEqual(update, {
    status: 'update',
    updates: 3,
    version: '26.7.7',
    latest: '26.7.8',
    reboot: true,
  });
  assert.equal(readFirmware({ status: 'upgrade', all_sets: { base: {} }, product: {} }).updates, 1);
});

test('the firewall snapshot', () => {
  const system = readSystem({
    information: raw['diagnostics/system/system_information'],
    time: raw['diagnostics/system/system_time'],
    resources: raw['diagnostics/system/system_resources'],
    disk: raw['diagnostics/system/system_disk'],
    temperature: raw['diagnostics/system/system_temperature'],
    cpu: raw['diagnostics/cpu_usage/stream'][1],
    firmware: raw['core/firmware/status'],
  });
  assert.equal(system.hostname, 'fw.home.lan');
  assert.equal(system.version, '26.7.7');
  assert.equal(system.cpu, 9);
  assert.equal(system.memory, 25);
  assert.equal(system.disk, 12);
  assert.equal(system.temperature, 49);
  assert.equal(system.uptimeDays, 12.13);
  assert.equal(system.load, 0.21);
  assert.equal(system.firmware.updates, 0);
  // A failed read is unknown, never 0.
  const empty = readSystem({ time: raw['diagnostics/system/system_time'] });
  assert.equal(empty.cpu, null);
  assert.equal(empty.memory, null);
  assert.equal(empty.temperature, null);
});

test('gateways: dpinger statuses in four states', () => {
  const answer = {
    items: [
      { name: 'A', status: 'none', delay: '1.0 ms', loss: '0.0 %' },
      { name: 'B', status: 'force_down', delay: '~', loss: '~' },
      { name: 'C', status: 'delay+loss', delay: '300 ms', loss: '12 %' },
      { name: 'D', status: 'starting' },
      { name: 'bad name!', status: 'none' },
    ],
  };
  assert.deepEqual(
    readGateways(answer).map((g) => [g.name, g.status, g.delay, g.loss]),
    [
      ['A', 'online', 1, 0],
      ['B', 'offline', null, null],
      ['C', 'degraded', 300, 12],
      ['D', 'pending', null, null],
    ],
  );
});

test('interfaces: assigned ones only, a rate needs two readings, a counter reset is no rate', () => {
  const info = raw['interfaces/overview/interfaces_info'];
  const first = readInterfaces(info, trafficAnswer(0));
  assert.deepEqual(
    first.map((i) => [i.id, i.name, i.ipv4, i.inMbps]),
    [
      ['wan', 'WAN', '90.12.34.56', null],
      ['lan', 'LAN', '192.168.1.1', null],
    ],
  );
  const previous = new Map(first.map((i) => [i.id, i]));
  const second = readInterfaces(info, trafficAnswer(10), previous);
  assert.equal(second[0].inMbps, 80);
  assert.equal(second[0].outMbps, 20);
  const reset = readInterfaces(info, { ...trafficAnswer(20), interfaces: { wan: {} } }, previous);
  assert.equal(reset[0].inMbps, null);
});

test('hosts: ARP for who is here, leases for the names, never the firewall itself', () => {
  const interfaces = readInterfaces(raw['interfaces/overview/interfaces_info'], trafficAnswer(0));
  const hosts = readHosts(
    raw['diagnostics/interface/get_arp'],
    raw['dnsmasq/leases/search'],
    interfaces,
  );
  assert.deepEqual(
    hosts.map((h) => [h.mac, h.name, h.ip, h.iface, h.seen]),
    [
      ['00:11:32:aa:bb:cc', null, '192.168.1.10', 'lan', true],
      [TV_MAC, 'living-room-tv', '192.168.1.40', 'lan', false],
      [PHONE_MAC, 'pixel-8', '192.168.1.23', 'lan', true],
    ],
  );
  const expired = readHosts([{ mac: PHONE_MAC, ip: '1.2.3.4', expired: true }], undefined, []);
  assert.equal(expired[0].seen, false);
});

test('WireGuard peers, services and the rules of a category', () => {
  const peers = readPeers(raw['wireguard/service/show']);
  assert.deepEqual(
    peers.map((p) => [p.name, p.iface, p.online, p.endpoint]),
    [
      ['Laptop', 'Home', true, '203.0.113.7:51820'],
      ['Phone', 'Home', false, null],
    ],
  );
  assert.equal(peers[1].handshakeAt, null);
  assert.deepEqual(
    readServices(raw['core/service/search']).map((s) => [s.id, s.running]),
    [
      ['unbound', true],
      ['dnsmasq', true],
      ['wireguard', true],
    ],
  );
  const rules = readRules(
    raw['firewall/filter/search_rule'],
    raw['firewall/category/search_item'],
    'gladys',
  );
  assert.deepEqual(rules, [{ uuid: RULE_UUID, name: 'Block kids internet', enabled: false }]);
  assert.deepEqual(readRules(raw['firewall/filter/search_rule'], undefined, ''), []);
  const byName = readRules(
    { rows: [{ uuid: RULE_UUID, enabled: '1', description: 'x', categories: 'Gladys' }] },
    undefined,
    'gladys',
  );
  assert.equal(byName.length, 1, 'a category given by name');
});
