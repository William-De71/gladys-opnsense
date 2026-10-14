// -----------------------------------------------------------------------------
// OPNsense answers -> plain snapshots. Pure functions, no I/O.
//
// Shapes read here come from the controllers and configd scripts of
// opnsense/core (master of 2026-10, OPNsense 26.7):
//   diagnostics/system/*        SystemController (uptime as "3 days, 04:05:06")
//   diagnostics/cpu_usage       scripts/system/cpu.py ({ total, user, ... })
//   core/firmware/status        FirmwareController::statusAction
//   routes/gateway/status       scripts/routes/gateway_status.php
//   interfaces/overview         OverviewController::interfacesInfoAction
//   diagnostics/traffic         scripts/interfaces/traffic_stats.php (counters)
//   diagnostics/interface/arp   scripts/interfaces/list_arp.py
//   dnsmasq|kea leases          LeasesController (rows of a search grid)
//   wireguard/service/show      ServiceController::showAction
//   core/service/search         ServiceController::searchAction
//   firewall/filter/search_rule FilterController (MVC and legacy rules)
//
// Unknown values are null, never 0: a missing reading is not published.
// -----------------------------------------------------------------------------

const rowsOf = (answer) =>
  Array.isArray(answer) ? answer : Array.isArray(answer?.rows) ? answer.rows : [];

/**
 * @description A finite number out of "1.2 ms", "0.0 %", 42 or "~".
 * @param {unknown} raw - The raw value.
 * @returns {number|null} The number.
 * @example
 * toNumber('12.5 ms'); // -> 12.5
 */
function toNumber(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const match = /-?\d+(?:\.\d+)?/.exec(raw);
  return match ? Number(match[0]) : null;
}

const round = (value, digits) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * @description A MAC address, lower case, colon separated; null if it is not one.
 * @param {unknown} raw - The raw address.
 * @returns {string|null} The MAC.
 * @example
 * normalizeMac('AA-BB-CC-00-11-22'); // -> 'aa:bb:cc:00:11:22'
 */
function normalizeMac(raw) {
  const hex = String(raw ?? '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  return hex.length === 12 ? hex.match(/../g).join(':') : null;
}

/**
 * @description Uptime in days out of "12 days, 03:04:05" or "03:04:05" (the
 * word is translated by OPNsense: only the numbers count).
 * @param {unknown} raw - The uptime text.
 * @returns {number|null} The days, 2 decimals.
 * @example
 * parseUptime('1 day, 12:00:00'); // -> 1.5
 */
function parseUptime(raw) {
  const match = /^(?:(\d+)\D+?)?(\d+):(\d{2}):(\d{2})\s*$/.exec(String(raw ?? '').trim());
  if (!match) {
    return null;
  }
  const [, days = '0', hours, minutes, seconds] = match;
  const total =
    Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return round(total / 86400, 2);
}

/**
 * @description The version out of "OPNsense 26.7.7-amd64" (or "26.7.7_2-amd64").
 * @param {unknown} raw - The first line of `versions`.
 * @returns {string|null} The version.
 */
function parseVersion(raw) {
  const match = /(\d+\.\d+(?:\.\d+)?(?:_\d+)?)/.exec(String(raw ?? ''));
  return match ? match[1] : null;
}

/**
 * @description The temperature of the firewall: the hottest CPU sensor, or the
 * hottest sensor when no CPU one exists.
 * @param {unknown} answer - The system_temperature answer.
 * @returns {number|null} °C, 1 decimal.
 */
function readTemperature(answer) {
  const sensors = rowsOf(answer)
    .map((sensor) => ({ type: sensor?.type, value: toNumber(sensor?.temperature) }))
    .filter((sensor) => sensor.value !== null && sensor.value > -50 && sensor.value < 150);
  const cpu = sensors.filter((sensor) => sensor.type === 'cpu' || sensor.type === 'amd');
  const candidates = cpu.length > 0 ? cpu : sensors;
  return candidates.length > 0
    ? round(Math.max(...candidates.map((sensor) => sensor.value)), 1)
    : null;
}

/**
 * @description The firmware state of the last check.
 * @param {unknown} answer - The core/firmware/status answer.
 * @returns {{ status: string|null, updates: number|null, version: string|null, latest: string|null, reboot: boolean }}
 * `status` is none, update, upgrade, error, or null when never checked.
 */
function readFirmware(answer) {
  const product = answer?.product ?? {};
  const version = parseVersion(product.product_version);
  const latest = parseVersion(product.product_latest) ?? null;
  const status = typeof answer?.status === 'string' ? answer.status : null;
  const checked = Boolean(product.product_check) || ['update', 'upgrade'].includes(status);
  let updates = null;
  if (status === 'update') {
    updates = Object.keys(answer.all_packages ?? {}).length;
  } else if (status === 'upgrade') {
    updates = Object.keys(answer.all_sets ?? {}).length;
  } else if (status === 'none' && checked) {
    updates = 0;
  }
  return {
    status: checked ? status : null,
    updates,
    version,
    latest,
    reboot: answer?.status_reboot === '1',
  };
}

/**
 * @description The firewall snapshot.
 * @param {object} raw - The answers: `{ information, time, resources, disk,
 * temperature, cpu, firmware }`, each possibly undefined (failed read).
 * @returns {object} `{ hostname, version, cpu, memory, disk, temperature,
 * uptimeDays, load, firmware }`.
 */
function readSystem({ information, time, resources, disk, temperature, cpu, firmware } = {}) {
  const memory = resources?.memory ?? {};
  const total = toNumber(memory.total);
  const used = toNumber(memory.used);
  const root = rowsOf(disk?.devices).find((device) => device?.mountpoint === '/');
  const load = String(time?.loadavg ?? '').split(',');
  const cpuTotal = toNumber(cpu?.total);
  const firmwareState = firmware ? readFirmware(firmware) : null;
  return {
    hostname: typeof information?.name === 'string' ? information.name : null,
    version:
      parseVersion(Array.isArray(information?.versions) ? information.versions[0] : null) ??
      firmwareState?.version ??
      null,
    cpu: cpuTotal === null ? null : round(Math.min(100, Math.max(0, cpuTotal)), 1),
    memory: total && used !== null ? round((used / total) * 100, 1) : null,
    disk: root ? round(toNumber(root.used_pct), 1) : null,
    temperature: temperature === undefined ? null : readTemperature(temperature),
    uptimeDays: parseUptime(time?.uptime),
    load: load.length === 3 ? round(toNumber(load[0]), 2) : null,
    firmware: firmwareState,
  };
}

/**
 * @description The status of a gateway, out of the dpinger status.
 * @param {string} raw - none, down, force_down, delay, loss, delay+loss, ...
 * @returns {string} online, offline, degraded or pending.
 */
function gatewayStatus(raw) {
  switch (raw) {
    case 'none':
      return 'online';
    case 'down':
    case 'force_down':
      return 'offline';
    case 'delay':
    case 'loss':
    case 'delay+loss':
      return 'degraded';
    default:
      return 'pending';
  }
}

/**
 * @description The gateways.
 * @param {unknown} answer - The routes/gateway/status answer.
 * @returns {Array<object>} `{ name, address, status, delay, loss, monitor }`.
 */
function readGateways(answer) {
  return rowsOf(answer?.items)
    .filter((item) => typeof item?.name === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(item.name))
    .map((item) => ({
      name: item.name,
      address: item.address && item.address !== '~' ? String(item.address) : null,
      status: gatewayStatus(item.status),
      delay: round(toNumber(item.delay), 1),
      loss: round(toNumber(item.loss), 1),
      monitor: item.monitor && item.monitor !== '~' ? String(item.monitor) : null,
    }));
}

/**
 * @description The assigned interfaces, with their rates since the previous reading.
 * @param {unknown} info - The interfaces/overview/interfaces_info answer.
 * @param {unknown} traffic - The diagnostics/traffic/interface answer.
 * @param {Map<string, object>} [previous] - The previous snapshots, by identifier.
 * @returns {Array<object>} `{ id, name, device, status, ipv4, counters, at, inMbps, outMbps }`.
 */
function readInterfaces(info, traffic, previous = new Map()) {
  const at = toNumber(traffic?.time);
  const counters = traffic?.interfaces ?? {};
  return rowsOf(info)
    .filter((row) => typeof row?.identifier === 'string' && /^[a-z0-9_]+$/.test(row.identifier))
    .filter((row) => row.enabled !== false)
    .map((row) => {
      const id = row.identifier;
      const raw = counters[id] ?? {};
      const inBytes = toNumber(raw['bytes received']);
      const outBytes = toNumber(raw['bytes transmitted']);
      const before = previous.get(id);
      const rate = (now, then) => {
        const seconds = at !== null && before?.at != null ? at - before.at : null;
        if (now === null || then == null || !seconds || seconds <= 0 || now < then) {
          return null;
        }
        return round(((now - then) * 8) / seconds / 1e6, 2);
      };
      const address =
        typeof row.addr4 === 'string' && row.addr4
          ? row.addr4
          : ((Array.isArray(row.ipv4) ? row.ipv4[0]?.ipaddr : null) ?? null);
      return {
        id,
        name: String(row.description || id.toUpperCase()),
        device: typeof row.device === 'string' ? row.device : null,
        status: typeof row.status === 'string' ? row.status : null,
        ipv4: address ? String(address).split('/')[0] : null,
        counters: { in: inBytes, out: outBytes },
        at,
        inMbps: rate(inBytes, before?.counters?.in),
        outMbps: rate(outBytes, before?.counters?.out),
      };
    });
}

/**
 * @description The hosts of the network: the ARP table (who is here now)
 * merged with the DHCP leases (names), by MAC address.
 * @param {unknown} arp - The diagnostics/interface/get_arp answer.
 * @param {unknown} leases - Rows of the dnsmasq or Kea leases, possibly undefined.
 * @param {Array<object>} interfaces - readInterfaces (device -> identifier).
 * @returns {Array<object>} `{ mac, name, ip, iface, vendor, seen }`, `seen`
 * when the host answers in the ARP table now.
 */
function readHosts(arp, leases, interfaces = []) {
  const byDevice = new Map(interfaces.filter((i) => i.device).map((i) => [i.device, i.id]));
  const hosts = new Map();
  const host = (mac) => {
    if (!hosts.has(mac)) {
      hosts.set(mac, { mac, name: null, ip: null, iface: null, vendor: null, seen: false });
    }
    return hosts.get(mac);
  };
  for (const lease of rowsOf(leases)) {
    const mac = normalizeMac(lease?.hwaddr);
    if (!mac || typeof lease.address !== 'string' || lease.address.includes(':')) {
      continue;
    }
    const entry = host(mac);
    entry.ip = lease.address;
    entry.name = lease.hostname ? String(lease.hostname) : entry.name;
    entry.iface = lease.if_name ? String(lease.if_name) : entry.iface;
    entry.vendor = lease.mac_info ? String(lease.mac_info) : entry.vendor;
  }
  for (const record of rowsOf(arp)) {
    const mac = normalizeMac(record?.mac);
    // permanent: the addresses of the firewall itself.
    if (!mac || record.permanent === true) {
      continue;
    }
    const entry = host(mac);
    entry.ip = record.ip ? String(record.ip) : entry.ip;
    entry.name = entry.name ?? (record.hostname ? String(record.hostname) : null);
    entry.iface = entry.iface ?? byDevice.get(record.intf) ?? null;
    entry.vendor = entry.vendor ?? (record.manufacturer ? String(record.manufacturer) : null);
    entry.seen = entry.seen || record.expired !== true;
  }
  return [...hosts.values()].sort((a, b) => a.mac.localeCompare(b.mac));
}

/**
 * @description The WireGuard peers.
 * @param {unknown} answer - The wireguard/service/show answer.
 * @returns {Array<object>} `{ key, name, iface, online, endpoint, handshakeAt }`.
 */
function readPeers(answer) {
  return rowsOf(answer)
    .filter((row) => row?.type === 'peer' && typeof row['public-key'] === 'string')
    .map((row) => ({
      key: `${row.if ?? ''}:${row['public-key']}`,
      name: String(row.name || row['public-key'].slice(0, 8)),
      iface: String(row.ifname || row.if || ''),
      online: row['peer-status'] === 'online',
      endpoint: row.endpoint && row.endpoint !== '(none)' ? String(row.endpoint) : null,
      handshakeAt: toNumber(row['latest-handshake'])
        ? toNumber(row['latest-handshake']) * 1000
        : null,
    }));
}

/**
 * @description The services of the firewall.
 * @param {unknown} answer - The core/service/search answer.
 * @returns {Array<object>} `{ id, name, description, running }`.
 */
function readServices(answer) {
  return rowsOf(answer)
    .filter((row) => typeof row?.id === 'string' && typeof row?.name === 'string')
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: String(row.description || row.name),
      running: Number(row.running) === 1,
    }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @description The firewall rules of a category: those that can be switched
 * (MVC rules: a real UUID, not a legacy or automatic rule).
 * @param {unknown} rules - The firewall/filter/search_rule answer.
 * @param {unknown} categories - The firewall/category/search_item answer.
 * @param {string} category - The category name (case insensitive).
 * @returns {Array<object>} `{ uuid, name, enabled }`.
 */
function readRules(rules, categories, category) {
  const wanted = String(category ?? '')
    .trim()
    .toLowerCase();
  if (!wanted) {
    return [];
  }
  const ids = new Set(
    rowsOf(categories)
      .filter((row) => String(row?.name ?? '').toLowerCase() === wanted)
      .map((row) => row.uuid),
  );
  return rowsOf(rules)
    .filter((row) => UUID.test(row?.uuid ?? '') && !row.legacy)
    .filter((row) =>
      String(row.categories ?? '')
        .split(',')
        .map((value) => value.trim())
        .some((value) => ids.has(value) || value.toLowerCase() === wanted),
    )
    .map((row) => ({
      uuid: row.uuid.toLowerCase(),
      name: String(row.description || row.uuid),
      enabled: String(row.enabled) === '1',
    }));
}

export {
  rowsOf,
  toNumber,
  normalizeMac,
  parseUptime,
  parseVersion,
  readTemperature,
  readFirmware,
  readSystem,
  gatewayStatus,
  readGateways,
  readInterfaces,
  readHosts,
  readPeers,
  readServices,
  readRules,
};
