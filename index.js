// -----------------------------------------------------------------------------
// Entry point of the OPNsense external integration.
//
// Brings an OPNsense firewall into Gladys, over its REST API on the LAN:
//   - devices: the firewall, its gateways, its interfaces, the firewall rules
//     of a category (switches) and the hosts of the network (presence),
//     offered on the Discovery screen (see src/device.js);
//   - scene triggers: gateway status changed, device arrived or left, new
//     device on the network, VPN peer connected or disconnected, service
//     started or stopped, firmware update available;
//   - scene actions: read the status, Wake-on-LAN, add or remove an address
//     in an alias, restart a service, check for updates, reboot;
//   - dashboard widgets: overview, internet link, network devices, WireGuard.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the OPNsense integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
