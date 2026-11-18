import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { createApplication } from '../server/application';
import { articleImagePath, emptyArticle } from '../src/features/articles/model';
import { draftImageIds } from '../src/components/admin/articles/local-draft';
import { cleanupImageSchema } from '../src/lib/storage';
import { Store } from '../server/db/store';

test('descriptive image filenames are unique, private until publication, WebP and compatible with old URLs', async (t) => {
  const password = 'synthetic-seo-image-password';
  const config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    trustProxy: 0,
    appOrigin: '',
    adminPasswordHash: createHash('sha256').update(password).digest('hex'),
    adminSessionSecret: 'synthetic-seo-image-session-secret-32-characters',
  };
  const app = await createApplication(config);
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await app.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  config.appOrigin = origin;
  const request = (path: string, options: RequestInit = {}) =>
    fetch(origin + path, options);
  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const png = await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#678a22' },
  })
    .png()
    .toBuffer();
  async function upload(
    seoName?: string,
    authenticated = true,
    requestOrigin = origin,
  ) {
    const body = new FormData();
    body.set(
      'image',
      new File([new Uint8Array(png)], 'photo.png', { type: 'image/png' }),
    );
    if (seoName !== undefined) body.set('seoName', seoName);
    return request('/api/admin/article-images', {
      method: 'POST',
      headers: {
        Origin: requestOrigin,
        ...(authenticated ? { Cookie: cookie } : {}),
      },
      body,
    });
  }
  assert.equal((await upload('Тест', false)).status, 401);
  assert.equal(
    (await upload('Тест', true, 'https://other.invalid')).status,
    403,
  );
  const firstResponse = await upload('Николай осматривает пандус');
  assert.equal(firstResponse.status, 200, await firstResponse.clone().text());
  const first = (await firstResponse.json()) as { url: string };
  assert.equal(first.url, '/media/articles/nikolay-osmatrivaet-pandus.webp');
  const secondResponse = await upload('Николай осматривает пандус');
  assert.equal(secondResponse.status, 200);
  const second = (await secondResponse.json()) as { url: string };
  assert.equal(second.url, '/media/articles/nikolay-osmatrivaet-pandus-2.webp');
  const oldResponse = await upload();
  const old = (await oldResponse.json()) as { url: string };
  assert.match(old.url, /^\/media\/articles\/[a-f0-9-]{36}\.webp$/);
  assert.equal((await upload('---')).status, 400);
  assert.equal((await request(first.url)).status, 404);
  const privateResponse = await request(first.url, {
    headers: { Cookie: cookie },
  });
  assert.equal(privateResponse.status, 200);
  assert.equal(privateResponse.headers.get('content-type'), 'image/webp');
  assert.equal(
    privateResponse.headers.get('cache-control'),
    'private, no-store',
  );
  assert.equal(
    (await sharp(Buffer.from(await privateResponse.arrayBuffer())).metadata())
      .format,
    'webp',
  );
  assert.equal(articleImagePath.test(first.url), true);
  assert.equal(articleImagePath.test('/media/articles/../private.webp'), false);
  assert.equal(
    articleImagePath.test('/media/articles/example.webp?download=1'),
    false,
  );

  const form = {
    ...emptyArticle(),
    title: 'Тест',
    slug: 'test-seo-image',
    status: 'published' as const,
    seoTitle: 'Тест SEO',
    seoDescription: 'Тестовое описание',
    image: first.url,
    imageAlt: 'Николай осматривает пандус',
    content: `<h2>Вход</h2><p>Доступный вход.</p><img src="${second.url}" alt="Пандус">`,
  };
  const saved = app.store.articles.save(form, { requestId: randomUUID() });
  assert.ok(saved.content.includes(second.url));
  for (const url of [first.url, second.url]) {
    const response = await request(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.match(response.headers.get('cache-control') || '', /^public/);
    const etag = response.headers.get('etag');
    assert.ok(etag);
    assert.equal(
      (await request(url, { headers: { 'If-None-Match': etag } })).status,
      304,
    );
    assert.equal((await request(url, { method: 'HEAD' })).status, 200);
  }
  assert.equal((await request(old.url)).status, 404);
  assert.equal(
    (await request(old.url, { headers: { Cookie: cookie } })).status,
    200,
  );
  const unpublish = app.store.articles.save(
    { ...saved, status: 'draft' },
    { id: saved.id, revision: saved.revision },
  );
  assert.equal(unpublish.status, 'draft');
  assert.equal((await request(first.url)).status, 404);
});

test('descriptive image ids are protected in local drafts and accepted by storage cleanup', () => {
  const first = 'nikolay-osmatrivaet-pandus';
  const second = 'shema-vhoda-2';
  const raw = JSON.stringify({
    form: {
      ...emptyArticle(),
      image: `/media/articles/${first}.webp`,
      content: `<img src="/media/articles/${second}.webp">`,
    },
  });
  assert.deepEqual(draftImageIds(raw), new Set([second, first]));
  assert.equal(
    cleanupImageSchema.safeParse({ id: first, sha256: 'a'.repeat(64) }).success,
    true,
  );
  assert.equal(
    cleanupImageSchema.safeParse({ id: '../private', sha256: 'a'.repeat(64) })
      .success,
    false,
  );
});

test('storage cleanup retains referenced SEO images and deletes eligible unreferenced ones', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-images-'));
  const path = join(dir, 'site.sqlite');
  const store = new Store(path);
  const database = new DatabaseSync(path);
  t.after(() => {
    database.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const bytes = await sharp({
    create: { width: 4, height: 4, channels: 3, background: '#385b21' },
  })
    .webp()
    .toBuffer();
  const referenced = store.articles.addImage(bytes, 4, 4, 'Схема входа');
  const unused = store.articles.addImage(bytes, 4, 4, 'Другая схема');
  database
    .prepare('UPDATE article_images SET created_at=?')
    .run('2020-01-01T00:00:00.000Z');
  store.articles.save(
    {
      ...emptyArticle(),
      title: 'Draft',
      content: `<img src="${referenced.url}" alt="Схема">`,
    },
    { requestId: randomUUID() },
  );
  const id = unused.url.split('/').at(-1)!.slice(0, -5);
  const refId = referenced.url.split('/').at(-1)!.slice(0, -5);
  const preview = store.storage.preview();
  assert.deepEqual(
    preview.images.map((image) => image.id),
    [id],
  );
  const selected = cleanupImageSchema.parse(preview.images[0]);
  assert.equal(store.storage.cleanup([selected]).count, 1);
  assert.ok(store.articles.image(refId));
  assert.equal(store.articles.image(id), undefined);
});
