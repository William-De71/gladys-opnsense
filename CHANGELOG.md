# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.2.0] - 2026-10-22

### Added

- **widgets:** show the new devices of the last 7 days in the network widget ([#2](https://github.com/William-De71/gladys-opnsense/pull/2), [5adb28d](https://github.com/William-De71/gladys-opnsense/commit/5adb28db83db702413057f143adc4ed7ed4199f7))

## [0.1.1] - 2026-10-21

### Fixed

- keep reading OPNsense without the "Lobby: Dashboard" privilege ([fc56638](https://github.com/William-De71/gladys-opnsense/commit/fc566385b6a45652ba04b9e0d33b4e380ca9ac54))

## [0.1.0] - 2026-10-14

### Added

- An OPNsense firewall device: CPU, memory and disk usage, temperature, uptime, pending updates, version and WireGuard peers online.
- A device per gateway (status, latency, packet loss) and per assigned interface (received and sent rates, link, IPv4 address).
- Firewall rules of a chosen category as switches in Gladys: turn a rule on or off from a dashboard or a scene.
- Hosts of the network as presence sensors, from the ARP table and the DHCP leases (Dnsmasq or Kea), with an absence delay.
- Scene triggers: gateway status changed, device arrived or left, new device on the network, VPN peer connected or disconnected, service started or stopped, update available.
- Scene actions: read the status, wake a device (Wake-on-LAN through OPNsense), add or remove an address in an alias, restart a service, check for updates, reboot.
- Dashboard widgets: firewall overview (with "check for updates" and "reboot" buttons), internet connection, network devices, WireGuard VPN.
- Local transport only: the integration talks to the OPNsense API on the LAN, with an API key, and can check the HTTPS certificate.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.2.0]: https://github.com/William-De71/gladys-opnsense/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/William-De71/gladys-opnsense/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/William-De71/gladys-opnsense/releases/tag/v0.1.0
