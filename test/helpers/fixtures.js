// A fake OPNsense for the tests: the answers of the API as opnsense/core
// 26.7 builds them (shapes from the controllers and configd scripts, values
// of a small home network), served through the `request` transport of the
// client. Tests never touch the network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOW = Date.parse('2026-10-14T18:00:00Z');
const MINUTE = 60000;
const RULE_UUID = '6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b';
const CATEGORY_UUID = '0d9b7c6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const PHONE_MAC = 'a4:83:e7:12:34:56';
const NAS_MAC = '00:11:32:aa:bb:cc';
const TV_MAC = '3c:2a:f4:01:02:03';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary file path for the known MAC addresses.
 * @returns {string} The path (its directory exists, the file does not).
 */
const knownPath = () => join(mkdtempSync(join(tmpdir(), 'opnsense-')), 'known-hosts.json');

/**
 * @description The default answers, one per endpoint (GET path or POST path).
 * @returns {object} The answers.
 */
function defaultAnswers() {
  return {
    'diagnostics/system/system_information': {
      name: 'fw.home.lan',
      versions: ['OPNsense 26.7.7-amd64', 'FreeBSD 14.3-RELEASE-p4', 'OpenSSL 3.0.17'],
      updates: 'Click to check for updates.',
    },
    'diagnostics/system/system_time': {
      uptime: '12 days, 03:00:00',
      datetime: 'Wed Oct 14 20:00:00 CEST 2026',
      boottime: 'Fri Oct 2 17:00:00 CEST 2026',
      config: 'Mon Oct 12 10:00:00 CEST 2026',
      loadavg: '0.21, 0.18, 0.15',
    },
    'diagnostics/system/system_resources': {
      memory: { total: '8589934592', total_frmt: '8192', used: 2147483648, used_frmt: '2048' },
    },
    'diagnostics/system/system_disk': {
      devices: [
        { device: 'zroot/ROOT/default', type: 'zfs', used_pct: 12, mountpoint: '/' },
        { device: 'zroot/tmp', type: 'zfs', used_pct: 0, mountpoint: '/tmp' },
      ],
    },
    'diagnostics/system/system_temperature': [
      { device: 'dev.cpu.0.temperature', temperature: '47.0', type: 'cpu' },
      { device: 'dev.cpu.1.temperature', temperature: '49.0', type: 'cpu' },
      { device: 'hw.acpi.thermal.tz0.temperature', temperature: '27.9', type: 'zone' },
    ],
    // Two samples of the stream: since boot, then now.
    'diagnostics/cpu_usage/stream': [
      { total: 3, user: 1, nice: 0, sys: 2, intr: 0, idle: 97 },
      { total: 9, user: 5, nice: 0, sys: 3, intr: 1, idle: 91 },
    ],
    'core/firmware/status': {
      status: 'none',
      status_msg: 'There are no updates available on the selected mirror.',
      product: {
        product_version: '26.7.7',
        product_latest: '26.7.7',
        product_check: { upgrade_packages: [] },
      },
    },
    'routes/gateway/status': {
      items: [
        {
          name: 'WAN_DHCP',
          address: '90.12.34.1',
          status: 'none',
          loss: '0.0 %',
          delay: '8.4 ms',
          stddev: '0.6 ms',
          monitor: '1.1.1.1',
          status_translated: 'Online',
        },
        {
          name: 'WAN_4G',
          address: '10.64.0.1',
          status: 'none',
          loss: '0.0 %',
          delay: '41.2 ms',
          stddev: '3.1 ms',
          monitor: '8.8.8.8',
          status_translated: 'Online',
        },
      ],
      status: 'ok',
    },
    'interfaces/overview/interfaces_info': {
      rows: [
        {
          device: 'igc0',
          identifier: 'wan',
          description: 'WAN',
          status: 'up',
          enabled: true,
          addr4: '90.12.34.56/24',
        },
        {
          device: 'igc1',
          identifier: 'lan',
          description: 'LAN',
          status: 'up',
          enabled: true,
          addr4: '192.168.1.1/24',
        },
        { device: 'igc2', identifier: '', description: 'Unassigned Interface', status: 'down' },
      ],
      total: 3,
    },
    'diagnostics/traffic/interface': trafficAnswer(0),
    'diagnostics/interface/get_arp': [
      arpEntry(PHONE_MAC, '192.168.1.23', 'igc1', 'pixel-8', 'Google, Inc.'),
      arpEntry(NAS_MAC, '192.168.1.10', 'igc1', '', 'Synology Incorporated'),
      { ...arpEntry('00:0d:b9:00:00:01', '192.168.1.1', 'igc1', '', ''), permanent: true },
    ],
    'dnsmasq/leases/search': {
      rows: [
        {
          address: '192.168.1.23',
          hwaddr: PHONE_MAC,
          hostname: 'pixel-8',
          if_name: 'lan',
          if_descr: 'LAN',
          mac_info: 'Google, Inc.',
        },
        {
          address: '192.168.1.40',
          hwaddr: TV_MAC,
          hostname: 'living-room-tv',
          if_name: 'lan',
          if_descr: 'LAN',
          mac_info: 'Samsung Electronics',
        },
      ],
    },
    'wireguard/service/show': {
      rows: [
        { if: 'wg0', type: 'interface', 'public-key': 'SRVKEY', status: 'up', ifname: 'Home' },
        {
          if: 'wg0',
          type: 'peer',
          'public-key': 'PEERKEY1',
          name: 'Laptop',
          endpoint: '203.0.113.7:51820',
          'latest-handshake': Math.floor(NOW / 1000) - 60,
          'peer-status': 'online',
          ifname: 'Home',
        },
        {
          if: 'wg0',
          type: 'peer',
          'public-key': 'PEERKEY2',
          name: 'Phone',
          endpoint: '(none)',
          'latest-handshake': 0,
          'peer-status': 'offline',
          ifname: 'Home',
        },
      ],
    },
    'core/service/search': {
      rows: [
        { id: 'unbound', name: 'unbound', description: 'Unbound DNS', running: 1, locked: 0 },
        { id: 'dnsmasq', name: 'dnsmasq', description: 'Dnsmasq DNS/DHCP', running: 1, locked: 0 },
        { id: 'wireguard', name: 'wireguard', description: 'WireGuard', running: 1, locked: 0 },
      ],
    },
    'firewall/category/search_item': {
      rows: [
        { uuid: CATEGORY_UUID, name: 'Gladys', color: '' },
        { uuid: '11111111-2222-4333-8444-555555555555', name: 'Other', color: '' },
      ],
    },
    'firewall/filter/search_rule': {
      rows: [
        {
          uuid: RULE_UUID,
          enabled: '0',
          description: 'Block kids internet',
          categories: CATEGORY_UUID,
        },
        {
          uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          enabled: '1',
          description: 'Allow LAN to any',
          categories: '',
        },
        { uuid: 'lan-legacy-1', enabled: '1', description: 'Legacy', legacy: true },
      ],
    },
  };
}

/**
 * @description An ARP entry as list_arp.py writes it.
 * @param {string} mac - The MAC.
 * @param {string} ip - The IP.
 * @param {string} intf - The device.
 * @param {string} hostname - The DNS name.
 * @param {string} manufacturer - The maker.
 * @returns {object} The entry.
 */
function arpEntry(mac, ip, intf, hostname, manufacturer) {
  return {
    mac,
    ip,
    intf,
    expired: false,
    expires: 1199,
    permanent: false,
    type: 'ethernet',
    manufacturer,
    hostname,
  };
}

/**
 * @description The interface counters after `seconds` (WAN at 80/20 Mbit/s).
 * @param {number} seconds - Seconds after the start.
 * @returns {object} The traffic answer.
 */
function trafficAnswer(seconds) {
  return {
    interfaces: {
      wan: {
        'bytes received': 1e9 + seconds * 10e6,
        'bytes transmitted': 5e8 + seconds * 2.5e6,
        name: 'WAN',
      },
      lan: {
        'bytes received': 4e8 + seconds * 2.5e6,
        'bytes transmitted': 9e8 + seconds * 10e6,
        name: 'LAN',
      },
    },
    time: NOW / 1000 + seconds,
  };
}

/**
 * @description A fake OPNsense behind the `request` transport.
 * @param {object} [options] - `{ answers, statuses }`: overrides per path, and
 * HTTP statuses per path (401, 404…).
 * @returns {Function} The transport, with `calls`, `answers`, `statuses` and `posts`.
 */
function opnsense({ answers = {}, statuses = {} } = {}) {
  const state = { ...defaultAnswers(), ...answers };
  const codes = { ...statuses };
  const request = async ({ url, method, headers, body, onData }) => {
    const path = new URL(url).pathname.replace(/^\/api\//, '');
    request.calls.push({ method, path, headers, body: body ? JSON.parse(body) : undefined });
    if (codes[path] === 'ECONNREFUSED') {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    if (codes[path]) {
      return { status: codes[path], body: '' };
    }
    const key = Object.keys(state).find((candidate) => candidate === path);
    if (method === 'POST' && key === undefined) {
      return { status: 200, body: JSON.stringify(request.posts(path)) };
    }
    if (key === undefined) {
      return { status: 404, body: '' };
    }
    if (onData) {
      let stop = false;
      for (const sample of state[key]) {
        onData(`event: message\ndata: ${JSON.stringify(sample)}\n\n`, () => {
          stop = true;
        });
        if (stop) {
          break;
        }
      }
      return { status: 200, body: '' };
    }
    return { status: 200, body: JSON.stringify(state[key]) };
  };
  request.calls = [];
  request.answers = state;
  request.statuses = codes;
  // Answers of the commands, by path.
  request.posts = (path) => {
    if (path.startsWith('firewall/filter/toggle_rule/')) {
      const enabled = path.endsWith('/1');
      return { result: enabled ? 'Enabled' : 'Disabled', changed: true };
    }
    if (path.startsWith('firewall/alias_util/')) {
      return { status: 'done' };
    }
    if (path === 'wol/wol/set') {
      return { status: 'OK' };
    }
    return { status: 'ok' };
  };
  request.count = (path) => request.calls.filter((call) => call.path === path).length;
  return request;
}

// A Gladys-like object for the pure builders.
const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:opnsense:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

export {
  NOW,
  MINUTE,
  RULE_UUID,
  CATEGORY_UUID,
  PHONE_MAC,
  NAS_MAC,
  TV_MAC,
  silent,
  knownPath,
  defaultAnswers,
  arpEntry,
  trafficAnswer,
  opnsense,
  fakeGladys,
};
