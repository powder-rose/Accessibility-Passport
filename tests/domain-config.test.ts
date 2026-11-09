import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  normalizeOrigin,
  isLoopbackOrigin,
  validateDomainConfiguration,
} from '../server/origin';
import { getSiteContent } from '../server/content';
import { createApplication } from '../server/application';
import type { Config } from '../server/config';
import { emptyArticle } from '../src/features/articles/model';

const content = getSiteContent();
const domain = content.site.domain;
const privateMarker = 'synthetic-private-origin-password';
const deadline = { timeout: 10000 };
function temporaryDirectory(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'passport-domain-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function config(appOrigin: string, databasePath = ':memory:'): Config {
  return {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath,
    appOrigin,
    trustProxy: 0,
    adminPasswordHash: '',
    adminSessionSecret: '',
  };
}
function environment(appOrigin: string, databasePath: string) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    APP_ORIGIN: appOrigin,
    DATABASE_PATH: databasePath,
    HOST: '127.0.0.1',
    PORT: '0',
    TRUST_PROXY: '0',
    ADMIN_PASSWORD_SCRYPT: '',
    ADMIN_PASSWORD_SHA256: '',
    ADMIN_SESSION_SECRET: '',
  };
}

test('origin parsing normalizes equivalent authorities without treating paths as an origin', () => {
  assert.equal(
    normalizeOrigin(' HTTPS://EXAMPLE.INVALID:443/ ', 'APP_ORIGIN'),
    'https://example.invalid',
  );
  assert.equal(
    normalizeOrigin('http://LOCALHOST:5173/', 'APP_ORIGIN'),
    'http://localhost:5173',
  );
  assert.equal(
    normalizeOrigin('http://127.0.0.1:3000', 'APP_ORIGIN'),
    'http://127.0.0.1:3000',
  );
  assert.equal(
    normalizeOrigin('http://[0:0:0:0:0:0:0:1]:5173/', 'APP_ORIGIN'),
    'http://[::1]:5173',
  );
  assert.equal(
    normalizeOrigin('https://example.invalid:8443/', 'APP_ORIGIN'),
    'https://example.invalid:8443',
  );
});

test('credentials, paths, queries, fragments and ambiguous URL syntax fail without echoing input', () => {
  for (const value of [
    'https://user:' + privateMarker + '@example.invalid',
    'https://@example.invalid',
    'https://example.invalid/path',
    'https://example.invalid/a/..',
    'https://example.invalid/%2e',
    'https://example.invalid?' + privateMarker,
    'https://example.invalid?',
    'https://example.invalid#' + privateMarker,
    'https://example.invalid#',
    'https:\\example.invalid',
    'https://example.invalid\\path',
    'https://exa\nmple.invalid',
    '//example.invalid',
    'https:example.invalid',
    'file:///tmp/private',
    'not-a-url',
    '',
  ])
    assert.throws(
      () => normalizeOrigin(value, 'APP_ORIGIN'),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /APP_ORIGIN/);
        assert.ok(!error.message.includes(privateMarker));
        return true;
      },
    );
});

test('public domain and root canonical must be normalized and agree in both dev and production', () => {
  validateDomainConfiguration({ production: true, appOrigin: domain }, content);
  const changed = structuredClone(content);
  changed.site.domain = 'https://changed.example.invalid';
  changed.seo.canonical = changed.site.domain + '/';
  validateDomainConfiguration(
    { production: true, appOrigin: changed.site.domain },
    changed,
  );
  for (const production of [true, false]) {
    for (const override of [
      { site: { ...content.site, domain: domain + '/' } },
      { site: { ...content.site, domain: domain + '/path' } },
      { site: { ...content.site, domain: 'http://example.invalid' } },
      { site: { ...content.site, domain: 'https://localhost' } },
      { seo: { ...content.seo, canonical: domain } },
      { seo: { ...content.seo, canonical: domain + '/other/' } },
      {
        seo: { ...content.seo, canonical: 'https://changed.example.invalid/' },
      },
    ])
      assert.throws(() =>
        validateDomainConfiguration(
          { production, appOrigin: domain },
          { ...content, ...override },
        ),
      );
  }
});

test('public production origin mismatches fail while dev and local production preserve public SEO values', () => {
  for (const appOrigin of [
    'https://other.example.invalid',
    'https://www.pasport-dostupnosty.ru',
    domain + ':8443',
    domain.replace('https:', 'http:'),
  ])
    assert.throws(
      () =>
        validateDomainConfiguration({ production: true, appOrigin }, content),
      /APP_ORIGIN/,
    );
  for (const appOrigin of [
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://[::1]:5173',
    domain,
  ]) {
    validateDomainConfiguration({ production: true, appOrigin }, content);
    assert.equal(content.site.domain, domain);
    assert.equal(content.seo.canonical, domain + '/');
  }
  validateDomainConfiguration(
    { production: false, appOrigin: 'http://dev.example.invalid:5173' },
    content,
  );
  for (const origin of [
    'http://localhost:1',
    'https://127.0.0.1:2',
    'http://[::1]:3',
  ])
    assert.equal(isLoopbackOrigin(origin), true);
  for (const origin of [
    'http://localhost.example.invalid',
    'http://127.0.0.1.example.invalid',
    'http://0.0.0.0',
  ])
    assert.equal(isLoopbackOrigin(origin), false);
  assert.throws(
    () =>
      validateDomainConfiguration(
        { production: true, appOrigin: domain + '/' },
        content,
      ),
    /normalized/,
  );
});

test(
  'readConfig uses the strict origin parser before starting the application',
  deadline,
  (t) => {
    const directory = temporaryDirectory(t);
    const configModule = pathToFileURL(resolve('server/config.ts')).href;
    const probe =
      'import {readConfig} from ' +
      JSON.stringify(configModule) +
      '; process.stdout.write(JSON.stringify({origin:readConfig().appOrigin}));';
    const run = (origin: string) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          import.meta.resolve('tsx'),
          '--input-type=module',
          '-e',
          probe,
        ],
        {
          cwd: directory,
          env: environment(origin, join(directory, 'unused.sqlite')),
          encoding: 'utf8',
          timeout: 8000,
          windowsHide: true,
        },
      );
    const good = run('HTTPS://EXAMPLE.INVALID:443/');
    assert.equal(good.status, 0, good.stderr);
    assert.deepEqual(JSON.parse(good.stdout), {
      origin: 'https://example.invalid',
    });
    const bad = run('https://user:' + privateMarker + '@example.invalid');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /APP_ORIGIN/);
    assert.ok(!bad.stderr.includes(privateMarker));
    assert.ok(!existsSync(join(directory, 'unused.sqlite')));
  },
);

test('invalid public configuration fails before opening or creating the database', async (t) => {
  const directory = temporaryDirectory(t);
  const databasePath = join(directory, 'not-created', 'site.sqlite');
  await assert.rejects(
    createApplication(config('https://other.example.invalid', databasePath)),
    /APP_ORIGIN must match/,
  );
  assert.ok(!existsSync(join(directory, 'not-created')));
});

test(
  'the compiled production entry exits before readiness and database initialization on domain mismatch',
  deadline,
  (t) => {
    const directory = temporaryDirectory(t);
    const databasePath = join(directory, 'not-created', 'site.sqlite');
    const child = spawnSync(
      process.execPath,
      [resolve('dist/server/index.js'), '--production'],
      {
        cwd: directory,
        env: environment('https://other.example.invalid', databasePath),
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
      },
    );
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stderr, /APP_ORIGIN must match/);
    assert.ok(!child.stdout.includes('Server ready at'));
    assert.ok(!existsSync(join(directory, 'not-created')));
  },
);

async function httpFixture(t: TestContext, local: boolean) {
  const options = config(local ? 'http://127.0.0.1' : domain);
  options.trustProxy = 1;
  const application = await createApplication(options);
  const server = application.app.listen(0, '127.0.0.1');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await application.close();
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = 'http://127.0.0.1:' + address.port;
  if (local) options.appOrigin = origin;
  const article = application.store.articles.save(
    {
      ...emptyArticle(),
      title: 'Domain check',
      content: '<p>Domain check</p>',
      slug: 'domain-check',
      status: 'published',
      seoTitle: 'Domain check',
      seoDescription: 'Synthetic domain test',
    },
    { requestId: crypto.randomUUID() },
  );
  const request = (path: string) =>
    fetch(origin + path, {
      signal: AbortSignal.timeout(5000),
      headers: {
        Host: 'injected.example.invalid',
        'X-Forwarded-Host': 'injected.example.invalid',
        'X-Forwarded-Proto': 'http',
      },
    });
  return { request, article };
}

test(
  'public canonicals, OG, schema, robots and sitemap agree despite forged request hosts',
  deadline,
  async (t) => {
    const f = await httpFixture(t, false);
    for (const path of [
      '/',
      '/akt-obsledovaniya-osi/',
      '/blog/',
      '/blog/' + f.article.slug + '/',
    ]) {
      const response = await f.request(path);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes('rel="canonical" href="' + domain + path + '"'));
      assert.ok(
        html.includes('property="og:url" content="' + domain + path + '"'),
      );
      assert.ok(html.includes('"@id":"' + domain + '/#organization"'));
      assert.ok(!html.includes('injected.example.invalid'));
    }
    const sitemap = await (await f.request('/sitemap.xml')).text();
    assert.ok(
      sitemap.includes(
        '<loc>' + domain + '/blog/' + f.article.slug + '/</loc>',
      ),
    );
    assert.ok(!sitemap.includes('injected.example.invalid'));
    const robots = await (await f.request('/robots.txt')).text();
    assert.ok(robots.includes('Sitemap: ' + domain + '/sitemap.xml'));
  },
);

test(
  'a local production preview keeps the configured public canonical and sitemap domain',
  deadline,
  async (t) => {
    const f = await httpFixture(t, true);
    const response = await f.request('/');
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('rel="canonical" href="' + domain + '/"'));
    const sitemap = await (await f.request('/sitemap.xml')).text();
    assert.ok(sitemap.includes('<loc>' + domain + '/</loc>'));
    assert.ok(!sitemap.includes('127.0.0.1'));
    assert.equal(getSiteContent().site.domain, domain);
  },
);
