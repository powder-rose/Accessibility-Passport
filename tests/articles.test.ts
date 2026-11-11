import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { createApplication } from '../server/application';
import type { Config } from '../server/config';
import { Store } from '../server/db/store';
import { initialSchema, attachmentSchema } from '../server/db/migrations';
import {
  articleSlug,
  emptyArticle,
  type ArticleRecord,
  type ArticleForm,
} from '../src/features/articles/model';
import { sanitizeArticleContent } from '../server/articles/html';

const directory = mkdtempSync(join(tmpdir(), 'osi-articles-'));
const database = join(directory, 'site.sqlite');
const password = 'synthetic-article-test-password';
const config: Config = {
  production: true,
  host: '127.0.0.1',
  port: 0,
  databasePath: database,
  trustProxy: 0,
  adminPasswordHash: createHash('sha256').update(password).digest('hex'),
  adminSessionSecret: 'synthetic-article-session-secret-at-least-32-characters',
};
let application: Awaited<ReturnType<typeof createApplication>>;
let server: Server;
let origin: string;
let cookie: string;
let article: ArticleRecord;
let imageUrl: string;
function request(path: string, options: RequestInit = {}) {
  return fetch(origin + path, {
    ...options,
    signal: AbortSignal.timeout(8000),
  });
}
function json(
  path: string,
  body: unknown,
  method = 'POST',
  authenticated = true,
  requestOrigin?: string,
) {
  return request(path, {
    method,
    headers: {
      Origin: requestOrigin || origin,
      'Content-Type': 'application/json',
      ...(authenticated ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
function form(overrides: Partial<ArticleForm> = {}): ArticleForm {
  return {
    ...emptyArticle(),
    title: 'Тестовая статья ОСИ',
    content:
      '<h2>Проверка исходных сведений</h2><p>Синтетический текст проверки публикации.</p>',
    ...overrides,
  };
}
async function start() {
  application = await createApplication(config);
  server = await new Promise<Server>((resolve) => {
    const listener = application.app.listen(0, '127.0.0.1', () =>
      resolve(listener),
    );
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  config.appOrigin = origin;
  const response = await json('/api/admin/login', { password }, 'POST', false);
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie')!.split(';')[0];
}
async function stop() {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await application.close();
}
before(start);
after(async () => {
  await stop();
  rmSync(directory, { recursive: true, force: true });
});

test('article administration requires authentication and same-origin writes; invalid data is rejected', async () => {
  const input = { requestId: randomUUID(), form: form() };
  assert.equal(
    (await json('/api/admin/articles', input, 'POST', false)).status,
    401,
  );
  assert.equal((await request('/api/admin/articles')).status, 401);
  assert.equal((await request('/api/admin/session')).status, 401);
  assert.deepEqual(
    await (
      await request('/api/admin/session', { headers: { Cookie: cookie } })
    ).json(),
    { authenticated: true },
  );
  assert.equal(
    (
      await json(
        '/api/admin/articles',
        input,
        'POST',
        true,
        'https://other.invalid',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await json('/api/admin/articles', {
        ...input,
        form: { ...form(), status: 'scheduled' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await json('/api/admin/articles', {
        ...input,
        form: { ...form(), image: 'https://outside.invalid/image.webp' },
      })
    ).status,
    400,
  );
  assert.equal(application.store.articles.list().length, 0);
  const admin = await request('/admin/articles/new/');
  assert.equal(admin.status, 200);
  const html = await admin.text();
  assert.match(html, /noindex, nofollow/);
  assert.doesNotMatch(html, /Тестовая статья/);
  assert.equal(
    (await request('/admin/articles/new', { redirect: 'manual' })).status,
    308,
  );
});

test('drafts persist without SEO, identical creation retries deduplicate and are excluded from public pages and sitemap', async () => {
  const requestId = randomUUID();
  const input = {
    requestId,
    form: form({
      slug: 'Проверка паспорта',
      category: '  Доступность   ОСИ  ',
    }),
  };
  const response = await json('/api/admin/articles', input);
  assert.equal(response.status, 200, await response.clone().text());
  article = (await response.json()).article;
  assert.equal(article.slug, 'proverka-pasporta');
  assert.equal(article.category, 'Доступность ОСИ');
  assert.equal(article.status, 'draft');
  assert.equal(article.revision, 1);
  assert.equal((await json('/api/admin/articles', input)).status, 200);
  assert.equal(
    (
      await json('/api/admin/articles', {
        ...input,
        form: form({ title: 'Другой запрос' }),
      })
    ).status,
    409,
  );
  assert.equal(application.store.articles.list().length, 1);
  assert.equal((await request('/blog/' + article.slug + '/')).status, 404);
  const blog = await (await request('/blog/')).text();
  assert.doesNotMatch(blog, /Тестовая статья/);
  assert.match(blog, /noindex, follow/);
  assert.doesNotMatch(await (await request('/sitemap.xml')).text(), /\/blog\//);
  await stop();
  await start();
  assert.equal(
    application.store.articles.get(article.id)!.title,
    article.title,
  );
});

test('preview is authenticated, sanitized and does not publish or mutate the saved draft', async () => {
  const draft = form({
    title: 'Предпросмотр незаписанного текста',
    content:
      '<h1>Раздел</h1><p onclick="bad()">Текст <a href="javascript:bad()">ссылки</a></p><script>bad()</script><iframe src="https://outside.invalid"></iframe><img src="https://outside.invalid/track.png">',
  });
  assert.equal(
    (await json('/api/admin/articles/preview', draft, 'POST', false)).status,
    401,
  );
  const response = await json('/api/admin/articles/preview', draft);
  assert.equal(response.status, 200);
  const preview = (await response.json()).article;
  assert.match(preview.content, /<h2>Раздел<\/h2>/);
  assert.doesNotMatch(
    preview.content,
    /onclick|javascript:|script|iframe|track\.png/,
  );
  assert.equal(
    application.store.articles.get(article.id)!.title,
    article.title,
  );
  assert.equal(application.store.articles.list().length, 1);
  assert.equal((await request('/blog/' + preview.slug + '/')).status, 404);
});

test('publishing requires substantive content and both SEO fields without changing the existing draft on failure', async () => {
  for (const next of [
    form({ status: 'published' }),
    form({
      status: 'published',
      seoTitle: 'Title',
      seoDescription: 'Description',
      content: '<p></p>',
    }),
  ])
    assert.equal(
      (
        await json(
          '/api/admin/articles/' + article.id,
          { form: next, revision: article.revision },
          'PUT',
        )
      ).status,
      400,
    );
  assert.equal(application.store.articles.get(article.id)!.status, 'draft');
});

test('article image uploads validate authentication, origin, type, size and real raster content', async () => {
  const png = await sharp({
    create: { width: 1200, height: 675, channels: 3, background: '#b8eee6' },
  })
    .png()
    .toBuffer();
  async function upload(
    bytes: Uint8Array,
    name: string,
    type: string,
    authenticated = true,
    requestOrigin = origin,
  ) {
    const body = new FormData();
    body.set('image', new File([new Uint8Array(bytes)], name, { type }));
    return request('/api/admin/article-images', {
      method: 'POST',
      headers: {
        Origin: requestOrigin,
        ...(authenticated ? { Cookie: cookie } : {}),
      },
      body,
    });
  }
  assert.equal(
    (await upload(png, 'cover.png', 'image/png', false)).status,
    401,
  );
  assert.equal(
    (await upload(png, 'cover.png', 'image/png', true, 'https://other.invalid'))
      .status,
    403,
  );
  assert.equal(
    (
      await upload(
        Buffer.from('<svg onload="bad()"/>'),
        'cover.svg',
        'image/svg+xml',
      )
    ).status,
    415,
  );
  assert.equal(
    (await upload(Buffer.from('MZ executable'), 'cover.png', 'image/png'))
      .status,
    415,
  );
  assert.equal((await upload(png, 'cover.webp', 'image/webp')).status, 415);
  assert.equal(
    (
      await upload(
        new Uint8Array(5 * 1024 * 1024 + 1),
        'large.png',
        'image/png',
      )
    ).status,
    413,
  );
  const response = await upload(png, 'cover.png', 'image/png');
  assert.equal(response.status, 200, await response.clone().text());
  const saved = await response.json();
  imageUrl = saved.url;
  assert.match(imageUrl, /^\/media\/articles\/[a-f0-9-]{36}\.webp$/);
  assert.equal(saved.width, 1200);
  assert.equal(saved.height, 675);
  assert.equal((await request(imageUrl)).status, 404);
  const media = await request(imageUrl, { headers: { Cookie: cookie } });
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('cache-control'), 'private, no-store');
  const metadata = await sharp(
    Buffer.from(await media.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.exif, undefined);
  for (const format of ['jpeg', 'webp'] as const) {
    const source = await sharp(png)
      .withExif({ IFD0: { Artist: 'TEST_ONLY' } })
      [format]()
      .toBuffer();
    const encoded = await upload(source, 'cover.' + format, 'image/' + format);
    assert.equal(encoded.status, 200, await encoded.clone().text());
    const uploaded = await encoded.json();
    const decoded = await sharp(
      Buffer.from(
        await (
          await request(uploaded.url, { headers: { Cookie: cookie } })
        ).arrayBuffer(),
      ),
    ).metadata();
    assert.equal(decoded.format, 'webp');
    assert.equal(decoded.exif, undefined);
  }
});

test('publication immediately exposes complete SSR, canonical, metadata, BlogPosting, images and sitemap without a rebuild', async () => {
  const content =
    '<h2>Проверка исходных сведений</h2><p>Опубликованный синтетический текст.</p><ol><li>Первый пункт</li><li>Второй пункт</li></ol><blockquote><p>Выделенный блок</p></blockquote><table><tbody><tr><th><p>Зона</p></th><th><p>Сведения</p></th></tr><tr><td><p>Вход</p></td><td><p>Данные обследования</p></td></tr></tbody></table><p><a href="/anketa-osi/">Анкета ОСИ</a></p><img src="' +
    imageUrl +
    '" alt="Синтетическая иллюстрация" width="1200" height="675">';
  const response = await json(
    '/api/admin/articles/' + article.id,
    {
      form: form({
        slug: article.slug,
        category: article.category,
        status: 'published',
        seoTitle: 'Проверка публикации — БОЙКОВГРУПП',
        seoDescription: 'Описание тестовой публикации.',
        image: imageUrl,
        imageAlt: 'Синтетическая обложка',
        content,
      }),
      revision: article.revision,
    },
    'PUT',
  );
  assert.equal(response.status, 200, await response.clone().text());
  article = (await response.json()).article;
  const page = await request('/blog/' + article.slug + '/?utm_source=test');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.ok(html.includes('<title>' + article.seoTitle + '</title>'));
  assert.ok(
    html.includes(
      'name="description" content="' + article.seoDescription + '"',
    ),
  );
  assert.ok(
    html.includes(
      'rel="canonical" href="https://pasport-dostupnosty.ru/blog/' +
        article.slug +
        '/"',
    ),
  );
  assert.match(html, /index, follow/);
  assert.match(html, /Выделенный блок/);
  assert.match(html, /article-table-scroll/);
  assert.match(html, /href="\/anketa-osi\/"/);
  const graph = JSON.parse(
    html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1],
  )['@graph'];
  const schema = graph.find(
    (item: { '@type': string }) => item['@type'] === 'BlogPosting',
  );
  assert.equal(schema.headline, article.title);
  assert.equal(schema.author.name, 'Николай Бойков');
  assert.equal(schema.datePublished, article.publishedAt);
  const sitemap = await (await request('/sitemap.xml')).text();
  assert.ok(sitemap.includes('/blog/' + article.slug + '/'));
  assert.equal((sitemap.match(/<url>/g) || []).length, 6);
  const blog = await (await request('/blog/')).text();
  assert.ok(blog.includes(article.title));
  assert.match(blog, /index, follow/);
  const media = await request(imageUrl);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'image/webp');
  const etag = media.headers.get('etag')!;
  assert.equal(
    (await request(imageUrl, { headers: { 'If-None-Match': etag } })).status,
    304,
  );
  const redirect = await request('/blog/' + article.slug, {
    redirect: 'manual',
  });
  assert.equal(redirect.status, 308);
});

test('concurrent edits are rejected, title-only edits retain URLs and changed slugs redirect without chains', async () => {
  const oldSlug = article.slug;
  const formData = {
    ...article,
    content: article.content,
    title: 'Новый заголовок',
  };
  const first = await json(
    '/api/admin/articles/' + article.id,
    { form: formData, revision: article.revision },
    'PUT',
  );
  assert.equal(first.status, 200);
  const updated = (await first.json()).article as ArticleRecord;
  assert.equal(updated.slug, oldSlug);
  assert.equal(
    (
      await json(
        '/api/admin/articles/' + article.id,
        { form: formData, revision: article.revision },
        'PUT',
      )
    ).status,
    409,
  );
  const second = await json(
    '/api/admin/articles/' + article.id,
    {
      form: { ...updated, slug: 'obnovlennaya-statya' },
      revision: updated.revision,
    },
    'PUT',
  );
  assert.equal(second.status, 200);
  article = (await second.json()).article;
  const redirect = await request(
    '/blog/' + oldSlug + '/?utm_source=redirect-test',
    { redirect: 'manual' },
  );
  assert.equal(redirect.status, 301);
  assert.equal(
    redirect.headers.get('location'),
    '/blog/' + article.slug + '/?utm_source=redirect-test',
  );
  const third = await json(
    '/api/admin/articles/' + article.id,
    {
      form: { ...article, slug: 'finalnaya-statya' },
      revision: article.revision,
    },
    'PUT',
  );
  article = (await third.json()).article;
  assert.equal(
    (
      await request('/blog/' + oldSlug + '/', { redirect: 'manual' })
    ).headers.get('location'),
    '/blog/' + article.slug + '/',
  );
  const list = await (
    await request('/api/admin/articles', { headers: { Cookie: cookie } })
  ).json();
  assert.ok(list.categories.includes(article.category));
});

test('unpublishing closes article and image access; deletion removes public listings and reserves old URLs', async () => {
  const response = await json(
    '/api/admin/articles/' + article.id,
    { form: { ...article, status: 'draft' }, revision: article.revision },
    'PUT',
  );
  assert.equal(response.status, 200);
  article = (await response.json()).article;
  assert.equal((await request('/blog/' + article.slug + '/')).status, 404);
  assert.equal((await request(imageUrl)).status, 404);
  assert.doesNotMatch(await (await request('/sitemap.xml')).text(), /\/blog\//);
  assert.equal(
    (
      await request(
        '/api/admin/articles/' + article.id + '?revision=' + article.revision,
        {
          method: 'DELETE',
          headers: { Cookie: cookie, Origin: 'https://other.invalid' },
        },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        '/api/admin/articles/' +
          article.id +
          '?revision=' +
          (article.revision - 1),
        { method: 'DELETE', headers: { Cookie: cookie, Origin: origin } },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        '/api/admin/articles/' + article.id + '?revision=' + article.revision,
        { method: 'DELETE', headers: { Cookie: cookie, Origin: origin } },
      )
    ).status,
    200,
  );
  assert.equal(application.store.articles.get(article.id), undefined);
  const collision = await json('/api/admin/articles', {
    requestId: randomUUID(),
    form: form({ slug: article.slug }),
  });
  assert.equal(collision.status, 200);
  assert.equal((await collision.json()).article.slug, article.slug + '-2');
});

test('migration from schema 2 preserves leads, attachments and legacy settings while using fixed upload limits', () => {
  const path = join(directory, 'legacy-v2.sqlite');
  const db = new DatabaseSync(path);
  db.exec(initialSchema + ';' + attachmentSchema + '; PRAGMA user_version=2');
  db.prepare('INSERT INTO leads VALUES (?,?,?,?,?,?)').run(
    'legacy',
    'hash',
    '{"name":"Старая заявка"}',
    '2020-01-01',
    'contact',
    'new',
  );
  db.prepare('INSERT INTO upload_settings VALUES (1,?)').run(
    JSON.stringify({
      maxFiles: 2,
      maxFileBytes: 1048576,
      maxTotalBytes: 2097152,
    }),
  );
  const oldFile = randomUUID();
  db.prepare('INSERT INTO lead_attachments VALUES (?,?,?,?,?,?,?,?)').run(
    oldFile,
    'legacy',
    'passport',
    'old.pdf',
    4,
    'application/pdf',
    'test',
    Buffer.from('test'),
  );
  db.close();
  const store = new Store(path);
  assert.equal(store.listLeads()[0].payload.name, 'Старая заявка');
  assert.equal(store.getAttachmentLimits().maxFiles, 6);
  assert.equal(
    Buffer.from(store.getAttachment(oldFile)!.bytes).toString(),
    'test',
  );
  assert.equal(store.articles.list().length, 0);
  store.close();
  const migrated = new DatabaseSync(path);
  assert.equal(
    JSON.parse(
      (
        migrated
          .prepare('SELECT settings FROM upload_settings WHERE id=1')
          .get() as {
          settings: string;
        }
      ).settings,
    ).maxFiles,
    2,
  );
  assert.equal(
    (migrated.prepare('PRAGMA user_version').get() as { user_version: number })
      .user_version,
    5,
  );
  migrated.close();
});

test('sanitization is idempotent and removes active HTML, inline styles and invalid image sources while preserving editorial tools', () => {
  const html =
    '<h1>Заголовок</h1><h3>Раздел</h3><p style="display:none"><strong>Жирный</strong> <em>Курсив</em></p><table style="width:99999px"><tbody><tr><td colspan="2" onclick="bad()"><p>Ячейка</p></td></tr></tbody></table><a href="https://example.invalid/" target="_blank">Ссылка</a><a href="//outside.invalid">Некорректный адрес</a><img src="data:image/svg+xml,evil"><script>bad()</script>';
  const clean = sanitizeArticleContent(html);
  assert.equal(sanitizeArticleContent(clean), clean);
  assert.match(clean, /<h2>Заголовок/);
  assert.match(clean, /<strong>Жирный/);
  assert.match(clean, /<em>Курсив/);
  assert.match(clean, /colspan="2"/);
  assert.match(clean, /noopener noreferrer/);
  assert.doesNotMatch(clean, /style=|onclick|script|data:|href="\/\//);
  assert.equal(
    articleSlug('Паспорт доступности ОСИ!'),
    'pasport-dostupnosti-osi',
  );
});
