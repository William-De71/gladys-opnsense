// -----------------------------------------------------------------------------
// Client of the OPNsense REST API (https://docs.opnsense.org/development/api.html).
//
// Authentication: HTTP Basic with an API key pair (System > Access > Users >
// API keys). Every endpoint used here exists in OPNsense 24.7 to 26.7; the
// response shapes come from the controllers of opnsense/core (see read.js).
//
// node:https rather than fetch: an OPNsense ships with a self-signed
// certificate, and only node:https lets the user skip its check without a
// dependency. Errors carry a `kind` the app turns into a message:
//   auth        401: wrong key or secret
//   forbidden   403: the user of the key lacks a privilege
//   not_found   404: endpoint absent (plugin not installed, older version)
//   tls         the certificate is refused (verify_tls on)
//   unreachable network error, timeout
//   http        any other status, or an answer that is not JSON
// -----------------------------------------------------------------------------

import https from 'node:https';
import http from 'node:http';

const TIMEOUT_MS = 10000;
// The CPU stream sends one line per second; the first one is the average
// since boot, the second one the real load.
const CPU_SAMPLES = 2;
const CPU_TIMEOUT_MS = 6000;

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

class OpnsenseError extends Error {
  /**
   * @param {string} kind - auth, forbidden, not_found, tls, unreachable, http.
   * @param {string} message - The message (never carries the secret).
   * @param {number} [status] - The HTTP status.
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'OpnsenseError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description The error of an HTTP status.
 * @param {number} status - The status.
 * @param {string} path - The endpoint.
 * @returns {OpnsenseError} The error.
 */
function statusError(status, path) {
  if (status === 401) {
    return new OpnsenseError('auth', `OPNsense refused the API key (401) on ${path}`, status);
  }
  if (status === 403) {
    return new OpnsenseError('forbidden', `The API user lacks a privilege for ${path}`, status);
  }
  if (status === 404) {
    return new OpnsenseError('not_found', `OPNsense has no ${path} (404)`, status);
  }
  return new OpnsenseError('http', `OPNsense answered ${status} on ${path}`, status);
}

/**
 * @description The error of a failed connection.
 * @param {Error} err - The socket error.
 * @returns {OpnsenseError} The error.
 */
function networkError(err) {
  if (err instanceof OpnsenseError) {
    return err;
  }
  if (TLS_CODES.has(err.code)) {
    return new OpnsenseError('tls', `HTTPS certificate refused: ${err.code}`);
  }
  return new OpnsenseError('unreachable', `OPNsense unreachable: ${err.code ?? err.message}`);
}

/**
 * @description The default transport: one HTTP(S) request, its whole body.
 * @param {object} options - `{ url, method, headers, body, rejectUnauthorized, timeoutMs, onData }`.
 * `onData(chunk, abort)` streams the body instead of collecting it.
 * @returns {Promise<{ status: number, body: string }>} The answer.
 */
function nodeRequest({ url, method, headers, body, rejectUnauthorized, timeoutMs, onData }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'http:' ? http : https;
    const req = lib.request(
      target,
      { method, headers, rejectUnauthorized, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
          }
        };
        res.on('data', (chunk) => {
          if (onData && res.statusCode === 200) {
            onData(chunk.toString('utf8'), () => {
              finish();
              req.destroy();
            });
          } else {
            chunks.push(chunk);
          }
        });
        res.on('end', finish);
        res.on('error', (err) => (done ? undefined : reject(err)));
      },
    );
    req.on('timeout', () =>
      req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
    );
    req.on('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * @description Create the OPNsense client.
 * @param {object} options - Options.
 * @param {Function} options.getConfig - `() => ({ url, apiKey, apiSecret, verifyTls })`.
 * @param {Function} [options.request] - Transport (tests): same contract as nodeRequest.
 * @param {string} [options.userAgent] - User-Agent header.
 * @returns {object} The client.
 * @example
 * const api = createOpnsenseClient({ getConfig: () => config });
 * await api.gatewayStatus();
 */
function createOpnsenseClient({ getConfig, request = nodeRequest, userAgent = 'gladys-opnsense' }) {
  /**
   * @description Call an endpoint and parse its JSON answer.
   * @param {string} method - GET or POST.
   * @param {string} path - The path under /api/.
   * @param {object} [payload] - The JSON body of a POST.
   * @param {object} [extra] - `{ timeoutMs, onData }`.
   * @returns {Promise<any>} The answer.
   */
  async function call(method, path, payload, extra = {}) {
    const { url, apiKey, apiSecret, verifyTls } = getConfig();
    if (!url || !apiKey || !apiSecret) {
      throw new OpnsenseError('auth', 'No OPNsense address or API key configured');
    }
    const body = method === 'POST' ? JSON.stringify(payload ?? {}) : undefined;
    const headers = {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
      Accept: extra.onData ? 'text/event-stream' : 'application/json',
      'User-Agent': userAgent,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    let answer;
    try {
      answer = await request({
        url: `${url}/api/${path}`,
        method,
        headers,
        body,
        rejectUnauthorized: verifyTls,
        timeoutMs: extra.timeoutMs ?? TIMEOUT_MS,
        onData: extra.onData,
      });
    } catch (err) {
      throw networkError(err);
    }
    if (answer.status !== 200) {
      throw statusError(answer.status, path);
    }
    if (extra.onData) {
      return null;
    }
    try {
      return JSON.parse(answer.body);
    } catch {
      throw new OpnsenseError('http', `OPNsense answered something else than JSON on ${path}`);
    }
  }

  const get = (path) => call('GET', path);
  const post = (path, payload, extra) => call('POST', path, payload, extra);
  const segment = (value) => encodeURIComponent(String(value));

  // "Lobby: Dashboard" grants the system reads by their literal URL: snake_case
  // since OPNsense 25.7 (system_time), camelCase before (systemTime). The router
  // takes both, the ACL only one. On a 403 the other spelling is tried, and the
  // one that answered is kept, so OPNsense logs no denial every round.
  let camelCase = false;

  /**
   * @description Read a system endpoint of the dashboard, in the spelling the ACL grants.
   * @param {string} action - The action in camelCase (systemTime).
   * @returns {Promise<any>} The answer.
   */
  async function system(action) {
    const spell = (camel) =>
      `diagnostics/system/${camel ? action : action.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`;
    try {
      return await get(spell(camelCase));
    } catch (err) {
      if (err.kind !== 'forbidden') {
        throw err;
      }
      let answer;
      try {
        answer = await get(spell(!camelCase));
      } catch {
        throw err;
      }
      camelCase = !camelCase;
      return answer;
    }
  }

  /**
   * @description The CPU usage, read from the event stream of the dashboard.
   * @returns {Promise<object|null>} The last sample (`{ total, user, ... }`), null if none.
   */
  async function cpuUsage() {
    const samples = [];
    let buffer = '';
    await call('GET', 'diagnostics/cpu_usage/stream', undefined, {
      timeoutMs: CPU_TIMEOUT_MS,
      onData: (chunk, abort) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              samples.push(JSON.parse(line.slice(5)));
            } catch {
              // A partial line: the next sample counts.
            }
          }
        }
        if (samples.length >= CPU_SAMPLES) {
          abort();
        }
      },
    });
    return samples.at(-1) ?? null;
  }

  return {
    // --- reading ---------------------------------------------------------------
    systemInformation: () => system('systemInformation'),
    systemTime: () => system('systemTime'),
    systemResources: () => system('systemResources'),
    systemDisk: () => system('systemDisk'),
    systemTemperature: () => system('systemTemperature'),
    cpuUsage,
    // GET reads the result of the last check, without contacting the mirror.
    firmwareStatus: () => get('core/firmware/status'),
    gatewayStatus: () => get('routes/gateway/status'),
    interfacesInfo: () => get('interfaces/overview/interfaces_info'),
    trafficInterface: () => get('diagnostics/traffic/interface'),
    arp: () => get('diagnostics/interface/get_arp'),
    dnsmasqLeases: () => get('dnsmasq/leases/search'),
    keaLeases: () => get('kea/leases4/search'),
    wireguardShow: () => get('wireguard/service/show'),
    services: () => get('core/service/search'),
    ruleCategories: () => get('firewall/category/search_item'),
    rules: () => get('firewall/filter/search_rule'),

    // --- commands --------------------------------------------------------------
    toggleRule: (uuid, enabled) =>
      post(`firewall/filter/toggle_rule/${segment(uuid)}/${enabled ? 1 : 0}`),
    applyFilter: () => post('firewall/filter/apply'),
    // os-wol plugin: wakes a MAC from the broadcast address of an interface.
    wake: (iface, mac) => post('wol/wol/set', { wake: { interface: iface, mac } }),
    aliasAdd: (alias, address) => post(`firewall/alias_util/add/${segment(alias)}`, { address }),
    aliasDelete: (alias, address) =>
      post(`firewall/alias_util/delete/${segment(alias)}`, { address }),
    restartService: (name, id = '') =>
      post(`core/service/restart/${segment(name)}${id ? `/${segment(id)}` : ''}`),
    // POST runs a synchronous check against the mirror before answering.
    firmwareProbe: () => post('core/firmware/status', {}, { timeoutMs: 90000 }),
    reboot: () => post('core/system/reboot'),
  };
}

export { createOpnsenseClient, OpnsenseError, nodeRequest };
