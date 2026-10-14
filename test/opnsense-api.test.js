// The OPNsense client: errors, authentication, the CPU stream. One test
// starts a local HTTP server on 127.0.0.1 to check the real transport
// (nodeRequest): no outside network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { createOpnsenseClient, nodeRequest } from '../src/opnsense-api.js';
import { opnsense } from './helpers/fixtures.js';

const config = { url: 'https://192.168.1.1', apiKey: 'key', apiSecret: 'secret', verifyTls: false };

test('errors carry a kind the app turns into a message', async () => {
  const cases = [
    [401, 'auth'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [500, 'http'],
    ['ECONNREFUSED', 'unreachable'],
  ];
  for (const [status, kind] of cases) {
    const request = opnsense({ statuses: { 'routes/gateway/status': status } });
    const api = createOpnsenseClient({ getConfig: () => config, request });
    await assert.rejects(api.gatewayStatus(), (err) => err.kind === kind, String(status));
  }
  const tls = async () => {
    throw Object.assign(new Error('self-signed'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  };
  const api = createOpnsenseClient({ getConfig: () => config, request: tls });
  await assert.rejects(api.systemTime(), (err) => err.kind === 'tls');
});

test('no request without an address and a key pair; the secret never shows in errors', async () => {
  const request = opnsense();
  const api = createOpnsenseClient({ getConfig: () => ({ ...config, apiSecret: '' }), request });
  await assert.rejects(api.systemTime(), (err) => err.kind === 'auth');
  assert.equal(request.calls.length, 0);
  const failing = createOpnsenseClient({
    getConfig: () => config,
    request: opnsense({ statuses: { 'diagnostics/system/system_time': 401 } }),
  });
  await assert.rejects(failing.systemTime(), (err) => !err.message.includes('secret'));
});

test('commands are POSTs with a JSON body, path segments encoded', async () => {
  const request = opnsense();
  const api = createOpnsenseClient({ getConfig: () => config, request });
  await api.aliasAdd('kids', '192.168.1.5');
  await api.toggleRule('6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b', false);
  await api.restartService('openvpn', 'server 1');
  assert.deepEqual(
    request.calls.map((call) => [call.method, call.path, call.body]),
    [
      ['POST', 'firewall/alias_util/add/kids', { address: '192.168.1.5' }],
      ['POST', 'firewall/filter/toggle_rule/6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b/0', {}],
      ['POST', 'core/service/restart/openvpn/server%201', {}],
    ],
  );
  assert.equal(request.calls[0].headers['Content-Type'], 'application/json');
});

test('the CPU usage is the second sample of the stream (the first one is since boot)', async () => {
  const api = createOpnsenseClient({ getConfig: () => config, request: opnsense() });
  assert.deepEqual(await api.cpuUsage(), { total: 9, user: 5, nice: 0, sys: 3, intr: 1, idle: 91 });
});

test('nodeRequest: Basic auth, JSON answer, and a stream cut after two samples', async (t) => {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push([req.method, req.url, req.headers.authorization]);
    if (req.url === '/api/diagnostics/cpu_usage/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      let n = 0;
      const timer = setInterval(() => {
        n += 1;
        res.write(`event: message\ndata: {"total":${n}}\n\n`);
      }, 20);
      res.on('close', () => clearInterval(timer));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"items":[]}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const local = { ...config, url: `http://127.0.0.1:${server.address().port}` };
  const api = createOpnsenseClient({ getConfig: () => local, request: nodeRequest });
  assert.deepEqual(await api.gatewayStatus(), { items: [] });
  assert.deepEqual(await api.cpuUsage(), { total: 2 });
  assert.equal(seen[0][2], `Basic ${Buffer.from('key:secret').toString('base64')}`);
});

test('nodeRequest: a closed port is unreachable', async () => {
  const api = createOpnsenseClient({
    getConfig: () => ({ ...config, url: 'http://127.0.0.1:9' }),
    request: nodeRequest,
  });
  await assert.rejects(api.systemTime(), (err) => err.kind === 'unreachable');
});
