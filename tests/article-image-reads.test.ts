import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { createApplication } from '../server/application';
import { ArticleRepository } from '../server/articles/repository';
import { emptyArticle, type ArticleForm } from '../src/features/articles/model';

const bytes = await sharp(randomBytes(640 * 480 * 3), {
  raw: { width: 640, height: 480, channels: 3 },
})
  .webp({ quality: 82 })
  .toBuffer();
const etag = '"' + createHash('sha256').update(bytes).digest('hex') + '"';
const deadline = { timeout: 15000 };

async function fixture(t: TestContext, published = true) {
  const password = 'synthetic-image-read-password';
  const config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    trustProxy: 0,
    appOrigin: '',
    adminPasswordHash: createHash('sha256').update(password).digest('hex'),
    adminSessionSecret: 'synthetic-image-read-secret-at-least-32',
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
  const request = (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    // Avoid fetch's automatic no-cache insertion for conditional requests.
    if (!headers.has('Cache-Control'))
      headers.set('Cache-Control', 'max-age=0');
    return fetch(origin + path, {
      ...options,
      headers,
      signal: AbortSignal.timeout(5000),
    });
  };
  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  await login.arrayBuffer();
  const articles = application.store.articles;
  const image = articles.addImage(bytes, 640, 480);
  const id = image.url.split('/').at(-1)!.slice(0, -5);
  let article = articles.save(
    {
      ...emptyArticle(),
      title: 'Synthetic image read article',
      slug: 'image-read-article',
      content: '<p>Synthetic article image</p>',
      image: image.url,
      imageAlt: 'Synthetic cover',
      status: published ? 'published' : 'draft',
      seoTitle: 'Synthetic image read article',
      seoDescription: 'Synthetic article image',
    },
    { requestId: randomUUID() },
  );
  const update = (overrides: Partial<ArticleForm>) => {
    article = articles.save(
      { ...article, ...overrides },
      { id: article.id, revision: article.revision },
    );
    return article;
  };
  const load = articles.image.bind(articles);
  let loadedBytes = 0;
  const read = t.mock.method(articles, 'image', (imageId: string) => {
    const file = load(imageId);
    loadedBytes += file?.bytes.byteLength || 0;
    return file;
  });
  return {
    ...application,
    articles,
    article,
    update,
    image,
    id,
    request,
    cookie,
    origin,
    read,
    loadedBytes: () => loadedBytes,
  };
}

function imageHeaders(response: Response, published = true) {
  assert.equal(response.headers.get('etag'), etag);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(
    response.headers.get('cache-control'),
    published ? 'public, max-age=0, must-revalidate' : 'private, no-store',
  );
}

test('metadata projection does not evaluate the SQLite BLOB column', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.function('load_bytes', () => {
    throw new Error('Unexpected BLOB evaluation');
  });
  db.exec(`
    CREATE TABLE metadata (id TEXT PRIMARY KEY, size INTEGER, sha256 TEXT);
    CREATE TABLE articles (id TEXT PRIMARY KEY, status TEXT, deleted_at TEXT);
    CREATE TABLE article_image_refs (article_id TEXT, image_id TEXT);
    INSERT INTO metadata VALUES ('test-image', 750220, 'synthetic-hash');
    CREATE VIEW article_images AS
      SELECT id, size, sha256, load_bytes() AS bytes FROM metadata;
  `);
  const articles = new ArticleRepository(db);
  assert.deepEqual(
    { ...articles.imageMetadata('test-image') },
    {
      size: 750220,
      sha256: 'synthetic-hash',
      published: 0,
    },
  );
  assert.equal(articles.imageMetadata('missing'), undefined);
  assert.throws(
    () => articles.image('test-image'),
    /Unexpected BLOB evaluation/,
  );
});

test(
  'normal image GET reads one BLOB and returns the original WebP with its existing headers',
  deadline,
  async (t) => {
    const f = await fixture(t);
    const response = await f.request(f.image.url);
    assert.equal(response.status, 200);
    imageHeaders(response);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.equal(response.headers.get('content-length'), String(bytes.length));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    assert.equal(f.read.mock.callCount(), 1);
    assert.equal(f.loadedBytes(), bytes.length);
  },
);

test(
  'public and authenticated private HEAD preserve the GET length without reading the BLOB',
  deadline,
  async (t) => {
    const f = await fixture(t);
    for (const published of [true, false]) {
      if (!published) f.update({ status: 'draft' });
      const response = await f.request(f.image.url, {
        method: 'HEAD',
        headers: published ? {} : { Cookie: f.cookie },
      });
      assert.equal(response.status, 200);
      imageHeaders(response, published);
      assert.equal(response.headers.get('content-type'), 'image/webp');
      assert.equal(
        response.headers.get('content-length'),
        String(bytes.length),
      );
      assert.equal((await response.arrayBuffer()).byteLength, 0);
    }
    assert.equal(f.read.mock.callCount(), 0);
    assert.equal(f.loadedBytes(), 0);
  },
);

test(
  'matching strong, weak, list and wildcard validators return 304 before loading bytes for GET and HEAD',
  deadline,
  async (t) => {
    const f = await fixture(t);
    for (const method of ['GET', 'HEAD'])
      for (const condition of [
        etag,
        'W/' + etag,
        '"other", W/' + etag,
        etag + ', "other"',
        '*',
      ]) {
        const response = await f.request(f.image.url, {
          method,
          headers: { 'If-None-Match': condition },
        });
        assert.equal(response.status, 304, method + ' ' + condition);
        imageHeaders(response);
        assert.equal(response.headers.get('content-length'), null);
        assert.equal(response.headers.get('content-type'), null);
        assert.equal((await response.arrayBuffer()).byteLength, 0);
      }
    assert.equal(f.read.mock.callCount(), 0);
    assert.equal(f.loadedBytes(), 0);
  },
);

test(
  'stale validators and reload requests preserve existing status and body behavior',
  deadline,
  async (t) => {
    const f = await fixture(t);
    let reads = 0;
    for (const condition of ['"stale"', 'W/"stale"', 'not-an-etag']) {
      const response = await f.request(f.image.url, {
        headers: { 'If-None-Match': condition },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
      assert.equal(f.read.mock.callCount(), ++reads);
    }
    for (const [condition, status] of [
      [etag, 304],
      ['W/' + etag, 200],
      ['*', 200],
    ] as const) {
      const response = await f.request(f.image.url, {
        headers: { 'If-None-Match': condition, 'Cache-Control': 'no-cache' },
      });
      assert.equal(response.status, status);
      assert.equal(
        (await response.arrayBuffer()).byteLength,
        status === 200 ? bytes.length : 0,
      );
      if (status === 200) reads++;
      assert.equal(f.read.mock.callCount(), reads);
    }
  },
);

test(
  'private validators cannot bypass a live admin session and retain private no-store responses',
  deadline,
  async (t) => {
    const f = await fixture(t, false);
    for (const method of ['GET', 'HEAD'])
      for (const condition of [etag, '*']) {
        const denied = await f.request(f.image.url, {
          method,
          headers: { 'If-None-Match': condition, Cookie: 'osi_admin=forged' },
        });
        assert.equal(denied.status, 404);
        assert.notEqual(denied.headers.get('etag'), etag);
        await denied.arrayBuffer();
      }
    assert.equal(f.read.mock.callCount(), 0);
    const authorized = await f.request(f.image.url, {
      headers: { Cookie: f.cookie },
    });
    assert.equal(authorized.status, 200);
    imageHeaders(authorized, false);
    assert.deepEqual(Buffer.from(await authorized.arrayBuffer()), bytes);
    for (const method of ['GET', 'HEAD']) {
      const conditional = await f.request(f.image.url, {
        method,
        headers: { Cookie: f.cookie, 'If-None-Match': 'W/' + etag },
      });
      assert.equal(conditional.status, 304);
      imageHeaders(conditional, false);
      await conditional.arrayBuffer();
    }
    const reload = await f.request(f.image.url, {
      headers: {
        Cookie: f.cookie,
        'If-None-Match': etag,
        'Cache-Control': 'no-cache',
      },
    });
    assert.equal(reload.status, 200);
    imageHeaders(reload, false);
    assert.deepEqual(Buffer.from(await reload.arrayBuffer()), bytes);
    assert.equal(f.read.mock.callCount(), 2);
    const logout = await f.request('/api/admin/login', {
      method: 'DELETE',
      headers: { Origin: f.origin, Cookie: f.cookie },
    });
    assert.equal(logout.status, 200);
    await logout.arrayBuffer();
    for (const method of ['GET', 'HEAD']) {
      const expired = await f.request(f.image.url, {
        method,
        headers: { Cookie: f.cookie, 'If-None-Match': '*' },
      });
      assert.equal(expired.status, 404);
      assert.notEqual(expired.headers.get('etag'), etag);
      await expired.arrayBuffer();
    }
    assert.equal(f.read.mock.callCount(), 2);
  },
);

test(
  'cover and inline references keep an image public only while a live published article refers to it',
  deadline,
  async (t) => {
    const f = await fixture(t);
    const other = f.articles.save(
      {
        ...emptyArticle(),
        title: 'Second reference',
        slug: 'second-reference',
        content:
          '<p>Inline reference</p><img src="' +
          f.image.url +
          '" alt="Synthetic inline image">',
        status: 'published',
        seoTitle: 'Second reference',
        seoDescription: 'Synthetic reference',
      },
      { requestId: randomUUID() },
    );
    f.update({ status: 'draft' });
    const stillPublic = await f.request(f.image.url, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(stillPublic.status, 304);
    await stillPublic.arrayBuffer();
    f.articles.remove(other.id, other.revision);
    for (const method of ['GET', 'HEAD']) {
      const hidden = await f.request(f.image.url, {
        method,
        headers: { 'If-None-Match': etag },
      });
      assert.equal(hidden.status, 404);
      assert.notEqual(hidden.headers.get('etag'), etag);
      await hidden.arrayBuffer();
    }
    f.update({ status: 'published' });
    const restored = await f.request(f.image.url, { method: 'HEAD' });
    assert.equal(restored.status, 200);
    imageHeaders(restored);
    await restored.arrayBuffer();
    assert.equal(f.read.mock.callCount(), 0);
  },
);

test(
  'missing images and unsupported HEAD endpoints retain real error statuses without reading image bodies',
  deadline,
  async (t) => {
    const f = await fixture(t);
    const missing = '/media/articles/' + randomUUID() + '.webp';
    for (const method of ['GET', 'HEAD'])
      for (const cookie of ['', f.cookie]) {
        const response = await f.request(missing, {
          method,
          headers: { Cookie: cookie, 'If-None-Match': '*' },
        });
        assert.equal(response.status, 404);
        assert.notEqual(response.headers.get('etag'), etag);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        await response.arrayBuffer();
      }
    const unsupported = await f.request('/api/admin/session', {
      method: 'HEAD',
      headers: { Cookie: f.cookie },
    });
    assert.equal(unsupported.status, 405);
    assert.equal(unsupported.headers.get('allow'), 'GET');
    assert.equal((await unsupported.arrayBuffer()).byteLength, 0);
    assert.equal(f.read.mock.callCount(), 0);
  },
);
