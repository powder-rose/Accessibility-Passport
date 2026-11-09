import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { Store } from '../server/db/store';
import { encodeLeadCursor, parseLeadQuery } from '../server/db/lead-pagination';
import { createApplication } from '../server/application';
import type { LeadPage } from '../src/lib/leads';

const timestamp = '2026-11-01T10:00:00.000Z';

function seed(store: Store, count: number) {
  for (let index = 0; index < count; index++) {
    const id = 'lead-' + String(index).padStart(4, '0');
    store.insertLead(
      id,
      'hash-' + id,
      {
        name: 'Архивная заявка ' + index,
        phone: '+79990000000',
        sourceLabel: 'Тест истории',
      },
      timestamp,
      'contact',
    );
  }
}

function collect(store: Store, limit: number) {
  const ids: string[] = [];
  let nextCursor: string | null = null;
  do {
    const url = new URL('https://example.invalid/?limit=' + limit);
    if (nextCursor) url.searchParams.set('cursor', nextCursor);
    const page = store.listLeadPage(parseLeadQuery(url));
    assert.ok(page.leads.length <= limit);
    ids.push(...page.leads.map((lead) => lead.id));
    nextCursor = page.nextCursor;
    assert.ok(ids.length <= page.total, 'pagination must terminate');
  } while (nextCursor);
  return ids;
}

test('all 103 leads remain reachable with stable ordering when timestamps match', () => {
  const store = new Store(':memory:');
  try {
    seed(store, 103);
    assert.equal(
      store.listLeads().length,
      100,
      'legacy list contract remains bounded',
    );
    const ids = collect(store, 25);
    assert.equal(ids.length, 103);
    assert.equal(new Set(ids).size, 103);
    assert.deepEqual(ids, [...ids].sort().reverse());
    assert.equal(ids.at(-1), 'lead-0000', 'oldest archived lead is accessible');
    assert.equal(store.listLeadPage({ limit: 25 }).total, 103);
  } finally {
    store.close();
  }
});

test('new arrivals do not shift later pages and appear after refreshing the first page', () => {
  const store = new Store(':memory:');
  try {
    seed(store, 60);
    const first = store.listLeadPage({ limit: 25 });
    assert.ok(first.nextCursor);
    store.insertLead(
      'newer-date',
      'new-date',
      { name: 'Новая дата' },
      '2026-11-02T10:00:00.000Z',
      'contact',
    );
    store.insertLead(
      'newer-id',
      'new-id',
      { name: 'То же время' },
      timestamp,
      'contact',
    );
    const second = store.listLeadPage(
      parseLeadQuery(
        new URL('https://example.invalid/?limit=25&cursor=' + first.nextCursor),
      ),
    );
    assert.equal(second.total, 62);
    assert.equal(second.leads[0].id, 'lead-0034');
    assert.ok(
      second.leads.every(
        (lead) => !first.leads.some((old) => old.id === lead.id),
      ),
    );
    assert.equal(store.listLeadPage({ limit: 25 }).leads[0].id, 'newer-date');
  } finally {
    store.close();
  }
});

test('empty lists, exact full pages, and the end of history have no next cursor', () => {
  const store = new Store(':memory:');
  try {
    assert.deepEqual(store.listLeadPage({ limit: 25 }), {
      leads: [],
      total: 0,
      nextCursor: null,
    });
    seed(store, 25);
    const page = store.listLeadPage({ limit: 25 });
    assert.equal(page.leads.length, 25);
    assert.equal(page.nextCursor, null);
    assert.deepEqual(
      store.listLeadPage({
        limit: 25,
        cursor: { createdAt: timestamp, id: 'lead-0000' },
      }),
      { leads: [], total: 25, nextCursor: null },
    );
    for (const limit of [0, -1, 101, 1.5, NaN])
      assert.throws(() => store.listLeadPage({ limit }));
  } finally {
    store.close();
  }
});

test('paginated history survives reopening the existing database and preserves private attachments', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'osi-lead-history-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'site.sqlite');
  let store = new Store(filename);
  try {
    seed(store, 103);
    const bytes = Buffer.from('private-test-document');
    store.insertLead(
      'legacy-with-file',
      'hash-with-file',
      {
        name: 'Старая заявка с файлом',
        attachments: [
          { id: 'test-attachment', name: 'old.txt', size: bytes.length },
        ],
      },
      '2020-01-01T00:00:00.000Z',
      'contact',
      [
        {
          id: 'test-attachment',
          kind: 'passport',
          name: 'old.txt',
          size: bytes.length,
          contentType: 'text/plain',
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes,
        },
      ],
    );
    store.close();
    store = new Store(filename);
    const ids = collect(store, 25);
    assert.equal(ids.length, 104);
    assert.equal(ids.at(-1), 'legacy-with-file');
    assert.deepEqual(
      Buffer.from(store.getAttachment('test-attachment')!.bytes),
      bytes,
    );
    assert.equal(store.listLeadPage({ limit: 100 }).total, 104);
  } finally {
    store.close();
  }
});

test('cursor values are parameterized and cannot modify or bypass the lead query', () => {
  const store = new Store(':memory:');
  try {
    seed(store, 3);
    const cursor = { createdAt: "' OR 1=1; DELETE FROM leads; --", id: "'" };
    const parsed = parseLeadQuery(
      new URL('https://example.invalid/?cursor=' + encodeLeadCursor(cursor)),
    );
    assert.deepEqual(parsed.cursor, cursor);
    assert.equal(store.listLeadPage(parsed).leads.length, 0);
    assert.equal(store.listLeadPage({ limit: 25 }).total, 3);
  } finally {
    store.close();
  }
});

async function apiFixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'osi-lead-api-'));
  const password = 'synthetic-pagination-test-password';
  const config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: join(directory, 'site.sqlite'),
    trustProxy: 0,
    appOrigin: '',
    adminPasswordHash: createHash('sha256').update(password).digest('hex'),
    adminSessionSecret: 'synthetic-lead-history-test-secret-32-characters',
  };
  const application = await createApplication(config);
  seed(application.store, 103);
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = application.app.listen(0, '127.0.0.1', () =>
      resolve(listener),
    );
    listener.once('error', reject);
  });
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await application.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = 'http://127.0.0.1:' + address.port;
  config.appOrigin = origin;
  const request = (path: string, options: RequestInit = {}) =>
    fetch(origin + path, { ...options, signal: AbortSignal.timeout(8000) });
  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  return { request, cookie, store: application.store };
}

test('HTTP pagination keeps the legacy leads array and reaches records beyond the first 100', async (t) => {
  const { request, cookie } = await apiFixture(t);
  const headers = { Cookie: cookie };
  const response = await request('/api/admin/leads', { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  const first = (await response.json()) as LeadPage;
  assert.equal(first.leads.length, 100);
  assert.equal(first.total, 103);
  assert.ok(first.nextCursor);
  const next = await request('/api/admin/leads?cursor=' + first.nextCursor, {
    headers,
  });
  const last = (await next.json()) as LeadPage;
  assert.equal(last.leads.length, 3);
  assert.equal(last.total, 103);
  assert.equal(last.nextCursor, null);
  assert.equal(
    new Set([...first.leads, ...last.leads].map((lead) => lead.id)).size,
    103,
  );
  assert.equal(last.leads.at(-1)!.payload.name, 'Архивная заявка 0');
  const small = await request('/api/admin/leads?limit=25', { headers });
  assert.equal(((await small.json()) as LeadPage).leads.length, 25);
  assert.equal((await request('/api/admin/session', { headers })).status, 200);
});

test('unauthenticated and expired sessions expose no history or pagination metadata', async (t) => {
  const { request, cookie } = await apiFixture(t);
  const invalidSessions: HeadersInit[] = [
    {},
    { Cookie: 'osi_admin=0.' + 'a'.repeat(64) },
  ];
  for (const headers of invalidSessions) {
    const response = await request('/api/admin/leads?limit=0&cursor=bad', {
      headers,
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Нет доступа.' });
  }
  const first = await request('/api/admin/leads?limit=1', {
    headers: { Cookie: cookie },
  });
  const { nextCursor } = (await first.json()) as LeadPage;
  const response = await request(
    '/api/admin/leads?limit=1&cursor=' + nextCursor,
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Нет доступа.' });
});

test('invalid pagination receives 400 without changing saved records', async (t) => {
  const { request, cookie, store } = await apiFixture(t);
  const encoded = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const queries = [
    'limit=0',
    'limit=-1',
    'limit=101',
    'limit=1.5',
    'limit=1e2',
    'limit=01',
    'limit=',
    'limit=1&limit=2',
    'cursor=',
    'cursor=%25',
    'cursor=a',
    'cursor=' + 'a'.repeat(513),
    'cursor=bad&cursor=bad',
    ...[
      null,
      [],
      'bad',
      {},
      { createdAt: timestamp },
      { createdAt: timestamp, id: 1 },
      { createdAt: timestamp, id: 'x'.repeat(129) },
      { createdAt: timestamp, id: 'lead-0001', extra: 'not-allowed' },
    ].map((value) => 'cursor=' + encoded(value)),
  ];
  for (const query of queries) {
    const response = await request('/api/admin/leads?' + query, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), {
      error: 'Некорректные параметры списка заявок.',
    });
  }
  assert.equal(store.listLeadPage({ limit: 25 }).total, 103);
});
