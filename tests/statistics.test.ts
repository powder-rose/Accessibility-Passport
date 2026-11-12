import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Store } from '../server/db/store';
import { initialSchema, attachmentSchema } from '../server/db/migrations';
import { articleSchema } from '../server/articles/migration';
import { authSchema } from '../server/auth/migration';
import { AdminRepository } from '../server/auth/repository';
import { createApplication } from '../server/application';
import {
  createBackup,
  restoreBackup,
} from '../scripts/lib/database-backup.mjs';
import { visitLifetime, type PageView } from '../src/features/statistics/model';
import LeadList from '../src/components/admin/LeadList';
import { presentLead } from '../src/components/admin/lead-presentation';

const now = Date.parse('2026-11-11T10:00:00.000Z');
const view = (path = '/', token: string = randomUUID()): PageView => ({
  id: randomUUID(),
  token,
  path,
});

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'passport-statistics-'));
  const filename = join(directory, 'site.sqlite');
  const store = new Store(filename);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, filename, store };
}

test('statistics count the entire lead history and use Moscow calendar boundaries', (t) => {
  const { store } = fixture(t);
  for (let index = 0; index < 103; index++)
    store.insertLead(
      'lead-' + index,
      'hash-' + index,
      { name: 'Private test contact' },
      '2026-11-11T00:00:00.000Z',
      index % 2 ? 'express' : 'contact',
    );
  store.insertLead(
    'previous-utc-day',
    'hash',
    {},
    '2026-11-10T21:00:00.000Z',
    'contact',
  );
  store.insertLead(
    'previous-moscow-day',
    'hash',
    {},
    '2026-11-10T20:59:59.999Z',
    'contact',
  );
  store.insertLead('old', 'hash', {}, '2020-01-01T00:00:00.000Z', 'contact');
  assert.equal(store.listLeadPage({ limit: 25 }).leads.length, 25);
  const report = store.statistics.report(7, now);
  assert.deepEqual(report.period, {
    days: 7,
    from: '2026-11-05',
    to: '2026-11-11',
  });
  assert.equal(report.leads.total, 106);
  assert.equal(report.leads.today, 104);
  assert.equal(report.leads.period, 105);
  assert.equal(
    report.leads.sources.reduce((sum, source) => sum + source.count, 0),
    105,
  );
  assert.equal(report.traffic.daily.at(-1)!.leads, 104);
  assert.equal(report.traffic.daily.at(-2)!.leads, 1);
  assert.equal(report.traffic.daily.length, 7);
  assert.equal(report.traffic.visits, 0);
  assert.throws(() => store.statistics.report(100 as 7, now), RangeError);
});

test('views deduplicate, keep the first visit source and start a new visit after inactivity', (t) => {
  const { store } = fixture(t);
  const first = view();
  assert.equal(store.traffic.record(first, 'campaign:yandex', now), true);
  assert.equal(store.traffic.record(first, 'direct', now + 10), false);
  store.traffic.record(view('/blog/', first.token), 'direct', now + 1000);
  let report = store.statistics.report(7, now);
  assert.equal(report.traffic.visits, 1);
  assert.equal(report.traffic.pageviews, 2);
  assert.deepEqual(
    report.traffic.sources.map((row) => ({ ...row })),
    [{ source: 'campaign:yandex', visits: 1 }],
  );
  store.traffic.record(
    view('/', first.token),
    'direct',
    now + 1000 + visitLifetime,
  );
  report = store.statistics.report(7, now);
  assert.equal(report.traffic.visits, 2);
  assert.equal(report.traffic.pageviews, 3);
  assert.deepEqual(
    { ...report.traffic.pages.find((page) => page.path === '/') },
    { path: '/', pageviews: 2, visits: 2 },
  );
});

test('a failed pageview does not leave a phantom visit, and obsolete traffic expires', (t) => {
  const { store, filename } = fixture(t);
  const database = new DatabaseSync(filename);
  try {
    database.exec(
      "CREATE TRIGGER reject_view BEFORE INSERT ON analytics_pageviews BEGIN SELECT RAISE(ABORT,'synthetic-view-failure'); END",
    );
    assert.throws(
      () => store.traffic.record(view(), 'direct', now),
      /synthetic-view-failure/,
    );
    assert.equal(store.statistics.report(7, now).traffic.visits, 0);
    database.exec('DROP TRIGGER reject_view');
    const old = view();
    store.traffic.record(old, 'old.example', now - 91 * 86400000);
    const current = view();
    store.traffic.record(current, 'direct', now);
    assert.equal(
      database
        .prepare('SELECT COUNT(*) AS count FROM analytics_pageviews')
        .get()!.count,
      1,
    );
    assert.equal(
      database.prepare('SELECT COUNT(*) AS count FROM analytics_visits').get()!
        .count,
      1,
    );
    assert.equal(store.statistics.report(90, now).traffic.pageviews, 1);
    const row = database.prepare('SELECT * FROM analytics_visits').get()!;
    assert.doesNotMatch(JSON.stringify(row), new RegExp(current.token));
  } finally {
    database.close();
  }
});

test('schema four migrates without changing saved leads, files, credentials or sessions', (t) => {
  const directory = mkdtempSync(
    join(tmpdir(), 'passport-statistics-migration-'),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'site.sqlite');
  const database = new DatabaseSync(filename);
  database.exec(
    [
      initialSchema,
      attachmentSchema,
      articleSchema,
      authSchema,
      'PRAGMA user_version=4',
    ].join(';'),
  );
  database
    .prepare('INSERT INTO leads VALUES (?,?,?,?,?,?)')
    .run(
      'saved',
      'saved-hash',
      '{"name":"Saved client"}',
      '2026-11-11T00:00:00.000Z',
      'contact',
      'new',
    );
  const bytes = Buffer.from('private saved attachment');
  database
    .prepare('INSERT INTO lead_attachments VALUES (?,?,?,?,?,?,?,?)')
    .run(
      'file',
      'saved',
      'passport',
      'saved.pdf',
      bytes.length,
      'application/pdf',
      'synthetic-hash',
      bytes,
    );
  const auth = new AdminRepository(database);
  auth.configure('saved-source', 'saved-password-hash');
  const credential = auth.credential('saved-source')!;
  auth.createSession(
    'saved-source',
    credential,
    'saved-session',
    'saved-verifier',
    now + 60000,
    now,
  );
  database.close();
  const store = new Store(filename);
  try {
    assert.equal(store.isAvailable(), true);
    assert.equal(store.findLeadHash('saved'), 'saved-hash');
    assert.equal(store.listLeads()[0].payload.name, 'Saved client');
    assert.deepEqual(Buffer.from(store.getAttachment('file')!.bytes), bytes);
    assert.deepEqual(store.auth.credential('saved-source'), credential);
    assert.ok(store.auth.session('saved-source', 'saved-session', now));
    assert.equal(store.statistics.report(30, now).leads.total, 1);
    assert.equal(store.statistics.report(30, now).traffic.pageviews, 0);
  } finally {
    store.close();
  }
});

test('traffic survives reopening and verified backup/restore alongside the business data', async (t) => {
  const { directory, filename, store } = fixture(t);
  store.insertLead(
    'saved',
    'hash',
    { name: 'Saved client' },
    new Date(now).toISOString(),
    'contact',
  );
  store.traffic.record(view('/'), 'campaign:yandex', now);
  store.traffic.record(view('/blog/'), 'direct', now + 1);
  const expected = store.statistics.report(30, now);
  const reopened = new Store(filename);
  try {
    assert.deepEqual(reopened.statistics.report(30, now), expected);
  } finally {
    reopened.close();
  }
  const snapshot = join(directory, 'snapshot');
  const metadata = await createBackup(filename, snapshot);
  assert.equal(metadata.schemaVersion, 6);
  assert.equal(metadata.counts.analytics_visits, 2);
  assert.equal(metadata.counts.analytics_pageviews, 2);
  const restored = await restoreBackup(snapshot, join(directory, 'restored'));
  const recovered = new Store(restored.databasePath);
  try {
    assert.deepEqual(recovered.statistics.report(30, now), expected);
  } finally {
    recovered.close();
  }
});

test('lead cards show readable fields and preserve private downloads without raw JSON or unsafe links', () => {
  const lead = {
    id: randomUUID(),
    createdAt: '2026-11-10T21:30:00.000Z',
    status: 'new',
    payload: {
      requestId: 'hidden-request-marker',
      startedAt: 1,
      website: '',
      name: '<script>alert(1)</script>',
      phone: '+79990000000',
      email: 'test@example.invalid',
      sourceLabel: 'Форма обращения',
      sourcePage: '//foreign.example/',
      serviceTitle: 'Паспорт доступности',
      objectTypeLabel: 'Образовательный объект',
      comment: 'Нужна консультация',
      questions: [
        null,
        { question: 'Пустой вопрос', answers: [] },
        { question: 'Есть паспорт?', answers: [{ label: 'Да' }] },
      ],
      attachments: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Паспорт.pdf',
          size: 1024,
        },
        { id: 'bad', name: 'hidden', size: 1 },
      ],
    },
  };
  const html = renderToStaticMarkup(createElement(LeadList, { leads: [lead] }));
  assert.match(html, /Паспорт доступности/);
  assert.match(html, /Нужна консультация/);
  assert.match(html, /11\.11\.2026.*00:30.*МСК/);
  assert.match(html, /Есть паспорт\?/);
  assert.match(
    html,
    /href="\/api\/admin\/attachments\/00000000-0000-4000-8000-000000000001"/,
  );
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(
    html,
    /<pre|<script|hidden-request-marker|startedAt|foreign\.example|Пустой вопрос|\[object Object\]/,
  );
  assert.deepEqual(
    presentLead({
      ...lead,
      payload: { name: null, questions: 3, attachments: [null] },
    }).questions,
    [],
  );
});

async function apiFixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'passport-statistics-api-'));
  const password = 'synthetic-statistics-password';
  const config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    appOrigin: '',
    trustProxy: 0,
    databasePath: join(directory, 'site.sqlite'),
    adminPasswordHash: createHash('sha256').update(password).digest('hex'),
    adminSessionSecret: 'synthetic-statistics-secret-at-least-32-characters',
  };
  const application = await createApplication(config);
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
  const origin = (config.appOrigin = 'http://127.0.0.1:' + address.port);
  const request = (path: string, options: RequestInit = {}) =>
    fetch(origin + path, { ...options, signal: AbortSignal.timeout(8000) });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    request('/api/analytics/pageview', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'User-Agent': 'ExampleBrowser/1.0',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  return {
    ...application,
    request,
    post,
    origin,
    cookie: login.headers.get('set-cookie')!.split(';')[0],
  };
}

test('statistics API is private, never cached and accepts only bounded reporting periods', async (t) => {
  const app = await apiFixture(t);
  assert.equal((await app.request('/api/admin/statistics')).status, 401);
  app.store.insertLead(
    'private',
    'hash',
    { phone: 'private-phone-marker' },
    new Date().toISOString(),
    'contact',
  );
  const headers = { Cookie: app.cookie };
  const response = await app.request('/api/admin/statistics?days=7', {
    headers,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  const body = await response.text();
  assert.doesNotMatch(body, /private-phone-marker/);
  assert.equal(JSON.parse(body).leads.total, 1);
  for (const query of [
    'days=0',
    'days=',
    'days=999',
    'days=7&days=30',
    'unknown=7',
    'days=30%20OR%201=1',
  ])
    assert.equal(
      (await app.request('/api/admin/statistics?' + query, { headers })).status,
      400,
      query,
    );
  assert.equal((await app.request('/api/analytics/pageview')).status, 405);
});

test('collection validates origin and input, counts published pages once and discards admin, bots and privacy signals', async (t) => {
  const app = await apiFixture(t);
  const first = view();
  assert.equal(
    (await app.post(first, { Origin: 'https://foreign.example' })).status,
    403,
  );
  assert.equal((await app.post(first, { Origin: '' })).status, 403);
  assert.equal(
    (await app.post(first, { 'Content-Type': 'text/plain' })).status,
    415,
  );
  assert.equal(
    (await app.post({ ...first, path: '/?email=private' })).status,
    400,
  );
  assert.equal((await app.post({ ...first, email: 'private' })).status, 400);
  assert.equal(
    (await app.post({ ...first, referrer: 'https://foreign.example/private' }))
      .status,
    400,
  );
  assert.equal((await app.post({ ...first, token: 'not-a-uuid' })).status, 400);
  assert.equal(
    (await app.post({ ...first, extra: 'x'.repeat(3000) })).status,
    413,
  );
  for (const path of [
    '/admin/',
    '/healthz',
    '/missing-page/',
    '/images/missing.png',
  ])
    assert.equal((await app.post(view(path))).status, 204);
  const excludedHeaders: Record<string, string>[] = [
    { Cookie: app.cookie },
    { 'User-Agent': 'Googlebot/1.0' },
    { DNT: '1' },
    { 'Sec-GPC': '1' },
  ];
  for (const headers of excludedHeaders)
    assert.equal((await app.post(view(), headers)).status, 204);
  assert.equal(app.store.statistics.report(7).traffic.pageviews, 0);
  const accepted = await app.post({ ...first, campaign: 'Yandex' });
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get('set-cookie'), null);
  assert.equal((await app.post(first)).status, 204);
  assert.equal((await app.post(view('/blog/', first.token))).status, 204);
  const report = app.store.statistics.report(7);
  assert.equal(report.traffic.pageviews, 2);
  assert.equal(report.traffic.visits, 1);
  assert.deepEqual(
    report.traffic.sources.map((row) => ({ ...row })),
    [{ source: 'campaign:yandex', visits: 1 }],
  );
});

test('pageview rate limits bound accepted event writes even when the client fabricates identifiers', async (t) => {
  const app = await apiFixture(t);
  const clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  const token = randomUUID();
  for (let index = 0; index < 120; index++)
    assert.equal((await app.post(view('/', token))).status, 204);
  assert.equal((await app.post(view('/', token))).status, 429);
  assert.equal(app.store.statistics.report(7).traffic.pageviews, 120);
});
