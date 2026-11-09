import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server/application';
import type { Config } from '../server/config';
import { Store } from '../server/db/store';
import { Diagnostics, type FailureEvent } from '../server/diagnostics';
import { storageLimits } from '../src/lib/storage';
import { pdf } from './fixtures/documents';

const privateMarker = 'SYNTHETIC_PRIVATE_DO_NOT_LOG';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function expectPrivate(values: unknown[]) {
  assert.ok(!JSON.stringify(values).includes(privateMarker));
}

async function fixture(t: TestContext) {
  const events: FailureEvent[] = [];
  t.mock.method(console, 'error', (line: string) => {
    assert.equal(typeof line, 'string');
    assert.ok(!line.includes('\n'));
    events.push(JSON.parse(line) as FailureEvent);
  });
  const config: Config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    trustProxy: 0,
    adminPasswordHash: '',
    adminSessionSecret: '',
  };
  const application = await createApplication(config);
  const server = application.app.listen(0, '127.0.0.1');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await application.close();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = 'http://127.0.0.1:' + address.port;
  config.appOrigin = origin;
  const request = (path: string, options: RequestInit = {}) =>
    fetch(origin + path, { ...options, signal: AbortSignal.timeout(5000) });
  const lead = (overrides: Record<string, unknown> = {}) => ({
    requestId: randomUUID(),
    source: 'contact',
    name: privateMarker,
    phone: '+79990000000',
    email: 'synthetic@example.invalid',
    consent: true,
    website: '',
    startedAt: Date.now() - 5000,
    pageUrl: origin + '/?utm_source=' + privateMarker,
    utm: { utm_source: privateMarker },
    comment: privateMarker,
    ...overrides,
  });
  const submit = (data: unknown) =>
    request('/api/leads', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: 'private=' + privateMarker,
        'X-Incident-ID': privateMarker,
      },
      body: JSON.stringify(data),
    });
  return { ...application, events, origin, request, lead, submit };
}

test('diagnostics classifies real Node SQLite errors, extended codes and filesystem failures', () => {
  const events: FailureEvent[] = [];
  const diagnostics = new Diagnostics((line) => events.push(JSON.parse(line)));
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(
      'PRAGMA page_size=512; CREATE TABLE test (bytes BLOB); PRAGMA max_page_count=4; BEGIN IMMEDIATE;',
    );
    assert.throws(
      () =>
        database
          .prepare('INSERT INTO test VALUES (?)')
          .run(Buffer.alloc(10000)),
      (error: unknown) => {
        diagnostics.failure('lead_submission', error);
        return true;
      },
    );
    assert.equal(database.isTransaction, false);
  } finally {
    database.close();
  }
  assert.equal(events[0].code, 'SQLITE_FULL');
  diagnostics.failure('lead_submission', {
    code: 'ERR_SQLITE_ERROR',
    errcode: 517,
    errstr: privateMarker,
  });
  diagnostics.failure('lead_submission', {
    code: 'ENOSPC',
    path: privateMarker,
  });
  diagnostics.failure('lead_submission', { code: 'ERR_INVALID_STATE' });
  assert.deepEqual(
    events.map((event) => event.code),
    ['SQLITE_FULL', 'SQLITE_BUSY', 'ENOSPC', 'ERR_INVALID_STATE'],
  );
  expectPrivate(events);
});

test('automatic SQLite rollback preserves the original failure code and allows an identical retry', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'passport-diagnostics-'));
  const filename = join(directory, 'site.sqlite');
  const store = new Store(filename);
  const database = new DatabaseSync(filename);
  t.after(() => {
    database.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  database.exec(
    "CREATE TRIGGER diagnostic_abort BEFORE INSERT ON leads BEGIN SELECT RAISE(ROLLBACK, '" +
      privateMarker +
      "'); END;",
  );
  const events: FailureEvent[] = [];
  const diagnostics = new Diagnostics((line) => events.push(JSON.parse(line)));
  const write = () =>
    store.insertLead(
      'automatic-rollback',
      'synthetic-hash',
      { comment: privateMarker },
      '2026-11-09T12:00:00.000Z',
      'contact',
    );
  assert.throws(write, (error: unknown) => {
    diagnostics.failure('lead_submission', error);
    return true;
  });
  assert.equal(events[0].code, 'SQLITE_CONSTRAINT');
  assert.equal(store.listLeadPage({ limit: 1 }).total, 0);
  expectPrivate(events);
  database.exec('DROP TRIGGER diagnostic_abort');
  write();
  assert.equal(store.findLeadHash('automatic-rollback'), 'synthetic-hash');
  assert.equal(store.listLeadPage({ limit: 1 }).total, 1);
});

test('diagnostics emits bounded safe fields and never serializes thrown objects or untrusted codes', () => {
  const lines: string[] = [];
  const diagnostics = new Diagnostics((line) => lines.push(line));
  const error = Object.assign(new Error(privateMarker), {
    code: 'SQLITE_FULL\n' + privateMarker,
    name: privateMarker,
    path: privateMarker,
    cause: { password: privateMarker },
    toJSON() {
      throw new Error(privateMarker);
    },
  });
  const incidentId = diagnostics.failure('lead_submission', error);
  for (const value of [
    null,
    privateMarker,
    {
      get code() {
        throw error;
      },
    },
  ])
    diagnostics.failure('lead_submission', value);
  const events = lines.map((line) => JSON.parse(line) as FailureEvent);
  assert.match(incidentId, uuid);
  assert.equal(events[0].incidentId, incidentId);
  assert.equal(new Set(events.map((event) => event.incidentId)).size, 4);
  assert.ok(events.every((event) => event.code === 'UNKNOWN'));
  assert.deepEqual(
    Object.keys(events[0]).sort(),
    [
      'timestamp',
      'level',
      'event',
      'operation',
      'code',
      'incidentId',
      'operationFailuresTotal',
      'codeFailuresTotal',
    ].sort(),
  );
  expectPrivate(lines);
  assert.deepEqual(
    events.map((event) => event.codeFailuresTotal),
    [1, 2, 3, 4],
  );
});

test('diagnostics counts failed log writes without throwing and isolates process counters', () => {
  const diagnostics = new Diagnostics(() => {
    throw new Error(privateMarker);
  });
  assert.match(
    diagnostics.failure('lead_submission', { code: 'ENOSPC' }),
    uuid,
  );
  assert.match(
    diagnostics.failure('lead_submission', { code: 'ENOSPC' }),
    uuid,
  );
  diagnostics.failure('http_request', new Error(privateMarker));
  assert.deepEqual(diagnostics.snapshot(), {
    operationFailuresTotal: { lead_submission: 2, http_request: 1 },
    codeFailuresTotal: {
      'lead_submission:ENOSPC': 2,
      'http_request:UNKNOWN': 1,
    },
    logWriteFailuresTotal: 3,
  });
  assert.deepEqual(new Diagnostics().snapshot().operationFailuresTotal, {
    lead_submission: 0,
    http_request: 0,
  });
});

test('failed lead writes emit one correlated safe event and an identical retry still saves only once', async (t) => {
  const f = await fixture(t);
  const data = f.lead();
  const failure = t.mock.method(f.store, 'insertLead', () => {
    throw Object.assign(new Error(privateMarker), {
      code: 'ERR_SQLITE_ERROR',
      errcode: 13,
      path: privateMarker,
    });
  });
  const response = await f.submit(data);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const incidentId = response.headers.get('x-incident-id');
  assert.match(incidentId!, uuid);
  const body = await response.json();
  expectPrivate([body, ...response.headers]);
  assert.equal(body.ok, undefined);
  assert.equal(f.store.listLeadPage({ limit: 1 }).total, 0);
  assert.equal((await f.request('/healthz')).status, 200);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].incidentId, incidentId);
  assert.equal(f.events[0].code, 'SQLITE_FULL');
  assert.equal(f.events[0].operation, 'lead_submission');
  assert.equal(f.events[0].operationFailuresTotal, 1);
  expectPrivate(f.events);
  assert.ok(!JSON.stringify(f.events).includes(data.requestId));
  assert.ok(!JSON.stringify(f.events).includes(data.phone));
  assert.ok(!JSON.stringify(f.events).includes(data.email));
  failure.mock.restore();
  const saved = await f.submit(data);
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { ok: true, id: data.requestId });
  assert.equal(saved.headers.get('x-incident-id'), null);
  assert.equal((await f.submit(data)).status, 200);
  assert.equal((await f.submit({ ...data, comment: 'Changed' })).status, 409);
  assert.equal(f.store.listLeadPage({ limit: 1 }).total, 1);
  assert.equal(f.events.length, 1);
  assert.equal(
    f.diagnostics.snapshot().operationFailuresTotal.lead_submission,
    1,
  );
});

test('lead failures before multipart parsing use the same diagnostics without leaking request metadata', async (t) => {
  const f = await fixture(t);
  t.mock.method(f.store, 'consumeRateLimit', () => {
    throw Object.assign(new Error(privateMarker), { code: 'ENOSPC' });
  });
  const form = new FormData();
  form.set('data', JSON.stringify(f.lead()));
  const response = await f.request('/api/leads/?private=' + privateMarker, {
    method: 'POST',
    headers: { Origin: f.origin, Cookie: privateMarker },
    body: form,
  });
  assert.equal(response.status, 503);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].operation, 'lead_submission');
  assert.equal(f.events[0].code, 'ENOSPC');
  assert.equal(response.headers.get('x-incident-id'), f.events[0].incidentId);
  expectPrivate([f.events, await response.text()]);
});

test('attachment quota exhaustion is observable and keeps stored attachments intact', async (t) => {
  const f = await fixture(t);
  const attachmentId = randomUUID();
  // Synthetic accounting fills the quota without allocating 512 MiB in a test.
  f.store.insertLead(
    'seed',
    'seed-hash',
    {},
    new Date().toISOString(),
    'contact',
    [
      {
        id: attachmentId,
        kind: 'passport',
        name: privateMarker + '.pdf',
        size: storageLimits.attachments,
        contentType: 'application/pdf',
        sha256: createHash('sha256').update(pdf).digest('hex'),
        bytes: pdf,
      },
    ],
  );
  const data = f.lead({
    pageUrl: f.origin + '/aktualizaciya-pasporta-dostupnosti/',
    service: 'update',
  });
  const form = new FormData();
  form.set('data', JSON.stringify(data));
  form.append(
    'attachment:passport',
    new File([new Uint8Array(pdf)], privateMarker + '.pdf'),
  );
  const response = await f.request('/api/leads', {
    method: 'POST',
    headers: { Origin: f.origin },
    body: form,
  });
  assert.equal(response.status, 503);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].code, 'ATTACHMENT_QUOTA');
  assert.equal(response.headers.get('x-incident-id'), f.events[0].incidentId);
  assert.equal(f.store.findLeadHash(data.requestId), undefined);
  assert.equal(f.store.listLeadPage({ limit: 1 }).total, 1);
  assert.deepEqual(
    Buffer.from(f.store.getAttachment(attachmentId)!.bytes),
    pdf,
  );
  expectPrivate(f.events);
});

test('validation, malformed bodies, origin checks and rate limits do not produce server failure events', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.submit(f.lead({ consent: false }))).status, 400);
  assert.equal(
    (
      await f.request('/api/leads', {
        method: 'POST',
        headers: {
          Origin: 'https://example.invalid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(f.lead()),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/api/leads', {
        method: 'POST',
        headers: { Origin: f.origin, 'Content-Type': 'application/json' },
        body: '{invalid',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request('/api/leads', {
        method: 'POST',
        headers: { Origin: f.origin, 'Content-Type': 'application/json' },
        body: ' '.repeat(600000),
      })
    ).status,
    413,
  );
  const form = new FormData();
  form.set('data', '{invalid');
  assert.equal(
    (
      await f.request('/api/leads', {
        method: 'POST',
        headers: { Origin: f.origin },
        body: form,
      })
    ).status,
    400,
  );
  t.mock.method(f.store, 'consumeRateLimit', () => false);
  assert.equal((await f.submit(f.lead())).status, 429);
  assert.equal(f.events.length, 0);
  assert.equal(
    f.diagnostics.snapshot().operationFailuresTotal.lead_submission,
    0,
  );
});

test('the common server error handler uses safe codes instead of raw paths and exception messages', async (t) => {
  const f = await fixture(t);
  t.mock.method(f.store.articles.queries, 'publishedSlugs', () => {
    throw new Error(privateMarker);
  });
  const response = await f.request('/sitemap.xml?private=' + privateMarker);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-incident-id'), f.events[0].incidentId);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].code, 'UNKNOWN');
  assert.equal(f.events[0].operation, 'http_request');
  expectPrivate([f.events, await response.text()]);
});
