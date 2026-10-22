// -----------------------------------------------------------------------------
// Dashboard widgets of the OPNsense integration.
//
//   - `overview`  the firewall at a glance: CPU, memory, disk and temperature
//                 tiles, the gateways, uptime and updates, and two buttons
//                 (check for updates, reboot, with a confirmation);
//   - `internet`  one internet link: gateway status, latency, packet loss,
//                 download and upload rates, and their history once the WAN
//                 interface device exists in Gladys;
//   - `network`   the devices on the network now (or the ones gone, or the
//                 ones first met these 7 days), from the ARP table and the
//                 DHCP leases;
//   - `vpn`       the WireGuard peers and their last handshake.
//
// The contents come from the snapshots of the last reading: a widget never
// costs an OPNsense call. Every text exists in the four languages (the
// content is cached per language and units). Content budget of a card: 8
// components, 1 main one (chart or card-list), 6 tiles, 2 texts, 1 status,
// 4 buttons.
// -----------------------------------------------------------------------------

import { t, formatNumber, ago } from './i18n.js';
import { hostName } from './device.js';
import { firmwareSummary } from './events.js';

const WIDGETS = { OVERVIEW: 'overview', INTERNET: 'internet', NETWORK: 'network', VPN: 'vpn' };
const WIDGET_ACTIONS = { CHECK_UPDATES: 'check_updates', REBOOT: 'reboot' };

const CHART_INTERVALS = [
  'last-hour',
  'last-twelve-hours',
  'last-day',
  'last-three-days',
  'last-week',
];
const DEFAULT_INTERVAL = 'last-day';
const NETWORK_SHOW = ['present', 'absent', 'all', 'new'];
const DEFAULT_SHOW = 'present';
const MAX_LIST_ITEMS = 8;
const MAX_GATEWAY_ROWS = 6;
const TTL = { min: 10, max: 3600, message: 60 };

const GATEWAY_COLORS = {
  online: 'success',
  degraded: 'warning',
  offline: 'danger',
  pending: 'neutral',
};

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long title', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 * @example
 * messageContent('OPNsense has not been read yet');
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

const ttlOf = (pollSeconds) => Math.min(TTL.max, Math.max(TTL.min, Math.round(pollSeconds)));

/**
 * @description A tile color for a load in %.
 * @param {number|null} value - The load.
 * @returns {string} The color.
 */
function loadColor(value) {
  if (typeof value !== 'number') {
    return 'neutral';
  }
  if (value >= 90) {
    return 'danger';
  }
  return value >= 75 ? 'warning' : 'success';
}

/**
 * @description "12 d 4 h" out of days.
 * @param {number|null} days - The uptime.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function formatUptime(days, language) {
  if (typeof days !== 'number') {
    return '?';
  }
  const hours = Math.floor((days * 24) % 24);
  return t('uptimeValue', language, { days: Math.floor(days), hours });
}

/**
 * @description The `overview` widget.
 * @param {object} options - Options.
 * @param {object} options.system - The firewall snapshot (readSystem).
 * @param {Array<object>} options.gateways - The gateway snapshots.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.fetchedAt - Time of the reading, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @returns {object} The content.
 * @example
 * buildOverviewWidget({ system, gateways, language: 'fr', now, fetchedAt, pollSeconds: 30 });
 */
function buildOverviewWidget({ system, gateways, language, now, fetchedAt, pollSeconds }) {
  const name = (system.hostname ?? '').split('.')[0] || 'OPNsense';
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(
        t('overviewCaption', language, {
          name,
          version: system.version ?? '?',
          ago: ago(fetchedAt, now, language),
        }),
        80,
      ),
    },
  ];
  // An unknown load is no gauge at all rather than a misleading 0 %.
  const gauges = [
    [system.cpu, 'tileCpu', 'cpu'],
    [system.memory, 'tileMemory', 'layers'],
    [system.disk, 'tileDisk', 'hard-drive'],
  ].filter(([value]) => typeof value === 'number');
  gauges.forEach(([value, label, icon]) =>
    components.push({
      type: 'gauge',
      value,
      min: 0,
      max: 100,
      unit: '%',
      label: t(label, language),
      icon,
      color: loadColor(value),
    }),
  );
  if (typeof system.temperature === 'number') {
    components.push({
      type: 'value',
      value: formatNumber(system.temperature, language, 0),
      unit: '°C',
      label: t('tileTemperature', language),
      icon: 'thermometer',
      color: system.temperature >= 80 ? 'danger' : system.temperature >= 65 ? 'warning' : 'info',
    });
  }

  const rows = gateways.slice(0, MAX_GATEWAY_ROWS).map((gateway) => ({
    label: clip(gateway.name, 40),
    value: clip(gatewayValue(gateway, language), 40),
    icon: 'globe',
    color: GATEWAY_COLORS[gateway.status] ?? 'neutral',
  }));
  rows.push({
    label: t('rowUptime', language),
    value: clip(formatUptime(system.uptimeDays, language), 40),
    icon: 'clock',
  });
  const firmware = system.firmware;
  rows.push({
    label: t('rowUpdates', language),
    value: clip(updatesValue(firmware, language), 40),
    icon: 'download',
    color: firmware?.updates > 0 ? 'warning' : firmware?.updates === 0 ? 'success' : 'neutral',
  });
  components.push({ type: 'status', items: rows });

  components.push(
    {
      type: 'button',
      label: t('buttonCheckUpdates', language),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.CHECK_UPDATES },
    },
    {
      type: 'button',
      label: t('buttonReboot', language),
      icon: 'power',
      style: 'danger',
      action: { key: WIDGET_ACTIONS.REBOOT, confirm: true },
    },
  );
  return { ttl_seconds: ttlOf(pollSeconds), components };
}

/**
 * @description "Online · 12.4 ms" for a gateway.
 * @param {object} gateway - The gateway snapshot.
 * @param {string} language - The language.
 * @returns {string} The value.
 */
function gatewayValue(gateway, language) {
  const status = t(`gateway_${gateway.status}`, language);
  if (gateway.status === 'offline' || typeof gateway.delay !== 'number') {
    return status;
  }
  return `${status} · ${formatNumber(gateway.delay, language, 1)} ms`;
}

/**
 * @description The short firmware state of a status row.
 * @param {object|null} firmware - readFirmware.
 * @param {string} language - The language.
 * @returns {string} The value.
 */
function updatesValue(firmware, language) {
  if (!firmware || firmware.updates === null) {
    return t('updatesUnchecked', language);
  }
  if (firmware.updates === 0) {
    return t('updatesNone', language);
  }
  return t('updatesCount', language, { count: firmware.updates });
}

/**
 * @description The settings of the `internet` widget.
 * @param {object} [settings] - The raw settings.
 * @returns {{ gateway: string|null, iface: string|null, interval: string }} The settings.
 */
function readInternetSettings(settings = {}) {
  return {
    gateway: typeof settings.gateway === 'string' && settings.gateway ? settings.gateway : null,
    iface: typeof settings.interface === 'string' && settings.interface ? settings.interface : null,
    interval: CHART_INTERVALS.includes(settings.interval) ? settings.interval : DEFAULT_INTERVAL,
  };
}

/**
 * @description The `internet` widget.
 * @param {object} options - Options.
 * @param {object|null} options.gateway - The gateway snapshot.
 * @param {object|null} options.iface - The interface snapshot (the WAN).
 * @param {string} options.language - The user language.
 * @param {number} options.pollSeconds - The reading interval.
 * @param {string} [options.interval] - The chart period.
 * @param {Function|null} [options.featureId] - `(key) => external id` of the
 * interface features, null when its device is not created (no chart then:
 * the core has no history of it).
 * @returns {object} The content.
 */
function buildInternetWidget({
  gateway,
  iface,
  language,
  pollSeconds,
  interval = DEFAULT_INTERVAL,
  featureId = null,
}) {
  const components = [];
  const caption = [
    iface && t('internetCaption', language, { name: iface.name, ip: iface.ipv4 ?? '?' }),
  ].filter(Boolean);
  if (caption.length > 0) {
    components.push({ type: 'text', variant: 'caption', text: clip(caption[0], 80) });
  }
  if (gateway) {
    components.push(
      {
        type: 'value',
        value: typeof gateway.delay === 'number' ? formatNumber(gateway.delay, language, 1) : '–',
        unit: 'ms',
        label: t('tileLatency', language),
        icon: 'activity',
        color: GATEWAY_COLORS[gateway.status] ?? 'neutral',
      },
      {
        type: 'value',
        value: typeof gateway.loss === 'number' ? formatNumber(gateway.loss, language, 1) : '–',
        unit: '%',
        label: t('tileLoss', language),
        icon: 'alert-triangle',
        color: gateway.loss > 0 ? 'warning' : 'success',
      },
    );
  }
  if (iface) {
    components.push(
      {
        type: 'value',
        value: typeof iface.inMbps === 'number' ? formatNumber(iface.inMbps, language, 1) : '–',
        unit: 'Mbit/s',
        label: t('tileDownload', language),
        icon: 'download',
        color: 'info',
      },
      {
        type: 'value',
        value: typeof iface.outMbps === 'number' ? formatNumber(iface.outMbps, language, 1) : '–',
        unit: 'Mbit/s',
        label: t('tileUpload', language),
        icon: 'upload',
        color: 'primary',
      },
    );
    if (featureId) {
      components.push({
        type: 'chart',
        device_features: [featureId('received'), featureId('sent')],
        interval,
        chart_type: 'area',
        title: t('chartTraffic', language),
        unit: 'Mbit/s',
      });
    }
  }
  if (gateway) {
    components.push({
      type: 'status',
      items: [
        {
          label: clip(gateway.name, 40),
          value: t(`gateway_${gateway.status}`, language),
          icon: 'globe',
          color: GATEWAY_COLORS[gateway.status] ?? 'neutral',
        },
      ],
    });
  }
  if (components.length === 0) {
    return messageContent(t('noWan', language));
  }
  return { ttl_seconds: ttlOf(pollSeconds), components };
}

/**
 * @description The hosts of the `network` widget, but the new ones.
 * @param {Array<object>} hosts - The host snapshots.
 * @param {string} show - present, absent or all.
 * @param {string} language - The user language.
 * @returns {Array<object>} The hosts to list.
 */
const listHosts = (hosts, show, language) =>
  hosts
    .filter((host) => (show === 'all' ? true : show === 'present' ? host.present : !host.present))
    .filter((host) => show !== 'absent' || host.lastSeen)
    .sort((a, b) => {
      if (show === 'absent') {
        return (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
      }
      if (Boolean(a.name) !== Boolean(b.name)) {
        return a.name ? -1 : 1;
      }
      return hostName(a).localeCompare(hostName(b), language);
    });

/**
 * @description The settings of the `network` widget.
 * @param {object} [settings] - The raw settings.
 * @returns {{ show: string }} The settings.
 */
const readNetworkSettings = (settings = {}) => ({
  show: NETWORK_SHOW.includes(settings.show) ? settings.show : DEFAULT_SHOW,
});

/**
 * @description The hosts first met recently, newest first. An address met
 * before a restart and not read since has only its MAC.
 * @param {Array<object>} hosts - The host snapshots.
 * @param {Array<{ mac: string, firstSeen: number }>} recent - The new MACs.
 * @returns {Array<object>} The hosts, with their `firstSeen`.
 */
const newHosts = (hosts, recent) => {
  const byMac = new Map(hosts.map((host) => [host.mac, host]));
  return recent.map(({ mac, firstSeen }) => ({
    ...(byMac.get(mac) ?? { mac, name: null, ip: null, vendor: null, present: false }),
    firstSeen,
  }));
};

/**
 * @description The `network` widget: hosts with a name first, then by name;
 * the new ones newest first.
 * @param {object} options - Options.
 * @param {Array<object>} options.hosts - The host snapshots.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @param {string} [options.show] - present, absent, all or new.
 * @param {Set<string>} [options.created] - MACs of the hosts created in Gladys.
 * @param {Array<{ mac: string, firstSeen: number }>} [options.recent] - The MACs
 *   first met these 7 days (store.js), newest first.
 * @returns {object} The content.
 */
function buildNetworkWidget({
  hosts,
  language,
  now,
  pollSeconds,
  show = DEFAULT_SHOW,
  created = new Set(),
  recent = [],
}) {
  const present = hosts.filter((host) => host.present);
  const listed = show === 'new' ? newHosts(hosts, recent) : listHosts(hosts, show, language);
  const caption =
    show === 'new'
      ? t('networkCaptionNew', language, { count: listed.length, present: present.length })
      : t('networkCaption', language, { present: present.length, total: hosts.length });
  if (listed.length === 0) {
    return {
      ttl_seconds: ttlOf(pollSeconds),
      components: [
        { type: 'text', variant: 'caption', text: clip(caption, 80) },
        { type: 'text', variant: 'body', text: t(`networkEmpty_${show}`, language) },
      ],
    };
  }
  const extra = listed.length - MAX_LIST_ITEMS;
  return {
    ttl_seconds: ttlOf(pollSeconds),
    components: [
      {
        type: 'text',
        variant: 'caption',
        text: clip(
          extra > 0 ? `${caption} · ${t('networkMore', language, { count: extra })}` : caption,
          80,
        ),
      },
      {
        type: 'card-list',
        display: 'list',
        items: listed.slice(0, MAX_LIST_ITEMS).map((host) => ({
          title: clip(hostName(host), 60),
          // The IP first: the line is cut to one line by the front.
          subtitle: clip(
            [
              host.ip,
              host.firstSeen
                ? t('firstSeen', language, { ago: ago(host.firstSeen, now, language) })
                : host.present
                  ? host.vendor
                  : host.lastSeen && ago(host.lastSeen, now, language),
            ]
              .filter(Boolean)
              .join(' · '),
            60,
          ),
          badge: host.present
            ? {
                text: clip((host.iface ?? t('badgeHere', language)).toUpperCase(), 16),
                color: created.has(host.mac) ? 'success' : 'info',
              }
            : { text: clip(t('badgeGone', language), 16), color: 'neutral' },
        })),
      },
    ],
  };
}

/**
 * @description The `vpn` widget: connected peers first.
 * @param {object} options - Options.
 * @param {Array<object>} options.peers - The peer snapshots.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @returns {object} The content.
 */
function buildVpnWidget({ peers, language, now, pollSeconds }) {
  if (peers.length === 0) {
    return messageContent(t('noPeers', language), ttlOf(pollSeconds));
  }
  const online = peers.filter((peer) => peer.online).length;
  const sorted = [...peers].sort(
    (a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, language),
  );
  return {
    ttl_seconds: ttlOf(pollSeconds),
    components: [
      {
        type: 'value',
        value: `${online}/${peers.length}`,
        label: t('tilePeersOnline', language),
        icon: 'shield',
        color: online > 0 ? 'success' : 'neutral',
      },
      {
        type: 'card-list',
        display: 'list',
        items: sorted.slice(0, MAX_LIST_ITEMS).map((peer) => ({
          title: clip(peer.name, 60),
          subtitle: clip(
            [
              peer.handshakeAt
                ? t('handshake', language, { ago: ago(peer.handshakeAt, now, language) })
                : t('noHandshake', language),
              peer.iface,
            ]
              .filter(Boolean)
              .join(' · '),
            60,
          ),
          badge: {
            text: clip(t(peer.online ? 'peerOnline' : 'peerOffline', language), 16),
            color: peer.online ? 'success' : 'neutral',
          },
        })),
      },
    ],
  };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  CHART_INTERVALS,
  DEFAULT_INTERVAL,
  NETWORK_SHOW,
  clip,
  messageContent,
  formatUptime,
  firmwareSummary,
  readInternetSettings,
  readNetworkSettings,
  buildOverviewWidget,
  buildInternetWidget,
  buildNetworkWidget,
  buildVpnWidget,
};
