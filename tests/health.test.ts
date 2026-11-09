import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/db/store';

const probeScript = fileURLToPath(
  new URL('../scripts/healthcheck.mjs', import.meta.url),
);
const rendered =
  '<div id="root"><h1>Тестовый сайт</h1></div><script id="page-data" type="application/json">{}</script>';

async function productionFixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'passport-health-'));
  const databasePath = join(directory, 'site.sqlite');
  const seed = new Store(databasePath);
  seed.insertLead(
    'health-fixture',
    'synthetic-private-hash',
    {
      name: 'Синтетический контакт',
      phone: '+79990000000',
    },
    '2026-11-09T00:00:00.000Z',
    'contact',
  );
  seed.close();
  const child = spawn(
    process.execPath,
    ['dist/server/index.js', '--production', '--port', '0'],
    {
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        APP_ORIGIN: 'http://127.0.0.1',
        DATABASE_PATH: databasePath,
        TRUST_PROXY: '0',
        ADMIN_PASSWORD_SCRYPT: '',
        ADMIN_PASSWORD_SHA256: '',
        ADMIN_SESSION_SECRET: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise((resolve) => child.once('exit', resolve));
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      child.kill('SIGTERM');
      await stopped;
      clearTimeout(timer);
    }
    rmSync(directory, { recursive: true, force: true });
  });
  child.stderr.resume();
  const origin = await new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
      () => reject(new Error('Health fixture startup timed out.')),
      15000,
    );
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('Health fixture exited: ' + code));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const ready = output.match(/Server ready at (http:\/\/127\.0\.0\.1:\d+)/);
      if (ready) {
        clearTimeout(timer);
        resolve(ready[1]);
      }
    });
  });
  return {
    origin,
    databasePath,
    request: (path: string, options: RequestInit = {}) =>
      fetch(origin + path, { ...options, signal: AbortSignal.timeout(8000) }),
  };
}

async function probe(origin: string, ...args: string[]) {
  const child = spawn(
    process.execPath,
    [probeScript, '--origin', origin, ...args],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Probe process timed out.'));
      }, 8000);
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    },
  );
}

async function httpFixture(
  t: TestContext,
  handler: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return 'http://127.0.0.1:' + address.port;
}

test('database readiness succeeds on an empty database and fails on a closed connection', () => {
  const store = new Store(':memory:');
  assert.equal(store.isAvailable(), true);
  store.close();
  assert.equal(store.isAvailable(), false);
});

test('production readiness is public, read-only, uncached and exposes no applicant data', async (t) => {
  const { request, databasePath } = await productionFixture(t);
  const observer = new DatabaseSync(databasePath);
  try {
    const before = observer.prepare('PRAGMA data_version').get();
    for (let index = 0; index < 3; index++) {
      const response = await request('/healthz');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.equal(response.headers.get('set-cookie'), null);
      assert.deepEqual(await response.json(), { ok: true });
    }
    assert.deepEqual(observer.prepare('PRAGMA data_version').get(), before);
    assert.equal(
      observer.prepare('SELECT COUNT(*) AS count FROM leads').get()!.count,
      1,
    );
    const head = await request('/healthz/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const response = await request('/healthz', { method });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
      assert.deepEqual(await response.json(), { ok: false });
    }
  } finally {
    observer.close();
  }
});

test('missing storage tables produce 503 without database paths or SQL diagnostics', async (t) => {
  const { request, databasePath } = await productionFixture(t);
  const writer = new DatabaseSync(databasePath);
  try {
    writer.exec('DROP TABLE article_slugs');
  } finally {
    writer.close();
  }
  const response = await request('/healthz');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: false });
});

test('schema drift is unhealthy and readiness recovers after the database is repaired', async (t) => {
  const { request, databasePath } = await productionFixture(t);
  const writer = new DatabaseSync(databasePath);
  try {
    writer.exec('PRAGMA user_version=999');
    assert.equal((await request('/healthz')).status, 503);
    writer.exec('PRAGMA user_version=4');
    assert.equal((await request('/healthz')).status, 200);
  } finally {
    writer.close();
  }
});

test('probe checks the real production endpoint and rendered homepage', async (t) => {
  const { origin, databasePath } = await productionFixture(t);
  assert.deepEqual(await probe(origin), {
    code: 0,
    stdout: 'HEALTHCHECK_OK\n',
    stderr: '',
  });
  const writer = new DatabaseSync(databasePath);
  try {
    writer.exec('DROP TABLE article_slugs');
  } finally {
    writer.close();
  }
  const failure = await probe(origin);
  assert.equal(failure.code, 1);
  assert.equal(failure.stderr, 'HEALTHCHECK_FAILED\n');
  assert.equal(failure.stdout, '');
});

test('an unhealthy or malformed readiness response never produces success or leaks its body', async (t) => {
  let status = 503;
  let body = '{"error":"synthetic-private-diagnostic"}';
  const hits: string[] = [];
  const origin = await httpFixture(t, (request, response) => {
    hits.push(request.url!);
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(body);
  });
  for (const candidate of [
    { status: 503, body },
    { status: 200, body: '{"ok":false}' },
    { status: 200, body: '{"ok":"true"}' },
    {
      status: 200,
      body: '{"ok":true,"private":"synthetic-private-diagnostic"}',
    },
    { status: 200, body: 'not-json' },
  ]) {
    ({ status, body } = candidate);
    const result = await probe(origin);
    assert.equal(result.code, 1);
    assert.equal(result.stdout + result.stderr, 'HEALTHCHECK_FAILED\n');
  }
  assert.deepEqual(hits, Array(5).fill('/healthz'));
});

test('probe refuses redirects instead of accepting a login page or another host', async (t) => {
  const hits: string[] = [];
  const origin = await httpFixture(t, (request, response) => {
    hits.push(request.url!);
    response.writeHead(302, { Location: '/unexpected' });
    response.end();
  });
  assert.equal((await probe(origin)).code, 1);
  assert.deepEqual(hits, ['/healthz']);
});

test('a good database cannot mask a broken or unrendered homepage', async (t) => {
  let status = 200;
  let type = 'text/html';
  let body = rendered;
  const origin = await httpFixture(t, (request, response) => {
    if (request.url === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"ok":true}');
    } else {
      response.writeHead(status, { 'Content-Type': type });
      response.end(body);
    }
  });
  assert.equal((await probe(origin)).code, 0);
  for (const candidate of [
    { status: 503, type: 'text/html', body: rendered },
    { status: 200, type: 'application/json', body: rendered },
    {
      status: 200,
      type: 'text/html',
      body: '<div id="root"><!--app-html--></div>',
    },
    { status: 200, type: 'text/html', body: '<h1>Generic error page</h1>' },
  ]) {
    ({ status, type, body } = candidate);
    assert.equal((await probe(origin)).code, 1);
  }
});

test('probe bounds response sizes and aborts stalled bodies within its deadline', async (t) => {
  let mode = 'oversize-json';
  const origin = await httpFixture(t, (request, response) => {
    if (request.url === '/healthz') {
      if (mode === 'stalled-headers') return;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (mode === 'oversize-json') response.end(' '.repeat(1025));
      else if (mode === 'stalled-body') {
        response.flushHeaders();
        response.write('{');
      } else response.end('{"ok":true}');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(rendered + ' '.repeat(2 * 1024 * 1024));
    }
  });
  assert.equal((await probe(origin)).code, 1);
  mode = 'oversize-html';
  assert.equal((await probe(origin)).code, 1);
  mode = 'stalled-body';
  assert.equal((await probe(origin, '--timeout-ms', '200')).code, 1);
  mode = 'stalled-headers';
  assert.equal((await probe(origin, '--timeout-ms', '200')).code, 1);
});

test('invalid origins and deadlines fail before making any network request', async (t) => {
  let hits = 0;
  const origin = await httpFixture(t, (_request, response) => {
    hits++;
    response.end();
  });
  for (const value of [
    origin + '/private',
    origin + '?secret=value',
    origin + '#fragment',
    origin.replace('http://', 'http://name:secret@'),
    'file:///tmp/health',
  ])
    assert.equal((await probe(value)).code, 1);
  for (const value of ['0', '99', '30001', '1e3', '-1'])
    assert.equal((await probe(origin, '--timeout-ms', value)).code, 1);
  assert.equal(hits, 0);
});
