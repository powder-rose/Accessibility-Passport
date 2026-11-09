import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/db/store';
import { createApplication } from '../server/application';
import {
  parseArticleQuery,
  ArticleQueryError,
} from '../server/articles/list-query';
import {
  emptyArticle,
  articleSummary,
  type ArticleRecord,
} from '../src/features/articles/model';
import {
  articlePageSize,
  initialArticleQuery,
  blogPath,
} from '../src/features/articles/listing';

const timestamp = '2026-11-01T12:00:00.000Z';
const marker = 'body-only-synthetic-marker';
function fixture(t: TestContext, automaticCleanup = true) {
  const directory = mkdtempSync(join(tmpdir(), 'passport-article-query-'));
  const filename = join(directory, 'site.sqlite');
  const store = new Store(filename);
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON');
  const close = () => {
    db.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  };
  if (automaticCleanup) t.after(close);
  let index = 0;
  const insert = db.prepare(
    'INSERT INTO articles(id,request_id,request_hash,slug,status,category,payload,revision,created_at,updated_at,published_at,deleted_at) VALUES (?,?,?,?,?,?,?,1,?,?,?,?)',
  );
  function add(
    overrides: Partial<ArticleRecord> = {},
    deleted = false,
  ): ArticleRecord {
    index++;
    const article = {
      ...emptyArticle(),
      title: 'Статья ' + index,
      slug: 'query-' + index,
      status: 'published' as const,
      content: '<p>' + marker + ' ' + index + '</p>',
      seoTitle: 'Тема ' + index,
      seoDescription: 'Описание ' + index,
      category: 'Общее',
      id: randomUUID(),
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: timestamp,
      ...overrides,
    };
    insert.run(
      article.id,
      randomUUID(),
      'synthetic-hash',
      article.slug,
      article.status,
      article.category,
      JSON.stringify(article),
      timestamp,
      timestamp,
      article.publishedAt,
      deleted ? timestamp : null,
    );
    db.prepare('INSERT INTO article_slugs VALUES (?,?)').run(
      article.slug,
      article.id,
    );
    return article;
  }
  return { directory, filename, store, db, add, close };
}
const query = (search = '', page = 1) => ({
  ...initialArticleQuery,
  search,
  page,
});

async function httpFixture(t: TestContext) {
  const f = fixture(t, false);
  const password = 'synthetic-read-query-password';
  const config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: f.filename,
    trustProxy: 0,
    adminPasswordHash: createHash('sha256').update(password).digest('hex'),
    adminSessionSecret: 'synthetic-read-query-secret-at-least-32',
    appOrigin: '',
  };
  const application = await createApplication(config);
  const server = application.app.listen(0, '127.0.0.1');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await application.close();
    f.close();
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = 'http://127.0.0.1:' + address.port;
  config.appOrigin = origin;
  const request = (path: string, options: RequestInit = {}) =>
    fetch(origin + path, { ...options, signal: AbortSignal.timeout(5000) });
  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const admin = (path: string, options: RequestInit = {}) =>
    request(path, {
      ...options,
      headers: {
        Origin: origin,
        Cookie: cookie,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  return { ...f, application, request, admin };
}
function pageData(html: string) {
  const match = html.match(
    /<script[^>]*id="page-data"[^>]*>([\s\S]*?)<\/script>/,
  );
  assert.ok(match);
  return JSON.parse(match[1]);
}

test('article query validation bounds pages and filters and rejects duplicate or malformed parameters', () => {
  for (const search of [
    '?page=0',
    '?page=-1',
    '?page=1.5',
    '?page=1000000',
    '?page=2&page=3',
    '?q=' + 'a'.repeat(101),
    '?category=' + 'a'.repeat(81),
    '?status=scheduled',
  ])
    assert.throws(
      () =>
        parseArticleQuery(
          new URL('https://example.invalid/blog/' + search),
          true,
        ),
      ArticleQueryError,
    );
  assert.equal(
    parseArticleQuery(new URL('https://example.invalid/blog/?status=draft'))
      .status,
    'published',
  );
  const parsed = parseArticleQuery(
    new URL(
      'https://example.invalid/blog/?page=2&category=++Доступность+++ОСИ++&q=+ТЕКСТ+&utm_source=qa',
    ),
  );
  assert.equal(parsed.category, 'Доступность ОСИ');
  assert.equal(parsed.search, 'ТЕКСТ');
  assert.equal(
    blogPath(parsed),
    '/blog/?page=2&category=%D0%94%D0%BE%D1%81%D1%82%D1%83%D0%BF%D0%BD%D0%BE%D1%81%D1%82%D1%8C+%D0%9E%D0%A1%D0%98&q=%D0%A2%D0%95%D0%9A%D0%A1%D0%A2',
  );
  assert.equal(blogPath(initialArticleQuery), '/blog/');
});

test('public summaries preserve metadata while excluding content, revisions, drafts and deleted categories', (t) => {
  const f = fixture(t);
  const article = f.add();
  f.add({ status: 'draft', category: 'Закрытая' });
  f.add({ category: 'Удалённая' }, true);
  const page = f.store.articles.queries.publicPage(query());
  assert.equal(page.articles.length, 1);
  assert.deepEqual(
    page.articles[0],
    articleSummary(f.store.articles.get(article.id)!),
  );
  assert.deepEqual(page.categories, ['Общее']);
  assert.ok(!('content' in page.articles[0]));
  assert.ok(!('revision' in page.articles[0]));
  assert.ok(!JSON.stringify(page).includes(marker));
  assert.deepEqual(f.store.articles.queries.categories(), [
    'Закрытая',
    'Общее',
  ]);
});

test('all published articles remain reachable across stable bounded pages when publication dates tie', (t) => {
  const f = fixture(t);
  const articles = Array.from({ length: 61 }, () => f.add());
  f.add({ status: 'draft' });
  f.add({}, true);
  const ids: string[] = [];
  const first = f.store.articles.queries.publicPage(query());
  for (let page = 1; page <= first.pages; page++) {
    const result = f.store.articles.queries.publicPage(query('', page));
    assert.ok(result.articles.length <= articlePageSize.public);
    ids.push(...result.articles.map((item) => item.id));
  }
  assert.equal(first.total, 61);
  assert.equal(first.pages, 6);
  assert.deepEqual(ids, articles.map((item) => item.id).sort());
  assert.equal(new Set(ids).size, 61);
});

test('global Cyrillic search, categories and literal percent characters work beyond the first page', (t) => {
  const f = fixture(t);
  for (let n = 0; n < 30; n++) f.add();
  const special = f.add({
    title: 'Доступность школы',
    seoDescription: 'Обследование помещения',
    category: 'Школы',
    publishedAt: '2020-01-01T00:00:00.000Z',
  });
  assert.ok(
    !f.store.articles.queries
      .publicPage(query())
      .articles.some((item) => item.id === special.id),
  );
  f.add({ status: 'draft', title: 'Доступность закрытого объекта' });
  assert.equal(
    f.store.articles.queries.publicPage(query('ДОСТУПНОСТЬ')).articles[0].id,
    special.id,
  );
  assert.equal(
    f.store.articles.queries.publicPage(query('ОБСЛЕДОВАНИЕ')).total,
    1,
  );
  assert.equal(
    f.store.articles.queries.publicPage({ ...query(), category: 'Школы' })
      .total,
    1,
  );
  assert.equal(f.store.articles.queries.adminPage(query('ШКОЛЫ')).total, 1);
  const literal = f.add({ title: '100%_готовности' });
  assert.equal(
    f.store.articles.queries.publicPage(query('%_')).articles[0].id,
    literal.id,
  );
  assert.equal(
    f.store.articles.queries.publicPage(query("%' OR 1=1 --")).total,
    0,
  );
});

test('administrator listings expose bounded metadata with revisions and clamp a vanished last page', (t) => {
  const f = fixture(t);
  for (let n = 0; n < 26; n++) f.add({ status: n % 2 ? 'draft' : 'published' });
  const result = f.store.articles.queries.adminPage(query());
  assert.equal(result.total, 26);
  assert.equal(result.articles.length, 25);
  assert.equal(result.pages, 2);
  assert.ok(
    result.articles.every(
      (item) => item.revision === 1 && !('content' in item),
    ),
  );
  const last = f.store.articles.queries.adminPage(query('', 2)).articles[0];
  f.store.articles.remove(last.id, last.revision);
  const clamped = f.store.articles.queries.adminPage(query('', 2));
  assert.equal(clamped.page, 1);
  assert.equal(clamped.total, 25);
  assert.equal(clamped.articles.length, 25);
  const drafts = f.store.articles.queries.adminPage({
    ...query(),
    status: 'draft',
  });
  assert.ok(drafts.articles.every((item) => item.status === 'draft'));
  assert.ok(!JSON.stringify(result).includes(marker));
});

test('related articles are limited to three, prefer the same category and exclude private or deleted content', (t) => {
  const f = fixture(t);
  const current = f.add({ category: 'Целевая' });
  const matching = Array.from({ length: 4 }, () =>
    f.add({ category: 'Целевая' }),
  );
  for (let n = 0; n < 10; n++) f.add({ category: 'Другая' });
  f.add({ status: 'draft', category: 'Целевая' });
  f.add({ category: 'Целевая' }, true);
  const related = f.store.articles.queries.related(current);
  assert.deepEqual(
    related.map((item) => item.id),
    matching
      .map((item) => item.id)
      .sort()
      .slice(0, 3),
  );
  assert.ok(
    related.every((item) => !('content' in item) && !('revision' in item)),
  );
});

test('full article reads still sanitize legacy HTML and summary queries never rewrite stored payloads', (t) => {
  const f = fixture(t);
  const article = f.add({
    content:
      '<p>Visible</p><script>bad()</script><img src="x" onerror="bad()">',
  });
  const before = f.db
    .prepare('SELECT payload FROM articles WHERE id=?')
    .get(article.id)!.payload;
  f.store.articles.queries.publicPage(query());
  f.store.articles.queries.related(article);
  f.store.articles.queries.categories();
  const full = f.store.articles.bySlug(article.slug)!;
  assert.match(full.content, /Visible/);
  assert.doesNotMatch(full.content, /<script|onerror/);
  assert.equal(
    f.db.prepare('SELECT payload FROM articles WHERE id=?').get(article.id)!
      .payload,
    before,
  );
});

test('sitemap uses only canonical published slugs even when an unrelated article payload is unreadable', async (t) => {
  const f = await httpFixture(t);
  const article = f.add();
  const broken = f.add();
  f.add({ status: 'draft', slug: 'private-draft' });
  f.add({ slug: 'deleted-published' }, true);
  f.db
    .prepare('UPDATE articles SET payload=? WHERE id=?')
    .run('not-json', broken.id);
  const response = await f.request('/sitemap.xml');
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.ok(xml.includes('/blog/' + article.slug + '/'));
  assert.ok(xml.includes('/blog/' + broken.slug + '/'));
  assert.doesNotMatch(
    xml,
    /private-draft|deleted-published|not-json|body-only/,
  );
});

test('blog pagination is rendered on the server with crawlable links, self canonicals and bounded page data', async (t) => {
  const f = await httpFixture(t);
  for (let n = 0; n < 27; n++) f.add();
  f.add({ status: 'draft', title: 'Private draft title' });
  const first = await (await f.request('/blog/')).text();
  const firstData = pageData(first);
  assert.equal(firstData.blog.articles.length, 12);
  assert.equal(firstData.blog.total, 27);
  assert.match(first, /href="\/blog\/\?page=2"/);
  assert.match(first, /index, follow/);
  assert.ok(!first.includes(marker));
  assert.ok(!first.includes('Private draft title'));
  const second = await (await f.request('/blog/?page=2&utm_source=qa')).text();
  assert.equal(pageData(second).blog.page, 2);
  assert.match(
    second,
    /rel="canonical" href="https:\/\/pasport-dostupnosty.ru\/blog\/\?page=2"/,
  );
  assert.match(second, /href="\/blog\/\?page=3"/);
  assert.match(second, /href="\/blog\/"/);
  assert.equal((await f.request('/blog/?page=99')).status, 404);
  assert.equal((await f.request('/blog/?page=-1')).status, 400);
});

test('server-side blog filters search the whole catalogue and do not create indexable search variants', async (t) => {
  const f = await httpFixture(t);
  for (let n = 0; n < 28; n++) f.add();
  const chosen = f.add({
    title: 'Доступность учреждения',
    category: 'Школы',
    publishedAt: '2020-01-01T00:00:00.000Z',
  });
  const html = await (
    await f.request('/blog/?q=' + encodeURIComponent('ДОСТУПНОСТЬ'))
  ).text();
  const data = pageData(html);
  assert.equal(data.blog.total, 1);
  assert.equal(data.blog.articles[0].id, chosen.id);
  assert.match(html, /noindex, follow/);
  assert.match(html, /<form action="\/blog\/" method="get">/);
  const empty = await (await f.request('/blog/?q=missing')).text();
  assert.match(empty, /По вашему запросу ничего не найдено/);
});

test('an article response serializes its full text and at most three related summaries', async (t) => {
  const f = await httpFixture(t);
  const article = f.add({ content: '<p>Only requested article text</p>' });
  for (let n = 0; n < 35; n++) f.add();
  const html = await (await f.request('/blog/' + article.slug + '/')).text();
  const data = pageData(html);
  assert.equal(data.article.id, article.id);
  assert.equal(data.relatedArticles.length, 3);
  assert.equal(data.articles, undefined);
  assert.equal(data.blog, undefined);
  assert.ok(!JSON.stringify(data.relatedArticles).includes(marker));
  assert.ok(!html.includes(marker));
  assert.ok(html.includes('Only requested article text'));
});

test('private article API pages exclude bodies while individual reads and revision-protected edits still work', async (t) => {
  const f = await httpFixture(t);
  for (let n = 0; n < 32; n++) f.add();
  assert.equal((await f.request('/api/admin/articles')).status, 401);
  const response = await f.admin('/api/admin/articles');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const list = await response.json();
  assert.equal(list.articles.length, 25);
  assert.equal(list.total, 32);
  assert.ok(
    list.articles.every(
      (item: Record<string, unknown>) =>
        !('content' in item) && item.revision === 1,
    ),
  );
  assert.equal((await f.admin('/api/admin/articles?page=0')).status, 400);
  const item = list.articles[0];
  const full = (await (await f.admin('/api/admin/articles/' + item.id)).json())
    .article;
  const update = await f.admin('/api/admin/articles/' + item.id, {
    method: 'PUT',
    body: JSON.stringify({
      form: { ...full, category: 'Новая категория' },
      revision: item.revision,
    }),
  });
  assert.equal(update.status, 200);
  const saved = (await update.json()).article;
  assert.equal(saved.content, full.content);
  assert.equal(saved.revision, item.revision + 1);
  const stale = await f.admin('/api/admin/articles/' + item.id, {
    method: 'PUT',
    body: JSON.stringify({
      form: { ...full, category: 'Устаревшая правка' },
      revision: item.revision,
    }),
  });
  assert.equal(stale.status, 409);
  assert.equal(f.store.articles.get(item.id)!.category, 'Новая категория');
});
