import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Server } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { Store } from '../server/db/store';
import { StorageConflict } from '../server/storage/repository';
import { ArticleError } from '../server/articles/repository';
import { createApplication } from '../server/application';
import { emptyArticle } from '../src/features/articles/model';
import {
  cleanupBatchSize,
  cleanupPreviewSchema,
  storageReportSchema,
  storageLevel,
  storageLimits,
  type CleanupPreview,
} from '../src/lib/storage';
import { draftImageIds } from '../src/components/admin/articles/local-draft';
import StorageCleanup from '../src/components/admin/storage/StorageCleanup';
import StorageUsage from '../src/components/admin/storage/StorageUsage';
import {
  createBackup,
  restoreBackup,
} from '../scripts/lib/database-backup.mjs';
import { pdf } from './fixtures/documents';

const bytes = await sharp({
  create: { width: 2, height: 2, channels: 3, background: '#555555' },
})
  .webp()
  .toBuffer();
const sha = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');
const old = '2020-01-01T00:00:00.000Z';
function fixture(t: TestContext, automaticCleanup = true) {
  const directory = mkdtempSync(join(tmpdir(), 'passport-storage-'));
  const filename = join(directory, 'site.sqlite');
  const store = new Store(filename);
  const db = new DatabaseSync(filename, { timeout: 5000 });
  db.exec('PRAGMA foreign_keys=ON');
  const close = () => {
    db.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  };
  if (automaticCleanup) t.after(close);
  function image(createdAt = old) {
    const result = store.articles.addImage(bytes, 2, 2);
    const id = result.url.split('/').at(-1)!.slice(0, -5);
    db.prepare('UPDATE article_images SET created_at=? WHERE id=?').run(
      createdAt,
      id,
    );
    return { id, sha256: sha(bytes) };
  }
  function article(
    id: string,
    status: 'draft' | 'published' = 'draft',
    cover = false,
  ) {
    return store.articles.save(
      {
        ...emptyArticle(),
        title: 'Синтетическая статья',
        content: cover
          ? '<p>Синтетический текст</p>'
          : `<p>Текст</p><img src="/media/articles/${id}.webp" alt="Схема">`,
        image: cover ? `/media/articles/${id}.webp` : '',
        imageAlt: 'Схема',
        status,
        seoTitle: 'Тест',
        seoDescription: 'Тестовая статья',
      },
      { requestId: randomUUID() },
    );
  }
  function attachment(id: string = randomUUID()) {
    store.insertLead(
      randomUUID(),
      'synthetic-hash',
      { name: 'Синтетическая заявка' },
      old,
      'contact',
      [
        {
          id,
          kind: 'passport',
          name: 'test.pdf',
          size: pdf.length,
          contentType: 'application/pdf',
          sha256: sha(pdf),
          bytes: pdf,
        },
      ],
    );
    return id;
  }
  return { directory, filename, store, db, image, article, attachment, close };
}

test('storage reports exact separate quotas without file bodies and preserves the existing schema', (t) => {
  const f = fixture(t);
  const image = f.image();
  const attachment = f.attachment();
  const report = storageReportSchema.parse(f.store.storage.report());
  assert.deepEqual(report, {
    attachments: { bytes: pdf.length, count: 1, limit: 512 * 1024 * 1024 },
    images: { bytes: bytes.length, count: 1, limit: 256 * 1024 * 1024 },
  });
  assert.equal(f.db.prepare('PRAGMA user_version').get()!.user_version, 4);
  const reopened = new Store(f.filename);
  try {
    assert.deepEqual(reopened.storage.report(), report);
  } finally {
    reopened.close();
  }
  assert.deepEqual(Buffer.from(f.store.getAttachment(attachment)!.bytes), pdf);
  assert.deepEqual(Buffer.from(f.store.articles.image(image.id)!.bytes), bytes);
});

test('quota warnings start at 80 percent and full status uses exact bytes rather than rounded display', () => {
  const usage = { bytes: 7999, count: 1, limit: 10000 };
  assert.equal(storageLevel(usage), 'ok');
  assert.equal(storageLevel({ ...usage, bytes: 8000 }), 'warning');
  assert.equal(storageLevel({ ...usage, bytes: 9999 }), 'warning');
  assert.equal(storageLevel({ ...usage, bytes: 10000 }), 'full');
  assert.equal(storageLevel({ ...usage, bytes: 10001 }), 'full');
});

test('preview protects cover and body images in published, draft and soft-deleted articles and excludes recent or invalid dates', (t) => {
  const f = fixture(t);
  const orphan = f.image();
  for (const status of ['draft', 'published'] as const) {
    for (const cover of [true, false]) f.article(f.image().id, status, cover);
  }
  const deleted = f.image();
  const article = f.article(deleted.id);
  f.store.articles.remove(article.id, article.revision);
  f.image(new Date().toISOString());
  f.image('2099-01-01T00:00:00.000Z');
  f.image('invalid-date');
  const preview = cleanupPreviewSchema.parse(f.store.storage.preview());
  assert.equal(preview.total, 1);
  assert.deepEqual(
    preview.images.map((image) => image.id),
    [orphan.id],
  );
  assert.equal(preview.bytes, bytes.length);
  assert.ok(preview.images.every((image) => !('bytes' in image)));
  assert.throws(() => f.store.storage.cleanup([deleted]), StorageConflict);
});

test('preview is bounded and each confirmed batch leaves later candidates untouched', (t) => {
  const f = fixture(t);
  for (let index = 0; index < cleanupBatchSize + 3; index++) f.image();
  const preview = f.store.storage.preview();
  assert.equal(preview.total, 103);
  assert.equal(preview.images.length, 100);
  assert.deepEqual(f.store.storage.cleanup(preview.images), {
    count: 100,
    bytes: 100 * bytes.length,
  });
  assert.equal(f.store.storage.preview().total, 3);
  assert.equal(f.store.storage.report().images.count, 3);
});

test('cleanup deletes only selected images while preserving PDFs, article payloads and unselected files', (t) => {
  const f = fixture(t);
  const remove = f.image();
  const keep = f.image();
  const referenced = f.image();
  const article = f.article(referenced.id, 'published');
  const attachment = f.attachment(remove.id);
  const before = f.store.storage.report();
  assert.deepEqual(f.store.storage.cleanup([remove]), {
    count: 1,
    bytes: bytes.length,
  });
  assert.equal(f.store.articles.image(remove.id), undefined);
  assert.deepEqual(Buffer.from(f.store.articles.image(keep.id)!.bytes), bytes);
  assert.deepEqual(f.store.articles.get(article.id), article);
  assert.deepEqual(Buffer.from(f.store.getAttachment(attachment)!.bytes), pdf);
  assert.deepEqual(f.store.storage.report().attachments, before.attachments);
  assert.equal(
    f.store.storage.report().images.bytes,
    before.images.bytes - bytes.length,
  );
});

test('a stale or forged selection rolls the entire batch back, including still-eligible images', (t) => {
  const f = fixture(t);
  const first = f.image();
  const linked = f.image();
  f.article(linked.id);
  const recent = f.image(new Date().toISOString());
  const invalid = f.image('invalid-date');
  const missing = { id: randomUUID(), sha256: sha('absent') };
  for (const selected of [
    [],
    [first, first],
    [first, linked],
    [first, recent],
    [first, invalid],
    [first, missing],
    [first, { ...first, sha256: sha('changed') }],
  ]) {
    const before = f.store.storage.report();
    assert.throws(() => f.store.storage.cleanup(selected), StorageConflict);
    assert.deepEqual(f.store.storage.report(), before);
    assert.ok(f.store.articles.image(first.id));
  }
});

test('a reference saved after preview prevents deletion and a save after cleanup fails without a partial article', (t) => {
  const f = fixture(t);
  const first = f.image();
  const second = f.image();
  const preview = f.store.storage.preview();
  f.article(second.id, 'published');
  assert.throws(() => f.store.storage.cleanup(preview.images), StorageConflict);
  assert.ok(f.store.articles.image(first.id));
  f.store.storage.cleanup([first]);
  const count = f.store.articles.list().length;
  assert.throws(() => f.article(first.id), ArticleError);
  assert.equal(f.store.articles.list().length, count);
  assert.ok(f.store.articles.image(second.id));
});

test('cleanup restores upload capacity using the same quota as image admission and a failed upload leaves the transaction usable', (t) => {
  const f = fixture(t);
  const remove = f.image();
  f.db
    .prepare('UPDATE article_images SET size=? WHERE id=?')
    .run(storageLimits.images, remove.id);
  assert.equal(storageLevel(f.store.storage.report().images), 'full');
  assert.throws(() => f.image(), /Хранилище изображений заполнено/);
  assert.equal(f.store.storage.report().images.count, 1);
  assert.equal(f.store.storage.cleanup([remove]).bytes, storageLimits.images);
  f.image();
  assert.equal(f.store.storage.report().images.bytes, bytes.length);
});

test('backup made before cleanup can restore images and linked articles without changing the working data', async (t) => {
  const f = fixture(t);
  const remove = f.image();
  const keep = f.image();
  const article = f.article(keep.id);
  const attachment = f.attachment();
  const snapshot = join(f.directory, 'snapshot');
  assert.equal((await createBackup(f.filename, snapshot)).schemaVersion, 4);
  f.store.storage.cleanup([remove]);
  const restored = await restoreBackup(snapshot, join(f.directory, 'restored'));
  const store = new Store(restored.databasePath);
  try {
    assert.deepEqual(
      Buffer.from(store.articles.image(remove.id)!.bytes),
      bytes,
    );
    assert.deepEqual(store.articles.get(article.id), article);
    assert.deepEqual(Buffer.from(store.getAttachment(attachment)!.bytes), pdf);
    assert.equal(f.store.articles.image(remove.id), undefined);
  } finally {
    store.close();
  }
});

async function httpFixture(t: TestContext) {
  const f = fixture(t, false);
  const password = 'synthetic-storage-password';
  const config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: f.filename,
    trustProxy: 0,
    adminPasswordHash: sha(password),
    adminSessionSecret: 'synthetic-storage-secret-longer-than-32',
    appOrigin: '',
  };
  const application = await createApplication(config);
  const server = await new Promise<Server>((resolve) => {
    const listener = application.app.listen(0, '127.0.0.1', () =>
      resolve(listener),
    );
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await application.close();
    f.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  config.appOrigin = origin;
  const request = (path: string, options: RequestInit = {}) =>
    fetch(origin + path, { ...options, signal: AbortSignal.timeout(8000) });
  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    request('/api/admin/storage/cleanup', {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: cookie,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return { ...f, origin, request, cookie, post };
}

test('storage HTTP endpoints require live sessions, reject cross-origin writes and never expose private files in reports', async (t) => {
  const f = await httpFixture(t);
  const image = f.image();
  f.attachment();
  for (const path of ['/api/admin/storage', '/api/admin/storage/cleanup']) {
    assert.equal((await f.request(path)).status, 401);
    const response = await f.request(path, { headers: { Cookie: f.cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text();
    assert.ok(!text.includes('Синтетическая заявка'));
    assert.ok(!text.includes('test.pdf'));
  }
  assert.equal(
    (
      await f.post(
        { confirm: true, images: [image] },
        { Origin: 'https://other.invalid' },
      )
    ).status,
    403,
  );
  assert.ok(f.store.articles.image(image.id));
  assert.equal(
    (
      await f.request('/api/admin/login', {
        method: 'DELETE',
        headers: { Cookie: f.cookie, Origin: f.origin },
      })
    ).status,
    200,
  );
  assert.equal((await f.post({ confirm: true, images: [image] })).status, 401);
});

test('cleanup HTTP validates confirmation and selection, rechecks references and requires a new preview after stale retries', async (t) => {
  const f = await httpFixture(t);
  const first = f.image();
  const second = f.image();
  for (const body of [
    { images: [first] },
    { confirm: false, images: [first] },
    { confirm: true, images: [] },
    { confirm: true, images: [{ ...first, id: '../file' }] },
    { confirm: true, images: [first], all: true },
    { confirm: true, images: Array.from({ length: 101 }, () => first) },
  ]) {
    assert.equal((await f.post(body)).status, 400);
    assert.ok(f.store.articles.image(first.id));
  }
  assert.equal(
    (await f.post({ confirm: true, images: [first, first] })).status,
    409,
  );
  const previewResponse = await f.request('/api/admin/storage/cleanup', {
    headers: { Cookie: f.cookie },
  });
  const preview = cleanupPreviewSchema.parse(await previewResponse.json());
  f.article(second.id);
  assert.equal(
    (
      await f.post({
        confirm: true,
        images: preview.images.map(({ id, sha256 }) => ({ id, sha256 })),
      })
    ).status,
    409,
  );
  assert.ok(f.store.articles.image(first.id));
  const success = await f.post({ confirm: true, images: [first] });
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), {
    ok: true,
    removed: { count: 1, bytes: bytes.length },
  });
  const fresh = f.image();
  assert.equal((await f.post({ confirm: true, images: [first] })).status, 409);
  assert.ok(f.store.articles.image(fresh.id));
  assert.ok(f.store.articles.image(second.id));
});

test('browser draft protection covers body and cover images and fails closed for unreadable drafts', () => {
  const first = randomUUID();
  const second = randomUUID();
  const raw = JSON.stringify({
    form: {
      ...emptyArticle(),
      image: `/media/articles/${first}.webp`,
      content: `<img src="/media/articles/${second}.webp">`,
    },
  });
  assert.deepEqual(draftImageIds(raw), new Set([second, first]));
  assert.equal(draftImageIds(null).size, 0);
  assert.throws(() => draftImageIds('{invalid'));
  assert.throws(() =>
    draftImageIds(JSON.stringify({ form: { content: 'partial' } })),
  );
});

test('cleanup controls require a choice and confirmation and disable locally protected images', () => {
  const id = randomUUID();
  const preview: CleanupPreview = {
    total: 1,
    bytes: bytes.length,
    images: [
      {
        id,
        sha256: sha(bytes),
        size: bytes.length,
        width: 2,
        height: 2,
        createdAt: old,
      },
    ],
  };
  const props = {
    preview,
    selected: new Set<string>(),
    protectedIds: new Set([id]),
    confirmed: false,
    pending: false,
    onSelect: () => {},
    onConfirm: () => {},
    onRemove: () => {},
  };
  const html = renderToStaticMarkup(createElement(StorageCleanup, props));
  assert.match(html, /type="checkbox" disabled=""/);
  assert.match(html, /disabled="">Удалить выбранные изображения/);
  assert.ok(html.includes('локальном черновике'));
  const ready = renderToStaticMarkup(
    createElement(StorageCleanup, {
      ...props,
      selected: new Set([id]),
      protectedIds: new Set<string>(),
      confirmed: true,
    }),
  );
  assert.doesNotMatch(ready, /<button[^>]*disabled/);
  const usage = renderToStaticMarkup(
    createElement(StorageUsage, {
      title: 'Вложения заявок',
      usage: {
        bytes: storageLimits.attachments,
        count: 1,
        limit: storageLimits.attachments,
      },
    }),
  );
  assert.ok(usage.includes('Лимит достигнут'));
  assert.ok(usage.includes('aria-label='));
});
