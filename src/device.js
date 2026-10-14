// -----------------------------------------------------------------------------
// The devices of the OPNsense integration, offered on the Discovery screen.
//
// Category / type pairs come from DEVICE_FEATURE_CATEGORIES of the SDK, with
// an icon and a unit list in the Gladys front (front/src/utils/consts.js,
// server/utils/constants.js, master of 2026-10-14). Gladys has no CPU, memory
// nor disk category: `level-sensor` / `decimal` in % is its plain numeric
// level, the name of each feature tells them apart.
//
// One firewall, "OPNsense <hostname>":
//   - cpu, memory, disk     level-sensor / decimal, %
//   - temperature           device-temperature-sensor / decimal, °C (when the
//                           firewall has a sensor)
//   - uptime                duration / decimal, days
//   - updates               counter-sensor / integer: pending updates of the
//                           last firmware check
//   - version               text / text
//   - vpn_peers             counter-sensor / integer: WireGuard peers online
//                           (when WireGuard has peers)
// One device per gateway, "Gateway <name>":
//   - status                text / text (online, offline, degraded, pending)
//   - delay                 duration / decimal, ms
//   - loss                  level-sensor / decimal, %
// One device per assigned interface, "Interface <description>":
//   - received, sent        datarate / rate, Mbit/s (seen from the interface:
//                           on the WAN, received is the download)
//   - status                text / text (up, down, no carrier)
//   - ipv4                  text / text
// One device per firewall rule of the configured category, "Rule <description>":
//   - enabled               switch / binary, a command
// One device per host of the network, "<host name>":
//   - presence              presence-sensor / push, as the Bluetooth presence
//                           of Gladys: 1 while it answers, 0 once it left
//
// External ids: the firewall is "main" (one per integration), a gateway its
// name, an interface its OPNsense identifier (wan, lan, opt1), a rule its
// UUID, a host its MAC address without separators. Never a description.
//
// OPNsense is read on the integration's own timer (one round for all
// devices), so `should_poll` is false.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';

const DEVICE_TYPES = {
  FIREWALL: 'firewall',
  GATEWAY: 'gateway',
  INTERFACE: 'interface',
  RULE: 'rule',
  HOST: 'host',
};
const FIREWALL_ID = 'main';
// Fastest link a firewall carries (100 Gbit/s), in Mbit/s.
const MAX_RATE_MBPS = 100000;

const sensor = { read_only: true, has_feedback: false, keep_history: true };
const text = {
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  min: 0,
  max: 0,
};
const percent = {
  ...sensor,
  category: CATEGORIES.LEVEL_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  unit: UNITS.PERCENT,
  min: 0,
  max: 100,
};
const rate = {
  ...sensor,
  category: CATEGORIES.DATARATE,
  type: TYPES.DATARATE.RATE,
  unit: UNITS.MEGABITS_PER_SECOND,
  min: 0,
  max: MAX_RATE_MBPS,
};

// The features of each device: key, name (TEXTS key), shape, and the state
// of a snapshot (a number, `{ text }`, or null when unknown: not published).
const FIREWALL_FEATURES = [
  { key: 'cpu', name: 'featureCpu', shape: percent, state: (s) => s.cpu },
  { key: 'memory', name: 'featureMemory', shape: percent, state: (s) => s.memory },
  { key: 'disk', name: 'featureDisk', shape: percent, state: (s) => s.disk },
  {
    key: 'temperature',
    name: 'featureTemperature',
    optional: 'temperature',
    shape: {
      ...sensor,
      category: CATEGORIES.DEVICE_TEMPERATURE_SENSOR,
      type: TYPES.SENSOR.DECIMAL,
      unit: UNITS.CELSIUS,
      min: 0,
      max: 120,
    },
    state: (s) => s.temperature,
  },
  {
    key: 'uptime',
    name: 'featureUptime',
    shape: {
      ...sensor,
      category: CATEGORIES.DURATION,
      type: TYPES.DURATION.DECIMAL,
      unit: UNITS.DAYS,
      min: 0,
      max: 10000,
    },
    state: (s) => s.uptimeDays,
  },
  {
    key: 'updates',
    name: 'featureUpdates',
    shape: {
      ...sensor,
      category: CATEGORIES.COUNTER_SENSOR,
      type: TYPES.SENSOR.INTEGER,
      min: 0,
      max: 10000,
    },
    state: (s) => s.firmware?.updates ?? null,
  },
  {
    key: 'version',
    name: 'featureVersion',
    shape: text,
    state: (s) => (s.version ? { text: s.version } : null),
  },
  {
    key: 'vpn_peers',
    name: 'featureVpnPeers',
    optional: 'wireguard',
    shape: {
      ...sensor,
      category: CATEGORIES.COUNTER_SENSOR,
      type: TYPES.SENSOR.INTEGER,
      min: 0,
      max: 10000,
    },
    state: (s) => s.vpnPeers ?? null,
  },
];

const GATEWAY_FEATURES = [
  {
    key: 'status',
    name: 'featureGatewayStatus',
    shape: text,
    state: (g, language) => ({ text: t(`gateway_${g.status}`, language) }),
  },
  {
    key: 'delay',
    name: 'featureDelay',
    shape: {
      ...sensor,
      category: CATEGORIES.DURATION,
      type: TYPES.DURATION.DECIMAL,
      unit: UNITS.MILLISECONDS,
      min: 0,
      max: 10000,
    },
    state: (g) => g.delay,
  },
  { key: 'loss', name: 'featureLoss', shape: percent, state: (g) => g.loss },
];

const LINK_STATUSES = ['up', 'down', 'no carrier'];

const INTERFACE_FEATURES = [
  { key: 'received', name: 'featureReceived', shape: rate, state: (i) => i.inMbps },
  { key: 'sent', name: 'featureSent', shape: rate, state: (i) => i.outMbps },
  {
    key: 'status',
    name: 'featureLink',
    shape: text,
    state: (i, language) =>
      i.status
        ? {
            text: LINK_STATUSES.includes(i.status)
              ? t(`link_${i.status.replace(' ', '_')}`, language)
              : i.status,
          }
        : null,
  },
  {
    key: 'ipv4',
    name: 'featureIpv4',
    shape: text,
    state: (i) => (i.ipv4 ? { text: i.ipv4 } : null),
  },
];

/**
 * @description The external ids of a device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - A DEVICE_TYPES value.
 * @param {string} id - The platform id (see macId for a host).
 * @returns {{ device: string, feature: Function }} The ids.
 * @example
 * idsOf(gladys, 'gateway', 'WAN_DHCP').device; // -> 'ext:opnsense:gateway:WAN_DHCP'
 */
function idsOf(gladys, type, id) {
  return gladys.externalIds(type, id);
}

/**
 * @description The platform id of a host: its MAC address without separators.
 * @param {string} mac - 'aa:bb:cc:dd:ee:ff'.
 * @returns {string} 'aabbccddeeff'.
 */
const macId = (mac) => mac.replace(/:/g, '');

/**
 * @description The MAC address of a host id.
 * @param {string} id - 'aabbccddeeff'.
 * @returns {string} 'aa:bb:cc:dd:ee:ff'.
 */
const macOf = (id) => id.match(/../g).join(':');

const ID_PATTERNS = {
  [DEVICE_TYPES.FIREWALL]: '[a-z]+',
  [DEVICE_TYPES.GATEWAY]: '[A-Za-z0-9_.-]+',
  [DEVICE_TYPES.INTERFACE]: '[a-z0-9_]+',
  [DEVICE_TYPES.RULE]: '[0-9a-f-]{36}',
  [DEVICE_TYPES.HOST]: '[0-9a-f]{12}',
};

/**
 * @description The platform id a device (or feature) external id stands for.
 * @param {unknown} externalId - The external id.
 * @param {string} type - A DEVICE_TYPES value.
 * @returns {string|null} The id.
 * @example
 * idFromExternalId('ext:opnsense:host:aabbccddeeff:presence', 'host'); // -> 'aabbccddeeff'
 */
function idFromExternalId(externalId, type) {
  const match = new RegExp(`:${type}:(${ID_PATTERNS[type]})(?::[a-z0-9_]+)?$`).exec(
    String(externalId ?? ''),
  );
  return match ? match[1] : null;
}

/**
 * @description A feature of a spec.
 * @param {object} ids - The ids of the device.
 * @param {object} spec - The feature spec.
 * @param {string} language - Language of the name.
 * @returns {object} The feature.
 */
const featureOf = (ids, spec, language) => ({
  name: t(spec.name, language),
  external_id: ids.feature(spec.key),
  ...spec.shape,
});

/**
 * @description The states of a list of specs.
 * @param {object} ids - The ids of the device.
 * @param {Array<object>} specs - The feature specs.
 * @param {object} snapshot - The snapshot.
 * @param {string} language - Language of the texts.
 * @returns {Array<object>} The states.
 */
function statesOf(ids, specs, snapshot, language) {
  return specs.flatMap((spec) => {
    const value = spec.state(snapshot, language);
    if (value === null || value === undefined) {
      return [];
    }
    const id = ids.feature(spec.key);
    return [
      typeof value === 'object'
        ? { device_feature_external_id: id, text: value.text }
        : { device_feature_external_id: id, state: value },
    ];
  });
}

/**
 * @description The features of the firewall, given what it has.
 * @param {{ temperature: boolean, wireguard: boolean }} has - The optional parts.
 * @returns {Array<object>} The specs.
 */
const firewallSpecs = (has = {}) =>
  FIREWALL_FEATURES.filter((spec) => !spec.optional || has[spec.optional]);

/**
 * @description The firewall device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} system - The system snapshot (readSystem).
 * @param {{ temperature: boolean, wireguard: boolean }} has - The optional parts.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 * @example
 * buildFirewallDevice(gladys, { hostname: 'fw.home.lan' }, { temperature: true }, 'fr');
 */
function buildFirewallDevice(gladys, system, has, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.FIREWALL, FIREWALL_ID);
  return {
    name: t('firewallDeviceName', language, {
      name: (system?.hostname ?? '').split('.')[0] || 'OPNsense',
    }),
    external_id: ids.device,
    model: 'OPNsense',
    should_poll: false,
    params: system?.version ? [{ name: 'OPNSENSE_VERSION', value: system.version }] : [],
    features: firewallSpecs(has).map((spec) => featureOf(ids, spec, language)),
  };
}

/**
 * @description The states of the firewall.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} system - The system snapshot, with `vpnPeers`.
 * @param {string} language - Language of the texts.
 * @returns {Array<object>} The states.
 */
function buildFirewallStates(gladys, system, language) {
  return statesOf(
    idsOf(gladys, DEVICE_TYPES.FIREWALL, FIREWALL_ID),
    FIREWALL_FEATURES,
    system,
    language,
  );
}

/**
 * @description The device of a gateway.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} gateway - The gateway snapshot (readGateways).
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildGatewayDevice(gladys, gateway, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.GATEWAY, gateway.name);
  return {
    name: t('gatewayDeviceName', language, { name: gateway.name }),
    external_id: ids.device,
    model: 'OPNsense',
    should_poll: false,
    params: [{ name: 'OPNSENSE_GATEWAY', value: gateway.name }],
    features: GATEWAY_FEATURES.map((spec) => featureOf(ids, spec, language)),
  };
}

const buildGatewayStates = (gladys, gateway, language) =>
  statesOf(idsOf(gladys, DEVICE_TYPES.GATEWAY, gateway.name), GATEWAY_FEATURES, gateway, language);

/**
 * @description The device of an interface.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} iface - The interface snapshot (readInterfaces).
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildInterfaceDevice(gladys, iface, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.INTERFACE, iface.id);
  return {
    name: t('interfaceDeviceName', language, { name: iface.name }),
    external_id: ids.device,
    model: 'OPNsense',
    should_poll: false,
    params: [{ name: 'OPNSENSE_INTERFACE', value: iface.id }],
    features: INTERFACE_FEATURES.map((spec) => featureOf(ids, spec, language)),
  };
}

const buildInterfaceStates = (gladys, iface, language) =>
  statesOf(idsOf(gladys, DEVICE_TYPES.INTERFACE, iface.id), INTERFACE_FEATURES, iface, language);

/**
 * @description The device of a firewall rule.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} rule - The rule snapshot (readRules).
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildRuleDevice(gladys, rule, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.RULE, rule.uuid);
  return {
    name: t('ruleDeviceName', language, { name: rule.name }),
    external_id: ids.device,
    model: 'OPNsense',
    should_poll: false,
    params: [{ name: 'OPNSENSE_RULE', value: rule.uuid }],
    features: [
      {
        name: t('featureRuleEnabled', language),
        external_id: ids.feature('enabled'),
        category: CATEGORIES.SWITCH,
        type: TYPES.SWITCH.BINARY,
        read_only: false,
        has_feedback: true,
        keep_history: true,
        min: 0,
        max: 1,
      },
    ],
  };
}

const buildRuleStates = (gladys, rule) => [
  {
    device_feature_external_id: idsOf(gladys, DEVICE_TYPES.RULE, rule.uuid).feature('enabled'),
    state: rule.enabled ? 1 : 0,
  },
];

/**
 * @description The name of a host: its DHCP or DNS name, else its maker and MAC.
 * @param {object} host - The host snapshot.
 * @returns {string} The name.
 */
function hostName(host) {
  if (host.name) {
    return host.name;
  }
  const vendor = host.vendor ? String(host.vendor).split(/[\s,]/)[0] : null;
  return vendor ? `${vendor} ${host.mac}` : host.mac;
}

/**
 * @description The device of a host of the network.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} host - The host snapshot (readHosts).
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildHostDevice(gladys, host, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.HOST, macId(host.mac));
  return {
    name: hostName(host),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'MAC', value: host.mac },
      ...(host.vendor ? [{ name: 'VENDOR', value: String(host.vendor).slice(0, 100) }] : []),
    ],
    features: [
      {
        name: t('featurePresence', language),
        external_id: ids.feature('presence'),
        category: CATEGORIES.PRESENCE_SENSOR,
        type: TYPES.SENSOR.PUSH,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 1,
      },
    ],
  };
}

const presenceFeatureId = (gladys, mac) =>
  idsOf(gladys, DEVICE_TYPES.HOST, macId(mac)).feature('presence');

export {
  DEVICE_TYPES,
  FIREWALL_ID,
  FIREWALL_FEATURES,
  GATEWAY_FEATURES,
  INTERFACE_FEATURES,
  idsOf,
  macId,
  macOf,
  idFromExternalId,
  hostName,
  firewallSpecs,
  buildFirewallDevice,
  buildFirewallStates,
  buildGatewayDevice,
  buildGatewayStates,
  buildInterfaceDevice,
  buildInterfaceStates,
  buildRuleDevice,
  buildRuleStates,
  buildHostDevice,
  presenceFeatureId,
};
