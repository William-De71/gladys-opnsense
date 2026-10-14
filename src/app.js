// -----------------------------------------------------------------------------
// The OPNsense integration: every handler, registered on a Gladys client.
//
// Brings an OPNsense firewall into Gladys, over its REST API on the LAN:
//   - devices (device.js): the firewall (CPU, memory, disk, temperature,
//     uptime, updates, version, VPN peers), its gateways (status, latency,
//     loss), its interfaces (rates, link, address), the firewall rules of a
//     category as switches, and the hosts of the network as presence sensors;
//   - scene triggers (tracker.js, events.js): gateway status changed, device
//     arrived or left, new device on the network, VPN peer connected or
//     disconnected, service started or stopped, firmware update available;
//   - scene actions: read the status, Wake-on-LAN, add or remove an address
//     in an alias, restart a service, check for updates, reboot;
//   - dashboard widgets (widgets.js): overview, internet link, network
//     devices, WireGuard VPN.
//
// Transport: local only. Nothing leaves the network, except what OPNsense
// itself contacts (its update mirror, on a firmware check).
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  hasCredentials,
  readLanguage,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import { createOpnsenseClient } from './opnsense-api.js';
import { createKnownHosts, DEFAULT_PATH } from './store.js';
import { createWatcher } from './watcher.js';
import { normalizeMac, parseVersion, readServices } from './read.js';
import {
  DEVICE_TYPES,
  FIREWALL_ID,
  idsOf,
  macId,
  macOf,
  idFromExternalId,
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
} from './device.js';
import {
  gatewayEvent,
  presenceEvent,
  newHostEvent,
  peerEvent,
  serviceEvent,
  firmwareEvent,
  firmwareSummary,
  statusOutputs,
  firmwareOutputs,
} from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  messageContent,
  readInternetSettings,
  readNetworkSettings,
  buildOverviewWidget,
  buildInternetWidget,
  buildNetworkWidget,
  buildVpnWidget,
} from './widgets.js';
import { t, all } from './i18n.js';

const { name, version, homepage } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const ACTIONS = { TEST_CONNECTION: 'test_connection', FORGET_DEVICES: 'forget_network_devices' };
const SCENE_ACTIONS = {
  GET_STATUS: 'get_status',
  WAKE_ON_LAN: 'wake_on_lan',
  ALIAS_ADDRESS: 'alias_address',
  RESTART_SERVICE: 'restart_service',
  CHECK_UPDATES: 'check_updates',
  REBOOT: 'reboot',
};
// A present host is dated again in Gladys this often (the "check presence"
// action of Gladys reads the date of the last value, as for Bluetooth).
const PRESENCE_HEARTBEAT_MS = 60000;
// The Discovery list never exceeds what the host API accepts in one batch.
const MAX_DISCOVERED = 2000;
// OPNsense validates alias entries with this same rule (AliasUtilController).
const ADDRESS = /^[0-9a-f:./_]+$/i;
const ALIAS = /^[A-Za-z0-9_]{1,32}$/;

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.request] - HTTP transport of the OPNsense client (tests).
 * @param {string} [options.knownHostsPath] - File of the known MAC addresses.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {{ watcher: object, known: object, getConfig: Function }} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  { request, knownHostsPath = DEFAULT_PATH, now = () => Date.now(), logger = sdkLogger } = {},
) {
  let config = normalizeConfig();
  let configLoaded = false;
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  // Device external ids the user created (states are only published for them).
  let createdDevices = new Set();
  // Last connection status and Discovery list sent, to send them again only
  // when they change.
  let lastStatus = null;
  let lastDiscovery = null;

  const api = createOpnsenseClient({
    getConfig: () => config,
    userAgent: `${name}/${version} (+${homepage})`,
    ...(request ? { request } : {}),
  });
  const known = createKnownHosts({ path: knownHostsPath, logger });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language
   * (feature names, states, scene summaries and outputs).
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The multi-language message of a failed call.
   * @param {Error} err - An OpnsenseError.
   * @returns {object} The message.
   */
  function errorMessage(err) {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    switch (err.kind) {
      case 'auth':
        return all('statusInvalidKey');
      case 'forbidden':
        return all('statusForbidden');
      case 'tls':
        return all('statusTls');
      case 'not_found':
        return all('statusNotFound');
      default:
        return all('statusUnreachable', { url: config.url });
    }
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  const isCreated = (type, id) => createdDevices.has(idsOf(gladys, type, id).device);

  /**
   * @description The firewall snapshot with the number of peers online.
   * @returns {object|null} The snapshot.
   */
  function firewallSnapshot() {
    const system = watcher.system();
    if (!system) {
      return null;
    }
    const peers = watcher.peers();
    return {
      ...system,
      vpnPeers: watcher.hasWireguard() ? peers.filter((peer) => peer.online).length : null,
    };
  }

  /**
   * @description Publish the states of the created devices. The SDK remembers
   * what it sent (publishChangedStates) and forgets a device when the user
   * creates it: its states then go out again in full.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    const lang = textLanguage();
    const states = [];
    const system = firewallSnapshot();
    if (system && isCreated(DEVICE_TYPES.FIREWALL, FIREWALL_ID)) {
      states.push(...buildFirewallStates(gladys, system, lang));
    }
    watcher
      .gateways()
      .filter((gateway) => isCreated(DEVICE_TYPES.GATEWAY, gateway.name))
      .forEach((gateway) => states.push(...buildGatewayStates(gladys, gateway, lang)));
    watcher
      .interfaces()
      .filter((iface) => isCreated(DEVICE_TYPES.INTERFACE, iface.id))
      .forEach((iface) => states.push(...buildInterfaceStates(gladys, iface, lang)));
    watcher
      .rules()
      .filter((rule) => isCreated(DEVICE_TYPES.RULE, rule.uuid))
      .forEach((rule) => states.push(...buildRuleStates(gladys, rule)));
    const hosts = watcher.hosts().filter((host) => isCreated(DEVICE_TYPES.HOST, macId(host.mac)));
    const absent = hosts
      .filter((host) => !host.present)
      .map((host) => ({
        device_feature_external_id: presenceFeatureId(gladys, host.mac),
        state: 0,
      }));
    const present = hosts
      .filter((host) => host.present)
      .map((host) => ({
        device_feature_external_id: presenceFeatureId(gladys, host.mac),
        state: 1,
      }));
    if (states.length + absent.length > 0) {
      await gladys.publishChangedStates([...states, ...absent]);
    }
    if (present.length > 0) {
      await gladys.publishChangedStates(present, { heartbeat: PRESENCE_HEARTBEAT_MS });
    }
  }

  const publishQuietly = () =>
    publishStates().catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));

  /**
   * @description Ask the dashboards to read the widgets again.
   */
  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) => gladys.requestWidgetRefresh(key));
  }

  /**
   * @description Publish a scene event; a failure is only logged.
   * @param {{ key: string, data: object }} event - The event.
   * @returns {Promise<void>}
   */
  async function publishEvent({ key, data }) {
    logger.info(`Scene event ${key}: ${data.summary}`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  }

  /**
   * @description The devices offered on the Discovery screen.
   * @returns {Array<object>} The devices.
   */
  function discoveredDevices() {
    if (!hasCredentials(config) || !watcher.system()) {
      return [];
    }
    const lang = textLanguage();
    const devices = [
      buildFirewallDevice(
        gladys,
        watcher.system(),
        { temperature: watcher.hasTemperature(), wireguard: watcher.hasWireguard() },
        lang,
      ),
      ...watcher.gateways().map((gateway) => buildGatewayDevice(gladys, gateway, lang)),
      ...watcher.interfaces().map((iface) => buildInterfaceDevice(gladys, iface, lang)),
      ...watcher.rules().map((rule) => buildRuleDevice(gladys, rule, lang)),
    ];
    const hosts = watcher
      .hosts()
      .filter(
        (host) =>
          isCreated(DEVICE_TYPES.HOST, macId(host.mac)) ||
          config.networkDevices === 'all' ||
          (config.networkDevices === 'named' && host.name),
      );
    devices.push(...hosts.map((host) => buildHostDevice(gladys, host, lang)));
    return devices.slice(0, MAX_DISCOVERED);
  }

  /**
   * @description Offer the devices, only when the list changed.
   * @param {boolean} [force] - Send it even when unchanged.
   * @returns {Promise<number>} How many devices are offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const devices = discoveredDevices();
    const signature = JSON.stringify(
      devices.map((d) => [d.external_id, d.name, d.features.length]),
    );
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  // --- The watcher -----------------------------------------------------------------
  const watcher = createWatcher({
    api,
    known,
    getConfig: () => config,
    isEnabled: () => hasCredentials(config),
    onRound: async (round) => {
      const lang = textLanguage();
      if (!round.baseline) {
        for (const change of round.gateways) {
          await publishEvent(gatewayEvent(gladys, change, lang));
        }
        for (const change of round.presence) {
          await publishEvent(presenceEvent(gladys, change, lang));
        }
        for (const change of round.newHosts) {
          await publishEvent(newHostEvent(change, lang));
        }
        for (const change of round.peers) {
          await publishEvent(peerEvent(change, lang));
        }
        for (const change of round.services) {
          await publishEvent(serviceEvent(change, lang));
        }
        if (round.firmware) {
          await publishEvent(firmwareEvent(round.firmware, lang));
        }
      }
      await publishQuietly();
      await publishDiscoveredDevices().catch((err) =>
        logger.warn(`Unable to offer the devices: ${err.message}`),
      );
      refreshWidgets();
      const system = watcher.system();
      await reportStatus(
        true,
        all('statusConnected', {
          version: system?.version ?? '?',
          gateways: watcher.gateways().filter((g) => g.status === 'online').length,
          total: watcher.gateways().length,
          hosts: watcher.hosts().filter((h) => h.present).length,
        }),
      );
    },
    onError: async (err) => {
      await reportStatus(false, errorMessage(err));
    },
    now,
    logger,
  });

  /**
   * @description Read OPNsense if it never was, before an answer that needs it.
   * @returns {Promise<void>}
   */
  async function ensureRead() {
    if (!hasCredentials(config)) {
      throw new Error('No OPNsense address or API key is configured');
    }
    if (watcher.fetchedAt() === null) {
      await watcher.round();
    }
    if (watcher.fetchedAt() === null) {
      throw new Error('OPNsense could not be read: see the connection status');
    }
  }

  /**
   * @description The host a scene action targets: the chosen device, else a MAC.
   * @param {unknown} deviceExternalId - The `source: "devices"` value.
   * @param {unknown} mac - A typed MAC address.
   * @returns {{ mac: string|null, host: object|null }} The target.
   */
  function resolveHost(deviceExternalId, mac) {
    const id = idFromExternalId(deviceExternalId, DEVICE_TYPES.HOST);
    const address = id ? macOf(id) : normalizeMac(mac);
    return { mac: address, host: address ? watcher.host(address) : null };
  }

  /**
   * @description Run a firmware check against the mirror, without scene event.
   * @returns {Promise<object>} readFirmware.
   */
  async function probeFirmware() {
    const firmware = watcher.patchFirmware(await api.firmwareProbe());
    await publishQuietly();
    refreshWidgets();
    return firmware;
  }

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description Common checks of a widget request.
   * @param {string} lang - The user language.
   * @returns {object|null} A message content, null when the widget can be built.
   */
  function widgetProblem(lang) {
    if (!hasCredentials(config)) {
      return messageContent(t('noCredentials', lang));
    }
    if (watcher.fetchedAt() === null) {
      return messageContent(t('notReadYet', lang), 30);
    }
    return null;
  }

  gladys.onWidgetGet(WIDGETS.OVERVIEW, async ({ language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildOverviewWidget({
        system: watcher.system(),
        gateways: watcher.gateways(),
        language: lang,
        now: now(),
        fetchedAt: watcher.fetchedAt(),
        pollSeconds: config.pollInterval,
      })
    );
  });

  gladys.onWidgetGet(WIDGETS.INTERNET, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const problem = widgetProblem(lang);
    if (problem) {
      return problem;
    }
    const chosen = readInternetSettings(settings);
    const gatewayName = idFromExternalId(chosen.gateway, DEVICE_TYPES.GATEWAY);
    const gateway =
      (gatewayName && watcher.gateway(gatewayName)) ||
      watcher.gateways().find((g) => g.status !== 'offline') ||
      watcher.gateways()[0] ||
      null;
    const ifaceId = idFromExternalId(chosen.iface, DEVICE_TYPES.INTERFACE);
    const iface = (ifaceId && watcher.iface(ifaceId)) || watcher.iface('wan') || null;
    return buildInternetWidget({
      gateway,
      iface,
      language: lang,
      pollSeconds: config.pollInterval,
      interval: chosen.interval,
      featureId:
        iface && isCreated(DEVICE_TYPES.INTERFACE, iface.id)
          ? idsOf(gladys, DEVICE_TYPES.INTERFACE, iface.id).feature
          : null,
    });
  });

  gladys.onWidgetGet(WIDGETS.NETWORK, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildNetworkWidget({
        hosts: watcher.hosts(),
        language: lang,
        now: now(),
        pollSeconds: config.pollInterval,
        show: readNetworkSettings(settings).show,
        created: new Set(
          watcher
            .hosts()
            .filter((host) => isCreated(DEVICE_TYPES.HOST, macId(host.mac)))
            .map((host) => host.mac),
        ),
      })
    );
  });

  gladys.onWidgetGet(WIDGETS.VPN, async ({ language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildVpnWidget({
        peers: watcher.peers(),
        language: lang,
        now: now(),
        pollSeconds: config.pollInterval,
      })
    );
  });

  gladys.onWidgetAction(WIDGETS.OVERVIEW, async (actionKey) => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      if (actionKey === WIDGET_ACTIONS.CHECK_UPDATES) {
        const firmware = await probeFirmware();
        return Object.fromEntries(
          Object.keys(all('noCredentials')).map((lang) => [lang, firmwareSummary(firmware, lang)]),
        );
      }
      if (actionKey === WIDGET_ACTIONS.REBOOT) {
        await api.reboot();
        return all('rebooting');
      }
    } catch (err) {
      logger.warn(`Widget action ${actionKey}: ${err.message}`);
      return errorMessage(err);
    }
    return all('unknownAction');
  });

  // --- Scene actions -----------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_STATUS, async () => {
    await ensureRead();
    return statusOutputs(
      {
        system: watcher.system(),
        gateways: watcher.gateways(),
        hosts: watcher.hosts(),
        peers: watcher.peers(),
      },
      textLanguage(),
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.WAKE_ON_LAN, async (fields) => {
    await ensureRead();
    const { mac, host } = resolveHost(fields.device, fields.mac);
    if (!mac) {
      throw new Error('Choose a device or type its MAC address');
    }
    const iface = String(fields.interface ?? '').trim() || host?.iface;
    if (!iface || !/^[a-z0-9_]+$/.test(iface)) {
      throw new Error(`Unknown interface of ${mac}: type its OPNsense identifier (lan, opt1...)`);
    }
    const answer = await api.wake(iface, mac);
    if (answer?.status === 'error') {
      throw new Error(`OPNsense could not wake ${mac}: ${answer.error_msg ?? 'error'}`);
    }
    return { mac, interface: iface };
  });

  gladys.onSceneAction(SCENE_ACTIONS.ALIAS_ADDRESS, async (fields) => {
    await ensureRead();
    const alias = String(fields.alias ?? '').trim();
    if (!ALIAS.test(alias)) {
      throw new Error(`Invalid alias name: ${alias}`);
    }
    const operation = fields.operation === 'remove' ? 'remove' : 'add';
    const { host } = resolveHost(fields.device, null);
    const address = String(fields.address ?? '').trim() || host?.ip || '';
    if (!address || !ADDRESS.test(address)) {
      throw new Error('Choose a device with a known IP address, or type an address');
    }
    // Idempotent on OPNsense: adding twice or removing an absent entry changes nothing.
    const answer =
      operation === 'add'
        ? await api.aliasAdd(alias, address)
        : await api.aliasDelete(alias, address);
    if (answer?.status !== 'done') {
      throw new Error(
        `OPNsense refused: ${answer?.status_msg ?? answer?.status ?? 'unknown alias'}`,
      );
    }
    return { alias, address, operation };
  });

  gladys.onSceneAction(SCENE_ACTIONS.RESTART_SERVICE, async (fields) => {
    await ensureRead();
    const wanted = String(fields.service ?? '').trim();
    const service = watcher
      .services()
      .find((s) => s.id === wanted || s.name === wanted || s.description === wanted);
    if (!service) {
      throw new Error(`Unknown service: ${wanted}`);
    }
    const [serviceName, serviceId = ''] = service.id.split('/');
    await api.restartService(serviceName, serviceId);
    // Read the services again now: the next round must not see the restart
    // as a start (no scene event out of a scene action).
    const fresh = readServices(await api.services()).find((s) => s.id === service.id);
    const running = fresh ? fresh.running : service.running;
    watcher.patchService(service.id, running);
    return { service: service.name, running };
  });

  gladys.onSceneAction(SCENE_ACTIONS.CHECK_UPDATES, async () => {
    await ensureRead();
    return firmwareOutputs(await probeFirmware(), textLanguage());
  });

  gladys.onSceneAction(SCENE_ACTIONS.REBOOT, async () => {
    await ensureRead();
    await api.reboot();
    logger.info('Reboot of OPNsense asked by a scene');
  });

  // --- Device commands (the rule switches) -------------------------------------------
  gladys.onSetValue(async (device, deviceFeature, value) => {
    const uuid = idFromExternalId(device.external_id, DEVICE_TYPES.RULE);
    if (
      !uuid ||
      deviceFeature.external_id !== idsOf(gladys, DEVICE_TYPES.RULE, uuid).feature('enabled')
    ) {
      throw new Error(`Read-only feature: ${deviceFeature.external_id}`);
    }
    const enabled = Number(value) === 1;
    const answer = await api.toggleRule(uuid, enabled);
    if (answer?.result === 'failed') {
      throw new Error(`OPNsense has no rule ${uuid} it can switch`);
    }
    await api.applyFilter();
    watcher.patchRule(uuid, enabled);
    await publishQuietly();
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      await api.systemTime();
      const information = await api.systemInformation().catch(() => null);
      return all('testOk', {
        name: information?.name ?? 'OPNsense',
        version: parseVersion(information?.versions?.[0]) ?? '?',
      });
    } catch (err) {
      return errorMessage(err);
    }
  });

  gladys.onAction(ACTIONS.FORGET_DEVICES, async () => {
    await known.clear();
    return all('forgotten');
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await watcher.round({ slow: true });
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} OPNsense device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishQuietly();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  /**
   * @description Read OPNsense now; report missing settings.
   * @returns {Promise<void>}
   */
  async function refreshAll() {
    if (!hasCredentials(config)) {
      await reportStatus(false, all('noCredentials'));
      return;
    }
    await watcher.round({ slow: true });
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previousUrl = config.url;
    await loadConfig(rawConfig);
    logger.info(`Configuration updated: OPNsense read every ${config.pollInterval} s`);
    // Rule category, interval or address: start again from a fresh baseline.
    watcher.reset();
    lastDiscovery = null;
    if (configLoaded && config.url !== previousUrl) {
      // Maybe another firewall: its network is new.
      await known.clear();
    }
    configLoaded = true;
    watcher.reschedule();
    await refreshAll();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each step on its own: a failing one must not keep the watcher from starting.
  gladys.on('connected', async () => {
    await loadConfig();
    configLoaded = true;
    await known.load();
    await refreshCreatedDevices();
    lastStatus = null;
    lastDiscovery = null;
    await refreshAll();
    watcher.start();
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    watcher.stop();
  });

  return { watcher, known, getConfig: () => config };
}

export { createApp, ACTIONS, SCENE_ACTIONS, PRESENCE_HEARTBEAT_MS };
