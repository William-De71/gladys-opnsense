// -----------------------------------------------------------------------------
// The reading loop: every `poll_interval` seconds, the state of the firewall.
//
// Each round reads what moves (CPU, memory, temperature, uptime, gateways,
// interface counters, ARP table, WireGuard peers, services, rules); what
// hardly moves (system information, disk, firmware check result, DHCP
// leases, rule categories) is read every SLOW_INTERVAL_MS only.
//
// It keeps the snapshots the devices, widgets and scene actions read, and
// hands each round to the app with its transitions (tracker.js). A round
// never overlaps another one. The system time is the probe of the round: when
// it fails (unreachable, wrong key), the round fails (onError); any other
// read failing keeps its previous snapshot. A 403 on the probe still proves
// the address and the key: only "Lobby: Dashboard" is not granted, and the
// round goes on without the health of the firewall.
// -----------------------------------------------------------------------------

import {
  readSystem,
  readFirmware,
  readGateways,
  readInterfaces,
  readHosts,
  readPeers,
  readServices,
  readRules,
  rowsOf,
} from './read.js';
import { nextPresence, diffGateway, diffPeer, diffService, diffFirmware } from './tracker.js';

const SLOW_INTERVAL_MS = 10 * 60 * 1000;
// An optional endpoint missing (plugin not installed, privilege not granted)
// is not asked again before this delay.
const RETRY_MISSING_MS = 60 * 60 * 1000;

/**
 * @description Create the watcher.
 * @param {object} options - Options.
 * @param {object} options.api - The OPNsense client.
 * @param {object} options.known - The known MAC addresses (store.js).
 * @param {Function} options.getConfig - `() => normalized config`.
 * @param {Function} options.isEnabled - `() => boolean`: address and key known.
 * @param {Function} options.onRound - `async (round) => void`.
 * @param {Function} options.onError - `async (err) => void`.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} options.logger - Logger.
 * @returns {object} The watcher.
 * @example
 * const watcher = createWatcher({ api, known, getConfig, isEnabled, onRound, onError, logger });
 * watcher.start();
 */
function createWatcher({
  api,
  known,
  getConfig,
  isEnabled,
  onRound,
  onError,
  now = () => Date.now(),
  logger,
}) {
  let system = null;
  let firmware;
  let slow = {};
  let slowAt = null;
  let gateways = new Map();
  let interfaces = new Map();
  let hosts = new Map();
  let peers = new Map();
  let services = new Map();
  let rules = new Map();
  let rulesRead = false;
  let wireguard = false;
  let dashboard = true;
  let fetchedAt = null;
  // endpoint -> time it was found missing or forbidden
  let missing = new Map();
  let timer = null;
  let running = null;
  let started = false;

  /**
   * @description Read an optional endpoint: undefined when it fails.
   * @param {string} name - The client method.
   * @returns {Promise<unknown>} The answer.
   */
  async function readOptional(name) {
    const since = missing.get(name);
    if (since !== undefined && now() - since < RETRY_MISSING_MS) {
      return undefined;
    }
    try {
      const answer = await api[name]();
      missing.delete(name);
      return answer;
    } catch (err) {
      if (err.kind === 'not_found' || err.kind === 'forbidden') {
        if (since === undefined) {
          logger.info(`OPNsense ${name}: ${err.message}, skipped`);
        }
        missing.set(name, now());
      } else {
        logger.warn(`OPNsense ${name}: ${err.message}`);
      }
      return undefined;
    }
  }

  /**
   * @description The DHCP leases: dnsmasq (default since 25.1), else Kea.
   * @returns {Promise<unknown>} The rows, undefined when none answers.
   */
  async function readLeases() {
    const dnsmasq = await readOptional('dnsmasqLeases');
    if (rowsOf(dnsmasq).length > 0) {
      return dnsmasq;
    }
    return (await readOptional('keaLeases')) ?? dnsmasq;
  }

  /**
   * @description The parts read every SLOW_INTERVAL_MS.
   * @param {boolean} force - Read them now.
   * @returns {Promise<void>}
   */
  async function readSlow(force) {
    const at = now();
    if (!force && slowAt !== null && at - slowAt < SLOW_INTERVAL_MS) {
      return;
    }
    const { ruleCategory } = getConfig();
    const next = {
      information: await readOptional('systemInformation'),
      disk: await readOptional('systemDisk'),
      firmware: await readOptional('firmwareStatus'),
      leases: await readLeases(),
      categories: ruleCategory ? await readOptional('ruleCategories') : undefined,
    };
    // A failed read keeps the previous answer.
    slow = Object.fromEntries(
      Object.entries(next).map(([key, value]) => [key, value ?? slow[key]]),
    );
    slowAt = at;
  }

  /**
   * @description One reading of the firewall.
   * @param {boolean} forceSlow - Read the slow parts too.
   * @returns {Promise<void>}
   */
  async function readAll(forceSlow) {
    // The probe: a failure here fails the round, but for a missing privilege.
    let time;
    try {
      time = await api.systemTime();
      dashboard = true;
    } catch (err) {
      if (err.kind !== 'forbidden') {
        throw err;
      }
      if (dashboard) {
        logger.info(`OPNsense systemTime: ${err.message}, firewall health skipped`);
      }
      dashboard = false;
    }
    await readSlow(forceSlow);
    const config = getConfig();
    const at = now();
    const round = {
      baseline: fetchedAt === null,
      gateways: [],
      presence: [],
      newHosts: [],
      peers: [],
      services: [],
      firmware: null,
    };

    // --- firewall ---------------------------------------------------------------
    const [resources, temperature, cpu] = [
      await readOptional('systemResources'),
      await readOptional('systemTemperature'),
      await readOptional('cpuUsage'),
    ];
    system = readSystem({ ...slow, time, resources, temperature, cpu });
    const nextFirmware = slow.firmware ? readFirmware(slow.firmware) : null;
    if (diffFirmware(firmware, nextFirmware)) {
      round.firmware = nextFirmware;
    }
    firmware = nextFirmware;

    // --- gateways ---------------------------------------------------------------
    const gatewayAnswer = await readOptional('gatewayStatus');
    if (gatewayAnswer !== undefined) {
      const next = new Map();
      for (const gateway of readGateways(gatewayAnswer)) {
        const transition = diffGateway(gateways.get(gateway.name), gateway);
        if (transition) {
          round.gateways.push({ gateway, previous: transition.previous });
        }
        next.set(gateway.name, gateway);
      }
      gateways = next;
    }

    // --- interfaces -------------------------------------------------------------
    const [info, traffic] = [
      await readOptional('interfacesInfo'),
      await readOptional('trafficInterface'),
    ];
    if (info !== undefined) {
      interfaces = new Map(readInterfaces(info, traffic, interfaces).map((i) => [i.id, i]));
    }

    // --- hosts and presence -----------------------------------------------------
    const arp = await readOptional('arp');
    if (arp !== undefined) {
      const absenceMs = config.absenceDelay * 60000;
      const read = new Map(
        readHosts(arp, slow.leases, [...interfaces.values()]).map((h) => [h.mac, h]),
      );
      const next = new Map();
      for (const mac of new Set([...hosts.keys(), ...read.keys()])) {
        const before = hosts.get(mac);
        const host = { ...(before ?? {}), ...(read.get(mac) ?? { seen: false }) };
        // A name, an address once known stays known.
        host.mac = mac;
        host.name = host.name ?? before?.name ?? null;
        host.ip = host.ip ?? before?.ip ?? null;
        const presence = nextPresence(
          round.baseline ? undefined : before,
          host.seen,
          at,
          absenceMs,
        );
        host.present = presence.present;
        host.lastSeen = presence.lastSeen;
        if (presence.event) {
          round.presence.push({ host, event: presence.event });
        }
        next.set(mac, host);
      }
      hosts = next;
      const fresh = [...read.keys()].filter((mac) => !known.has(mac));
      if (fresh.length > 0) {
        if (known.initialized()) {
          fresh.forEach((mac) => round.newHosts.push({ host: hosts.get(mac) }));
        }
        await known.add(fresh);
      } else if (!known.initialized()) {
        await known.add([]);
      }
    }

    // --- WireGuard --------------------------------------------------------------
    const wg = await readOptional('wireguardShow');
    if (wg !== undefined) {
      const next = new Map();
      for (const peer of readPeers(wg)) {
        if (diffPeer(peers.get(peer.key), peer)) {
          round.peers.push({ peer });
        }
        next.set(peer.key, peer);
      }
      peers = next;
      wireguard = next.size > 0;
    }

    // --- services ---------------------------------------------------------------
    const serviceAnswer = await readOptional('services');
    if (serviceAnswer !== undefined) {
      const next = new Map();
      for (const service of readServices(serviceAnswer)) {
        if (diffService(services.get(service.id), service)) {
          round.services.push({ service });
        }
        next.set(service.id, service);
      }
      services = next;
    }

    // --- rules ------------------------------------------------------------------
    if (config.ruleCategory) {
      const ruleAnswer = await readOptional('rules');
      if (ruleAnswer !== undefined) {
        rules = new Map(
          readRules(ruleAnswer, slow.categories, config.ruleCategory).map((r) => [r.uuid, r]),
        );
        rulesRead = true;
      }
    } else {
      rules = new Map();
    }

    fetchedAt = at;
    await onRound(round);
  }

  /**
   * @description Plan the next round.
   */
  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (started) {
      timer = setTimeout(() => {
        round().finally(schedule);
      }, getConfig().pollInterval * 1000);
      timer.unref?.();
    }
  }

  /**
   * @description Read the firewall now; joins a round already running.
   * @param {object} [options] - `{ slow }`: read the slow parts too.
   * @returns {Promise<void>} Never rejects: failures go to onError.
   */
  function round({ slow: forceSlow = false } = {}) {
    if (running) {
      return running;
    }
    if (!isEnabled()) {
      return Promise.resolve();
    }
    running = readAll(forceSlow)
      .catch(async (err) => {
        logger.warn(`OPNsense reading failed: ${err.message}`);
        await onError(err);
      })
      .catch((err) => logger.error('Unable to report a reading failure', err))
      .finally(() => {
        running = null;
      });
    return running;
  }

  return {
    round,
    start: () => {
      started = true;
      schedule();
    },
    stop: () => {
      started = false;
      clearTimeout(timer);
      timer = null;
    },
    reschedule: schedule,
    /** @description Forget everything: the next round is a new baseline. */
    reset: () => {
      system = null;
      firmware = undefined;
      slow = {};
      slowAt = null;
      gateways = new Map();
      interfaces = new Map();
      hosts = new Map();
      peers = new Map();
      services = new Map();
      rules = new Map();
      rulesRead = false;
      wireguard = false;
      dashboard = true;
      fetchedAt = null;
      missing = new Map();
    },
    system: () => system,
    firmware: () => firmware ?? null,
    gateways: () => [...gateways.values()],
    gateway: (name) => gateways.get(name) ?? null,
    interfaces: () => [...interfaces.values()],
    iface: (id) => interfaces.get(id) ?? null,
    hosts: () => [...hosts.values()],
    host: (mac) => hosts.get(mac) ?? null,
    peers: () => [...peers.values()],
    services: () => [...services.values()],
    rules: () => [...rules.values()],
    rule: (uuid) => rules.get(uuid) ?? null,
    rulesRead: () => rulesRead,
    hasWireguard: () => wireguard,
    /** @description False when "Lobby: Dashboard" is not granted. */
    hasDashboard: () => dashboard,
    hasTemperature: () => system?.temperature !== null && system?.temperature !== undefined,
    fetchedAt: () => fetchedAt,
    /**
     * @description Apply a change the integration made itself: no event.
     * @param {string} uuid - The rule UUID.
     * @param {boolean} enabled - Its new state.
     * @returns {object|null} The new snapshot.
     */
    patchRule: (uuid, enabled) => {
      const current = rules.get(uuid);
      if (!current) {
        return null;
      }
      const next = { ...current, enabled };
      rules.set(uuid, next);
      return next;
    },
    /**
     * @description Apply a service restart run from Gladys: no event.
     * @param {string} id - The service id.
     * @param {boolean} running - Its state after the restart.
     */
    patchService: (id, running) => {
      const current = services.get(id);
      if (current) {
        services.set(id, { ...current, running });
      }
    },
    /**
     * @description Apply a firmware check run from Gladys: no event.
     * @param {object} answer - The core/firmware/status answer.
     * @returns {object} readFirmware.
     */
    patchFirmware: (answer) => {
      slow = { ...slow, firmware: answer };
      firmware = readFirmware(answer);
      if (system) {
        system = { ...system, firmware };
      }
      return firmware;
    },
  };
}

export { createWatcher, SLOW_INTERVAL_MS };
