// -----------------------------------------------------------------------------
// Configuration of the OPNsense integration.
//
// Fields of the config_schema:
//   - `url`              address of the OPNsense web interface
//                        (https://192.168.1.1, a port is allowed);
//   - `api_key`          the key of an OPNsense API key pair;
//   - `api_secret`       its secret (a `secret`: never sent back to the UI,
//                        never logged);
//   - `verify_tls`       check the HTTPS certificate (off by default: an
//                        OPNsense ships with a self-signed one);
//   - `poll_interval`    how often OPNsense is read, in seconds;
//   - `network_devices`  which hosts of the network are offered as presence
//                        devices: `named` (a DHCP or DNS name), `all`, `none`;
//   - `absence_delay`    minutes a host must be gone before it is absent;
//   - `rule_category`    firewall rules of this category become switches;
//   - `language`         language of the texts Gladys does not ask for in a
//                        language (feature names, scene summaries): `auto`
//                        follows the language of the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`    language of the last widget request, kept for the
//                        texts after a restart.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

// OPNsense answers in a few milliseconds on the LAN; the CPU reading alone
// takes about two seconds. 30 s follows a link that drops without loading the
// firewall.
const POLL_INTERVAL = { min: 10, max: 300, default: 30 };
// A phone asleep on Wi-Fi leaves the ARP table for a few minutes.
const ABSENCE_DELAY = { min: 1, max: 60, default: 5 };
const NETWORK_DEVICES = ['named', 'all', 'none'];
const DEFAULT_NETWORK_DEVICES = 'named';
const DEFAULT_RULE_CATEGORY = 'gladys';
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };

/**
 * @description Read a bounded number field, falling back to its default.
 * @param {unknown} raw - The raw value (the form can send numbers as strings).
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 * @example
 * readNumber('60', POLL_INTERVAL); // -> 60
 */
function readNumber(raw, bounds) {
  const value = Number(raw ?? bounds.default);
  if (raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description The base URL of the web interface: https by default, no path,
 * no trailing slash. Null when it cannot be an URL.
 * @param {unknown} raw - What the user typed.
 * @returns {string|null} The URL.
 * @example
 * normalizeUrl('192.168.1.1/'); // -> 'https://192.168.1.1'
 */
function normalizeUrl(raw) {
  const text = readString(raw);
  if (!text) {
    return null;
  }
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) {
      return null;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * @description Read a boolean field (the form can send strings).
 * @param {unknown} raw - The raw value.
 * @param {boolean} fallback - The default.
 * @returns {boolean} The value.
 */
function readBoolean(raw, fallback) {
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (raw === 'true' || raw === '1' || raw === 1) {
    return true;
  }
  if (raw === 'false' || raw === '0' || raw === 0) {
    return false;
  }
  return fallback;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} The config: `{ url, apiKey, apiSecret, verifyTls,
 * pollInterval (s), networkDevices, absenceDelay (min), ruleCategory, language }`.
 * @example
 * normalizeConfig({ url: '192.168.1.1', api_key: 'k', api_secret: 's' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return {
    url: normalizeUrl(config.url),
    apiKey: readString(config.api_key),
    // A secret is kept as typed.
    apiSecret: typeof config.api_secret === 'string' ? config.api_secret : '',
    verifyTls: readBoolean(config.verify_tls, false),
    pollInterval: readNumber(config.poll_interval, POLL_INTERVAL),
    networkDevices: NETWORK_DEVICES.includes(config.network_devices)
      ? config.network_devices
      : DEFAULT_NETWORK_DEVICES,
    absenceDelay: readNumber(config.absence_delay, ABSENCE_DELAY),
    // An empty category turns the rule switches off.
    ruleCategory:
      config.rule_category === undefined || config.rule_category === null
        ? DEFAULT_RULE_CATEGORY
        : readString(config.rule_category),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Whether OPNsense can be read.
 * @param {object} config - A normalized config.
 * @returns {boolean} True with an address, a key and a secret.
 */
const hasCredentials = (config) => Boolean(config.url && config.apiKey && config.apiSecret);

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  POLL_INTERVAL,
  ABSENCE_DELAY,
  NETWORK_DEVICES,
  DEFAULT_RULE_CATEGORY,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  normalizeUrl,
  normalizeConfig,
  hasCredentials,
  readLanguage,
};
