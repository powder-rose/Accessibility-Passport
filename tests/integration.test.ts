import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { resolveContent } from '../src/lib/resolve-content';
import type { SiteContent } from '../src/lib/content-types';
import { Store } from '../server/db/store';
import { scriptJson, buildHead } from '../server/seo';
import { createPageData } from '../server/page-data';
import { sessionCookie } from '../server/api/security';

const initial = JSON.parse(
  readFileSync(new URL('../src/content/home.json', import.meta.url), 'utf8'),
) as SiteContent;
const resolved = resolveContent(initial);
const directory = mkdtempSync(join(tmpdir(), 'passport-ssr-test-'));
const database = join(directory, 'site.sqlite');
const password = 'local-migration-test-password';
let child: ChildProcess;
let origin: string;
let cookie: string;

async function start(adminConfigured = true) {
  const port = await new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      server.close(() => resolve(address.port));
    });
  });
  origin = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, ['dist/server/index.js', '--production'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_ORIGIN: origin,
      DATABASE_PATH: database,
      TRUST_PROXY: '0',
      ADMIN_PASSWORD_SHA256: adminConfigured
        ? createHash('sha256').update(password).digest('hex')
        : '',
      ADMIN_SESSION_SECRET: adminConfigured
        ? 'migration-test-secret-with-at-least-32-characters'
        : '',
    },
  });
  await new Promise<void>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
      () => reject(new Error('Production server startup timed out.')),
      15000,
    );
    child.stdout!.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('Server ready at')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('Server exited during startup: ' + code));
    });
  });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  await exited;
}
function request(path: string, options: RequestInit = {}) {
  return fetch(origin + path, { ...options, signal: AbortSignal.timeout(8000) });
}
function mutation(path: string, body: unknown, method = 'POST', authenticated = false) {
  return request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(authenticated ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();
function textOnly(html: string) {
  return normalized(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&'),
  );
}
function extractJson(html: string, attribute: string) {
  const match = html.match(
    new RegExp('<script[^>]*' + attribute + '[^>]*>([\\s\\S]*?)<\\/script>'),
  );
  assert.ok(match, attribute);
  return JSON.parse(match[1]);
}

before(async () => {
  await start();
  const response = await mutation('/api/admin/login', { password });
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie')!.split(';')[0];
});
after(async () => {
  await stop();
  rmSync(directory, { recursive: true, force: true });
});

test('production SSR contains all approved sections and FAQ before JavaScript runs', async () => {
  const response = await request('/');
  assert.equal(response.status, 200);
  const html = await response.text();
  const text = textOnly(html);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<html lang="ru">/);
  for (const [key, section] of Object.entries(resolved.sections)) {
    assert.ok(text.includes(normalized(section.title)), 'Missing visible SSR section ' + key);
  }
  for (const item of resolved.sections['16'].items!) {
    assert.ok(text.includes(normalized(item.title)));
    assert.ok(text.includes(normalized(item.text!)));
  }
  assert.match(html, /src="\/assets\/index-[^"]+\.js"/);
  assert.doesNotMatch(html, /<!--app-(?:head|html|data)-->/);
  assert.ok(!html.includes('ADMIN_SESSION_SECRET'));
});

test('SEO metadata, five service prices, canonical and FAQ schema are present in raw HTML', async () => {
  const html = await (await request('/?utm_source=qa')).text();
  assert.ok(html.includes('<link rel="canonical" href="' + resolved.seo.canonical + '">'));
  for (const property of ['og:title', 'og:description', 'og:url', 'og:image', 'og:locale'])
    assert.ok(html.includes('property="' + property + '"'));
  assert.ok(html.includes('name="description"'));
  assert.match(html, /name="robots" content="index, follow"/);
  const schema = extractJson(html, 'type="application/ld\\+json"');
  assert.equal(
    schema['@graph'].filter((item: { '@type': string }) => item['@type'] === 'Service').length,
    5,
  );
  const services = schema['@graph'].filter(
    (item: { '@type': string }) => item['@type'] === 'Service',
  );
  assert.deepEqual(
    services.map(
      (item: { offers: { price?: number; lowPrice?: number } }) =>
        item.offers.price ?? item.offers.lowPrice,
    ),
    resolved.services.map((s) => s.price),
  );
  assert.equal(
    schema['@graph'].find((item: { '@type': string }) => item['@type'] === 'FAQPage').mainEntity
      .length,
    13,
  );
});

test('legal pages, redirects, missing routes and missing assets return correct statuses', async () => {
  const redirect = await request('/privacy?utm_source=qa', { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/privacy/?utm_source=qa');
  const legal = await request('/privacy/');
  assert.equal(legal.status, 200);
  assert.match(await legal.text(), /name="robots" content="noindex, nofollow"/);
  const missing = await request('/nonexistent/');
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Страница не найдена/);
  assert.equal((await request('/images/missing.webp')).status, 404);
  assert.equal((await request('/api/missing')).status, 404);
  assert.equal((await request('/api/leads')).status, 405);
  assert.equal((await request('/index.html', { redirect: 'manual' })).status, 308);
  const admin = await request('/admin/');
  assert.match(await admin.text(), /name="robots" content="noindex, nofollow"/);
});

test('private API rejects unauthenticated requests, bad sessions, cross-origin writes and malformed bodies', async () => {
  assert.equal((await request('/api/admin/content')).status, 404);
  assert.equal(
    (await request('/api/admin/leads', { headers: { Cookie: 'osi_admin=invalid' } })).status,
    401,
  );
  assert.equal(
    (
      await request('/api/admin/login', {
        method: 'POST',
        headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
    ).status,
    403,
  );
  assert.equal((await mutation('/api/admin/login', { password: 'wrong' })).status, 401);
  assert.equal(
    (
      await request('/api/leads', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: '{bad',
      })
    ).status,
    400,
  );
  assert.equal(
    (await request('/api/leads', { method: 'POST', headers: { Origin: origin }, body: '{}' }))
      .status,
    415,
  );
  const badConsent = {
    requestId: randomUUID(),
    source: 'contact',
    name: 'Проверка миграции',
    phone: '+79990000000',
    email: '',
    consent: false,
    website: '',
    startedAt: Date.now() - 5000,
    pageUrl: origin + '/',
    utm: {},
  };
  assert.equal((await mutation('/api/leads', badConsent)).status, 400);
  assert.equal(
    (await mutation('/api/leads', { ...badConsent, consent: true, website: 'spam' })).status,
    400,
  );
});

test('contact and six-step quiz leads persist, identical retries deduplicate and changed retries conflict', async () => {
  const data = {
    requestId: randomUUID(),
    source: 'contact',
    name: 'Проверка миграции',
    phone: '+79990000000',
    email: '',
    consent: true,
    website: '',
    startedAt: Date.now() - 5000,
    pageUrl: origin + '/',
    utm: { utm_source: 'migration-test' },
    service: 'passport',
  };
  assert.equal((await mutation('/api/leads', data)).status, 200);
  assert.equal((await mutation('/api/leads', data)).status, 200);
  assert.equal((await mutation('/api/leads', { ...data, comment: 'changed' })).status, 409);
  const answers = Object.fromEntries(initial.quiz.questions.map((q) => [q.id, [q.options[0].id]]));
  answers.documentation = ['documents'];
  const quiz = { ...data, requestId: randomUUID(), source: 'express', answers };
  assert.equal((await mutation('/api/leads', quiz)).status, 200);
  const result = await (await request('/api/admin/leads', { headers: { Cookie: cookie } })).json();
  assert.equal(result.leads.length, 2);
  const saved = result.leads.find((lead: { id: string }) => lead.id === quiz.requestId);
  assert.equal(saved.payload.questions.length, 5);
  assert.equal(saved.payload.classification.includesApprovalSupport, false);
  assert.equal(typeof saved.createdAt, 'string');
});

test('public SEO is ready without CMS, ignores legacy settings, and lead access remains protected', async () => {
  const legacy = structuredClone(initial) as SiteContent & { site: { indexing?: boolean } };
  legacy.site.indexing = false;
  legacy.seo.title = 'Legacy disabled title';
  const connection = new DatabaseSync(database);
  connection.exec(
    'CREATE TABLE IF NOT EXISTS content_entries (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)',
  );
  connection
    .prepare("INSERT OR REPLACE INTO content_entries VALUES ('home', ?, 1, ?)")
    .run(JSON.stringify(legacy), new Date().toISOString());
  connection.close();
  assert.equal((await request('/api/admin/content', { headers: { Cookie: cookie } })).status, 404);
  assert.equal(
    (await mutation('/api/admin/content', { content: legacy, revision: 1 }, 'PUT', true)).status,
    404,
  );
  await stop();
  await start(false);
  const response = await request('/');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /name="robots" content="index, follow"/);
  assert.ok(!html.includes('Legacy disabled title'));
  assert.ok(html.includes('<link rel="canonical" href="' + resolved.seo.canonical + '">'));
  assert.match(await (await request('/robots.txt')).text(), /Allow: \/\nDisallow: \/admin/);
  assert.ok(
    (await (await request('/sitemap.xml')).text()).includes(
      '<loc>' + new URL('/', resolved.site.domain).href + '</loc>',
    ),
  );
  assert.equal((await mutation('/api/admin/login', { password })).status, 503);
  assert.equal((await request('/api/admin/leads', { headers: { Cookie: cookie } })).status, 401);
  await stop();
  await start();
  const leads = await (await request('/api/admin/leads', { headers: { Cookie: cookie } })).json();
  assert.equal(leads.leads.length, 2);
});

test('database rate limits are atomic and persist independently of process memory', () => {
  const filename = join(directory, 'limits.sqlite');
  let store = new Store(filename);
  assert.equal(store.consumeRateLimit('bucket', 1, 100, 50), true);
  assert.equal(store.consumeRateLimit('bucket', 1, 100, 50), false);
  store.close();
  store = new Store(filename);
  assert.equal(store.consumeRateLimit('bucket', 1, 100, 50), false);
  store.close();
});

test('SEO escapes hostile source strings and HTTPS sessions retain Secure', () => {
  const value = { value: '</script><script>bad()</script>\u2028\u2029' };
  const json = scriptJson(value);
  assert.ok(!json.includes('<'));
  assert.deepEqual(JSON.parse(json), value);
  const content = structuredClone(resolved);
  content.seo.title = 'Паспорт "ОСИ" <SEO> $& </script>';
  content.services[0].price = 13700;
  const page = createPageData(new URL('https://example.invalid/'), content).data;
  const head = buildHead(page, '/');
  assert.ok(
    head.includes('<title>Паспорт &quot;ОСИ&quot; &lt;SEO&gt; $&amp; &lt;/script&gt;</title>'),
  );
  assert.equal(extractJson(head, 'type="application/ld\\+json"')['@graph'][1].offers.price, 13700);

  assert.match(sessionCookie(new Request('https://example.invalid/'), 'token', 30), /; Secure$/);
  assert.doesNotMatch(sessionCookie(new Request('http://localhost/'), 'token', 30), /; Secure/);
});
