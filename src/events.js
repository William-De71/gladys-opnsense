// -----------------------------------------------------------------------------
// Scene trigger payloads and scene action outputs.
//
// Event data is flat (at most 30 keys, scalar values, strings of at most
// 1,000 characters); a field of a trigger filters on the data key of the same
// name (`device`, `status`, `event`, `interface`, `state`, `service`).
// Outputs are the declared ones only, never null: -1 for an unknown number,
// "" for an unknown text.
// -----------------------------------------------------------------------------

import { idsOf, macId, hostName, DEVICE_TYPES } from './device.js';
import { t, formatNumber } from './i18n.js';

const TRIGGERS = {
  GATEWAY_STATUS_CHANGED: 'gateway_status_changed',
  NETWORK_DEVICE_PRESENCE: 'network_device_presence',
  NEW_NETWORK_DEVICE: 'new_network_device',
  VPN_PEER_CHANGED: 'vpn_peer_changed',
  SERVICE_STATE_CHANGED: 'service_state_changed',
  FIRMWARE_UPDATE_AVAILABLE: 'firmware_update_available',
};

const MAX_STRING = 1000;
const text = (value) => String(value ?? '').slice(0, MAX_STRING);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : -1);

/**
 * @description The event of a gateway that changed status.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ gateway: object, previous: string }} change - The transition.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function gatewayEvent(gladys, { gateway, previous }, language) {
  const name = t('gatewayDeviceName', language, { name: gateway.name });
  return {
    key: TRIGGERS.GATEWAY_STATUS_CHANGED,
    data: {
      device: idsOf(gladys, DEVICE_TYPES.GATEWAY, gateway.name).device,
      device_name: text(name),
      gateway: text(gateway.name),
      status: gateway.status,
      previous_status: previous,
      delay: number(gateway.delay),
      loss: number(gateway.loss),
      summary: text(
        t(`summaryGateway_${gateway.status}`, language, {
          name: gateway.name,
          delay: formatNumber(gateway.delay, language, 1),
          loss: formatNumber(gateway.loss, language, 1),
        }),
      ),
    },
  };
}

/**
 * @description The event of a host that arrived or left.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ host: object, event: string }} change - The transition.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function presenceEvent(gladys, { host, event }, language) {
  const name = hostName(host);
  return {
    key: TRIGGERS.NETWORK_DEVICE_PRESENCE,
    data: {
      device: idsOf(gladys, DEVICE_TYPES.HOST, macId(host.mac)).device,
      device_name: text(name),
      event,
      mac: host.mac,
      ip: text(host.ip),
      summary: text(t(`summaryPresence_${event}`, language, { name })),
    },
  };
}

/**
 * @description The event of a MAC address never met before.
 * @param {{ host: object }} change - The new host.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function newHostEvent({ host }, language) {
  return {
    key: TRIGGERS.NEW_NETWORK_DEVICE,
    data: {
      mac: host.mac,
      ip: text(host.ip),
      hostname: text(host.name),
      vendor: text(host.vendor),
      interface: text(host.iface),
      summary: text(
        t('summaryNewHost', language, {
          name: hostName(host),
          ip: host.ip ?? '?',
          iface: host.iface ?? '?',
        }),
      ),
    },
  };
}

/**
 * @description The event of a WireGuard peer that connected or disconnected.
 * @param {{ peer: object }} change - The peer.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function peerEvent({ peer }, language) {
  const state = peer.online ? 'connected' : 'disconnected';
  return {
    key: TRIGGERS.VPN_PEER_CHANGED,
    data: {
      peer: text(peer.name),
      interface: text(peer.iface),
      state,
      endpoint: text(peer.endpoint),
      summary: text(t(`summaryPeer_${state}`, language, { name: peer.name, iface: peer.iface })),
    },
  };
}

/**
 * @description The event of a service that started or stopped.
 * @param {{ service: object }} change - The service.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function serviceEvent({ service }, language) {
  const state = service.running ? 'started' : 'stopped';
  return {
    key: TRIGGERS.SERVICE_STATE_CHANGED,
    data: {
      service: text(service.name),
      service_id: text(service.id),
      description: text(service.description),
      state,
      summary: text(t(`summaryService_${state}`, language, { name: service.description })),
    },
  };
}

/**
 * @description The event of updates found by a firmware check.
 * @param {object} firmware - readFirmware.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function firmwareEvent(firmware, language) {
  return {
    key: TRIGGERS.FIRMWARE_UPDATE_AVAILABLE,
    data: {
      current_version: text(firmware.version),
      new_version: text(firmware.latest),
      updates: number(firmware.updates),
      reboot: Boolean(firmware.reboot),
      summary: text(firmwareSummary(firmware, language)),
    },
  };
}

/**
 * @description One sentence about the firmware.
 * @param {object|null} firmware - readFirmware.
 * @param {string} language - The language.
 * @returns {string} The sentence.
 */
function firmwareSummary(firmware, language) {
  if (!firmware || firmware.updates === null) {
    return t('firmwareUnchecked', language);
  }
  if (firmware.updates === 0) {
    return t('firmwareUpToDate', language, { version: firmware.version ?? '?' });
  }
  const sentence = t('firmwareUpdates', language, {
    count: firmware.updates,
    version: firmware.latest && firmware.latest !== firmware.version ? ` (${firmware.latest})` : '',
  });
  return firmware.reboot ? `${sentence} ${t('firmwareReboot', language)}` : sentence;
}

/**
 * @description The outputs of the "read the status" scene action.
 * @param {object} snapshot - `{ system, gateways, hosts, peers }`.
 * @param {string} language - Language of the summary.
 * @returns {object} The outputs.
 */
function statusOutputs({ system, gateways, hosts, peers }, language) {
  const online = gateways.filter((g) => g.status === 'online').length;
  const offline = gateways.filter((g) => g.status === 'offline').length;
  const present = hosts.filter((h) => h.present).length;
  const summary = [
    t('summaryStatus', language, {
      cpu: formatNumber(system?.cpu, language, 0),
      memory: formatNumber(system?.memory, language, 0),
      online,
      total: gateways.length,
    }),
    offline > 0 ? t('summaryStatusOffline', language, { count: offline }) : '',
    t('summaryStatusHosts', language, { count: present }),
  ]
    .filter(Boolean)
    .join(' ');
  return {
    cpu: number(system?.cpu),
    memory: number(system?.memory),
    disk: number(system?.disk),
    temperature: number(system?.temperature),
    uptime_days: number(system?.uptimeDays),
    gateways_online: online,
    gateways_offline: offline,
    devices_present: present,
    vpn_peers_online: peers.filter((p) => p.online).length,
    updates: number(system?.firmware?.updates),
    version: text(system?.version),
    summary: text(summary),
  };
}

/**
 * @description The outputs of the "check for updates" scene action.
 * @param {object} firmware - readFirmware.
 * @param {string} language - Language of the summary.
 * @returns {object} The outputs.
 */
const firmwareOutputs = (firmware, language) => ({
  updates: number(firmware?.updates),
  current_version: text(firmware?.version),
  new_version: text(firmware?.latest),
  summary: text(firmwareSummary(firmware, language)),
});

export {
  TRIGGERS,
  gatewayEvent,
  presenceEvent,
  newHostEvent,
  peerEvent,
  serviceEvent,
  firmwareEvent,
  firmwareSummary,
  statusOutputs,
  firmwareOutputs,
};
