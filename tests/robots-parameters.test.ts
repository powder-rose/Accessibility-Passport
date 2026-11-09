import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createApplication } from '../server/application';
import { getSiteContent } from '../server/content';
import { routes } from '../src/lib/routes';
import { emptyArticle, type ArticleForm } from '../src/features/articles/model';
import type { PageData } from '../src/page-data';

const content = getSiteContent();
const domain = content.site.domain;
const deadline = { timeout: 15000 };
const tracking =
  'utm_source=qa&utm_medium=cpc&utm_campaign=robots&utm_term=%D0%9E%D0%A1%D0%98&utm_content=button';

// Only the single wildcard-agent group and literal path prefixes are used.
// Fail on other syntax rather than pretending to implement a full REP parser.
function crawlPolicy(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual(
    lines.filter((line) => /^User-agent:/i.test(line)),
    ['User-agent: *'],
  );
  const rules = lines.flatMap((line) => {
    if (/^(?:User-agent|Sitemap): /.test(line)) return [];
    const match = line.match(/^(Allow|Disallow): (\/[^*$\s]*)$/);
    assert.ok(match, 'Unsupported robots rule: ' + line);
    return [{ allow: match[1] === 'Allow', path: match[2] }];
  });
  return (path: string) => {
    const url = new URL(path, domain);
    const target = url.pathname + url.search;
    const rule = rules
      .filter((item) => target.startsWith(item.path))
      .sort(
        (a, b) =>
          b.path.length - a.path.length || Number(b.allow) - Number(a.allow),
      )[0];
    return rule?.allow ?? true;
  };
}

async function fixture(t: TestContext) {
  const config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    trustProxy: 0,
    appOrigin: '',
    adminPasswordHash: createHash('sha256')
      .update('synthetic-robots-test-password')
      .digest('hex'),
    adminSessionSecret: 'synthetic-robots-test-secret-at-least-32',
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
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = 'http://127.0.0.1:' + address.port;
  config.appOrigin = origin;
  const request = (path: string) =>
    fetch(origin + path, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
  const robotsResponse = await request('/robots.txt');
  assert.equal(robotsResponse.status, 200);
  assert.match(
    robotsResponse.headers.get('content-type') || '',
    /^text\/plain/,
  );
  assert.equal(robotsResponse.headers.get('cache-control'), 'no-cache');
  const robots = await robotsResponse.text();
  const allowed = crawlPolicy(robots);
  let index = 0;
  const add = (overrides: Partial<ArticleForm> = {}) => {
    index++;
    return application.store.articles.save(
      {
        ...emptyArticle(),
        title: 'Robots article ' + index,
        slug: 'robots-article-' + index,
        content: '<p>Synthetic published article</p>',
        seoTitle: 'Robots article ' + index,
        seoDescription: 'Synthetic robots test',
        category: 'Школы',
        status: 'published',
        ...overrides,
      },
      { requestId: randomUUID() },
    );
  };
  return { ...application, request, robots, allowed, add };
}

function pageData(html: string): PageData {
  const match = html.match(
    /<script[^>]*id="page-data"[^>]*>([\s\S]*?)<\/script>/,
  );
  assert.ok(match);
  return JSON.parse(match[1]) as PageData;
}

function metadata(html: string, path: string, robots = 'index, follow') {
  const escapedUrl = (domain + path).replaceAll('&', '&amp;');
  assert.ok(html.includes('<link rel="canonical" href="' + escapedUrl + '">'));
  assert.ok(html.includes('<meta name="robots" content="' + robots + '">'));
}

test(
  'served robots permits public query variants and keeps private prefixes closed in any parameter order',
  deadline,
  async (t) => {
    const f = await fixture(t);
    assert.ok(f.robots.includes('Sitemap: ' + domain + '/sitemap.xml'));
    for (const path of [
      ...Object.values(routes),
      '/blog/',
      '/blog/?page=2',
      '/blog/?q=%D0%9E%D0%A1%D0%98',
      '/blog/robots-article/',
      '/privacy/',
      '/assets/client.js',
      '/images/og-accessibility.webp',
      '/fonts/regular.woff2',
      '/media/articles/' + randomUUID() + '.webp',
    ]) {
      assert.equal(f.allowed(path), true, path);
      for (const query of [
        tracking,
        'unknown=value&' + tracking,
        tracking + '&service=survey',
      ]) {
        const variant = path + (path.includes('?') ? '&' : '?') + query;
        assert.equal(f.allowed(variant), true, variant);
      }
    }
    for (const path of [
      '/admin',
      '/admin/',
      '/admin/articles/new/',
      '/api',
      '/api/',
      '/api/admin/leads',
      '/api/leads',
    ])
      for (const query of [
        '',
        '?' + tracking,
        '?fresh=1&' + tracking,
        '?' + tracking + '&cursor=abc&limit=25',
      ])
        assert.equal(f.allowed(path + query), false, path + query);
    const api = await f.request('/api/admin/leads?' + tracking);
    assert.equal(api.status, 401);
    assert.equal(api.headers.get('cache-control'), 'no-store');
    assert.equal(api.headers.get('x-robots-tag'), 'noindex, nofollow');
    const admin = await f.request('/admin/?' + tracking);
    assert.equal(admin.status, 200);
    assert.match(
      await admin.text(),
      /name="robots" content="noindex, nofollow"/,
    );
  },
);

test(
  'crawlable commercial variants keep clean SSR canonicals and valid form selections',
  deadline,
  async (t) => {
    const f = await fixture(t);
    const object = content.quiz.questions.find(
      (question) => question.id === 'objectType',
    )!.options[0].id;
    const service = content.services[0].id;
    const choices = new URLSearchParams({
      service,
      object_type: object,
    }).toString();
    for (const path of Object.values(routes)) {
      for (const query of [
        tracking + '&' + choices,
        choices + '&ignored=%2Fadmin%3F&' + tracking,
      ]) {
        const variant = path + '?' + query;
        assert.equal(f.allowed(variant), true);
        const response = await f.request(variant);
        assert.equal(response.status, 200);
        const html = await response.text();
        metadata(html, path);
        assert.ok(
          html.includes('property="og:url" content="' + domain + path + '"'),
        );
        assert.equal(pageData(html).service, service);
        assert.equal(pageData(html).objectType, object);
        const schema = html.match(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
        );
        assert.ok(schema);
        assert.doesNotMatch(schema[1], /utm_|object_type|ignored=/);
      }
    }
  },
);

test(
  'blog pagination remains indexable with its own canonical while crawlable searches and categories retain noindex',
  deadline,
  async (t) => {
    const f = await fixture(t);
    for (let index = 0; index < 13; index++) f.add();
    for (const query of ['page=1&' + tracking, tracking + '&page=1']) {
      const html = await (await f.request('/blog/?' + query)).text();
      metadata(html, '/blog/');
    }
    for (const query of [
      'page=2&' + tracking,
      tracking + '&ignored=value&page=2',
    ]) {
      const variant = '/blog/?' + query;
      assert.equal(f.allowed(variant), true);
      const response = await f.request(variant);
      assert.equal(response.status, 200);
      const html = await response.text();
      metadata(html, '/blog/?page=2');
      assert.equal(pageData(html).blog!.articles.length, 1);
      assert.match(html, /href="\/blog\/"/);
    }
    for (const query of [
      'q=Robots',
      'category=' + encodeURIComponent('Школы'),
      'page=2&q=Robots',
      'q=missing',
    ]) {
      const variant = '/blog/?' + tracking + '&' + query;
      assert.equal(f.allowed(variant), true);
      const response = await f.request(variant);
      assert.equal(response.status, 200);
      metadata(await response.text(), '/blog/?' + query, 'noindex, follow');
    }
  },
);

test(
  'published articles are crawlable with tracking and canonical redirects preserve the original query',
  deadline,
  async (t) => {
    const f = await fixture(t);
    const article = f.add({ slug: 'old-robots-slug' });
    const current = f.store.articles.save(
      { ...article, slug: 'current-robots-slug' },
      { id: article.id, revision: article.revision },
    );
    const canonical = '/blog/' + current.slug + '/';
    const variant = canonical + '?' + tracking + '&page=99';
    assert.equal(f.allowed(variant), true);
    const response = await f.request(variant);
    assert.equal(response.status, 200);
    const html = await response.text();
    metadata(html, canonical);
    assert.equal(pageData(html).article!.id, current.id);
    for (const [path, status, target] of [
      ['/anketa-osi', 308, '/anketa-osi/'],
      ['/blog/' + current.slug, 308, canonical],
      ['/blog/' + article.slug + '/', 301, canonical],
    ] as const) {
      const redirect = await f.request(path + '?' + tracking);
      assert.equal(redirect.status, status);
      assert.equal(redirect.headers.get('location'), target + '?' + tracking);
    }
  },
);

test(
  'robots allows reading legal noindex and real error statuses for malformed or missing public variants',
  deadline,
  async (t) => {
    const f = await fixture(t);
    f.add();
    for (const path of ['/privacy/', '/personal-data/']) {
      const variant = path + '?' + tracking;
      assert.equal(f.allowed(variant), true);
      const response = await f.request(variant);
      assert.equal(response.status, 200);
      metadata(await response.text(), path, 'noindex, nofollow');
    }
    for (const [path, status] of [
      ['/blog/?page=0', 400],
      ['/blog/?page=2&page=3', 400],
      ['/blog/?page=99', 404],
      ['/blog/missing-robots-article/?' + tracking, 404],
      ['/missing-public-page/?' + tracking, 404],
    ] as const) {
      assert.equal(f.allowed(path), true, path);
      const response = await f.request(path);
      assert.equal(response.status, status, path);
      assert.match(
        await response.text(),
        /name="robots" content="noindex, nofollow"/,
      );
    }
  },
);

test(
  'sitemap and blog navigation expose canonical public addresses without tracking or private drafts',
  deadline,
  async (t) => {
    const f = await fixture(t);
    const article = f.add();
    f.add({ slug: 'robots-private-draft', status: 'draft' });
    for (let index = 0; index < 12; index++) f.add();
    await f.request('/?service=survey&object_type=education&' + tracking);
    const response = await f.request('/sitemap.xml');
    assert.equal(response.status, 200);
    const xml = await response.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => new URL(match[1]),
    );
    assert.ok(urls.length > Object.keys(routes).length);
    assert.ok(
      urls.some((url) => url.pathname === '/blog/' + article.slug + '/'),
    );
    for (const url of urls) {
      assert.equal(url.origin, domain);
      assert.equal(url.search, '');
      assert.equal(f.allowed(url.href), true);
    }
    assert.doesNotMatch(xml, /robots-private-draft|\/admin|\/api/);
    const html = await (await f.request('/blog/?' + tracking)).text();
    assert.match(html, /href="\/blog\/\?page=2"/);
    assert.doesNotMatch(html, /href="\/blog\/\?[^" ]*utm_/);
  },
);
