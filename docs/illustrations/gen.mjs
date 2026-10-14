// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The four widgets on a made-up home network (fixed date, seeded randomness):
// a firewall with a few updates pending and its backup 4G link degraded, the
// WAN traffic of the last 24 hours, the devices connected right now, and two
// WireGuard peers. A device-bound chart reads the history Gladys keeps for
// the features: here the history is made up, the content around it is real.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildOverviewWidget, buildInternetWidget, buildNetworkWidget, buildVpnWidget } =
  await load('src/widgets.js');
const { LANGUAGES, t } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Wednesday 14 October 2026, 20:00 in Paris.
const NOW = Date.parse('2026-10-14T18:00:00Z');
const MINUTE = 60000;

// mulberry32: the same "random" history on every run.
function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// One point every 15 minutes over the last 24 hours: busier in the evening.
function history(seed, base, peak) {
  const next = random(seed);
  const points = [];
  for (let m = 24 * 60; m >= 0; m -= 15) {
    const at = NOW - m * MINUTE;
    const hour = (new Date(at).getUTCHours() + 2) % 24;
    const evening = hour >= 18 && hour <= 23 ? 1 : hour >= 8 && hour < 18 ? 0.35 : 0.05;
    const value = base + peak * evening * (0.6 + next() * 0.8);
    points.push({ t: new Date(at).toISOString(), v: Math.round(value * 10) / 10 });
  }
  return points;
}

const system = {
  hostname: 'fw.home.lan',
  version: '26.7.7',
  cpu: 7,
  memory: 38.4,
  disk: 11,
  temperature: 48,
  uptimeDays: 12.13,
  firmware: { status: 'update', updates: 4, version: '26.7.7', latest: '26.7.8', reboot: false },
};
const gateways = [
  { name: 'WAN_DHCP', status: 'online', delay: 8.4, loss: 0 },
  { name: 'WAN_4G', status: 'degraded', delay: 212.6, loss: 4 },
];
const wan = { id: 'wan', name: 'WAN', ipv4: '90.12.34.56', inMbps: 182.4, outMbps: 21.7 };
const host = (mac, name, ip, vendor, minutes, present = true) => ({
  mac,
  name,
  ip,
  iface: 'lan',
  vendor,
  present,
  lastSeen: NOW - minutes * MINUTE,
});
const hosts = [
  host('a4:83:e7:12:34:56', 'pixel-8', '192.168.1.23', 'Google, Inc.', 0),
  host('3c:2a:f4:01:02:03', 'living-room-tv', '192.168.1.40', 'Samsung Electronics', 0),
  host('00:11:32:aa:bb:cc', 'nas', '192.168.1.10', 'Synology Incorporated', 0),
  host('f0:18:98:44:55:66', 'macbook-claire', '192.168.1.31', 'Apple, Inc.', 0),
  host('b8:27:eb:77:88:99', 'gladys', '192.168.1.5', 'Raspberry Pi Foundation', 0),
  host('24:0a:c4:10:20:30', 'boiler-esp32', '192.168.1.62', 'Espressif Inc.', 0),
  host('dc:a6:32:00:00:01', 'printer', '192.168.1.70', 'Brother Industries', 0),
  host('44:65:0d:ab:cd:ef', null, '192.168.1.88', 'Amazon Technologies Inc.', 0),
  host('9c:b6:d0:11:22:33', 'iphone-tom', '192.168.1.27', 'Apple, Inc.', 95, false),
];
const peers = [
  { name: 'Laptop', iface: 'Home', online: true, handshakeAt: NOW - 1 * MINUTE },
  { name: 'Phone Claire', iface: 'Home', online: true, handshakeAt: NOW - 2 * MINUTE },
  { name: 'Phone Tom', iface: 'Home', online: false, handshakeAt: NOW - 26 * 60 * MINUTE },
];
const created = new Set(['a4:83:e7:12:34:56', '9c:b6:d0:11:22:33', 'f0:18:98:44:55:66']);
const received = history(3, 4, 260);
const sent = history(5, 1, 30);

const contents = {};
for (const language of LANGUAGES) {
  const internet = buildInternetWidget({
    gateway: gateways[0],
    iface: wan,
    language,
    pollSeconds: 30,
    interval: 'last-day',
    featureId: (key) => `ext:opnsense:interface:wan:${key}`,
  });
  // The front reads the history of a device-bound chart from Gladys, and
  // names the series after the features.
  internet.components = internet.components.map((component) =>
    component.type === 'chart'
      ? {
          ...component,
          series: [
            { name: t('featureReceived', language), points: received },
            { name: t('featureSent', language), points: sent },
          ],
        }
      : component,
  );
  contents[language] = {
    overview: buildOverviewWidget({
      system,
      gateways,
      language,
      now: NOW,
      fetchedAt: NOW - 20000,
      pollSeconds: 30,
    }),
    internet,
    network: buildNetworkWidget({ hosts, language, now: NOW, pollSeconds: 30, created }),
    vpn: buildVpnWidget({ peers, language, now: NOW, pollSeconds: 30 }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
