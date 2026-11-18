import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Server } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Store } from '../server/db/store';
import { createApplication } from '../server/application';
import {
  startArticleScheduler,
  articleScheduleInterval,
} from '../server/articles/scheduler';
import {
  emptyArticle,
  articleFormSchema,
  type ArticleForm,
} from '../src/features/articles/model';
import { initialArticleQuery } from '../src/features/articles/listing';
import {
  scheduleInput,
  scheduleTimestamp,
  scheduledDate,
  scheduleError,
  articleSaveLabel,
} from '../src/features/articles/schedule';
import ArticlePublication from '../src/components/admin/articles/ArticlePublication';
import {
  createBackup,
  restoreBackup,
} from '../scripts/lib/database-backup.mjs';

const due = '2035-01-02T09:00:00.000Z';
function form(overrides: Partial<ArticleForm> = {}): ArticleForm {
  return {
    ...emptyArticle(),
    title: 'Публикация по расписанию',
    slug: 'scheduled-test',
    content:
      '<h2>Проверка доступности</h2><p>Синтетический материал для проверки отложенной публикации.</p>',
    seoTitle: 'Публикация по расписанию',
    seoDescription: 'Синтетическое описание статьи',
    status: 'scheduled',
    scheduledAt: due,
    ...overrides,
  };
}
function fixture(t: TestContext, automaticCleanup = true) {
  const directory = mkdtempSync(join(tmpdir(), 'osi-schedule-'));
  const filename = join(directory, 'site.sqlite');
  const store = new Store(filename);
  const close = () => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  };
  if (automaticCleanup) t.after(close);
  return { store, filename, directory, articles: store.articles, close };
}

test('scheduling requires complete publication data, a future timestamp and an existing image', (t) => {
  const { articles } = fixture(t);
  for (const overrides of [
    { scheduledAt: null },
    { scheduledAt: '2000-01-01T00:00:00.000Z' },
    { content: '<script>bad()</script>' },
    { seoTitle: '' },
    { seoDescription: '' },
    { image: '/media/articles/' + randomUUID() + '.webp', imageAlt: '' },
  ]) {
    assert.throws(() =>
      articles.save(form(overrides), { requestId: randomUUID() }),
    );
  }
  assert.equal(articles.list().length, 0);
  const scheduled = articles.save(form(), { requestId: randomUUID() });
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.scheduledAt, due);
  assert.equal(scheduled.publishedAt, null);
  assert.equal(articles.bySlug(scheduled.slug), undefined);
  assert.equal(articles.queries.publicPage(initialArticleQuery).total, 0);
  assert.deepEqual(articles.queries.publishedSlugs(), []);
  assert.equal(
    articles.queries.adminPage({ ...initialArticleQuery, status: 'scheduled' })
      .total,
    1,
  );
  assert.equal(
    articles.queries.adminPage({ ...initialArticleQuery, status: 'draft' })
      .total,
    0,
  );
});

test('publication changes visibility and revision once, even with two database connections', (t) => {
  const f = fixture(t);
  const requestId = randomUUID();
  const scheduled = f.articles.save(form(), { requestId });
  const second = new Store(f.filename);
  try {
    assert.equal(f.articles.publishDue(new Date(Date.parse(due) - 1)), 0);
    assert.equal(f.articles.publishDue(new Date(due)), 1);
    assert.equal(second.articles.publishDue(new Date(due)), 0);
    const published = f.articles.get(scheduled.id)!;
    assert.equal(published.status, 'published');
    assert.equal(published.scheduledAt, null);
    assert.equal(published.publishedAt, due);
    assert.equal(published.revision, 2);
    assert.equal(f.articles.bySlug(scheduled.slug)?.id, scheduled.id);
    assert.deepEqual(f.articles.queries.publishedSlugs(), [scheduled.slug]);
    assert.throws(
      () =>
        f.articles.save(form({ status: 'draft', scheduledAt: null }), {
          id: scheduled.id,
          revision: scheduled.revision,
        }),
      /другой вкладке/,
    );
    assert.equal(f.articles.save(form(), { requestId }).id, scheduled.id);
    assert.equal(f.articles.list().length, 1);
  } finally {
    second.close();
  }
});

test('editing a schedule, cancelling, publishing now and deleting cannot leave an active old timer', (t) => {
  const { articles } = fixture(t);
  let article = articles.save(form(), { requestId: randomUUID() });
  const later = '2035-01-03T09:00:00.000Z';
  article = articles.save(form({ scheduledAt: later }), {
    id: article.id,
    revision: article.revision,
  });
  assert.equal(articles.publishDue(new Date(due)), 0);
  article = articles.save(form({ status: 'draft' }), {
    id: article.id,
    revision: article.revision,
  });
  assert.equal(article.scheduledAt, null);
  assert.equal(articles.publishDue(new Date(later)), 0);
  article = articles.save(form(), {
    id: article.id,
    revision: article.revision,
  });
  article = articles.save(form({ status: 'published' }), {
    id: article.id,
    revision: article.revision,
  });
  assert.equal(article.scheduledAt, null);
  assert.equal(articles.publishDue(new Date(later)), 0);
  assert.throws(
    () => articles.save(form(), { id: article.id, revision: article.revision }),
    /Сначала сохраните/,
  );
  const removed = articles.save(form({ slug: 'removed' }), {
    requestId: randomUUID(),
  });
  articles.remove(removed.id, removed.revision);
  assert.equal(articles.publishDue(new Date(later)), 0);
  assert.equal(articles.bySlug(removed.slug), undefined);
});

test('an expired identical creation retry returns the saved article instead of creating a duplicate', (t) => {
  const { articles } = fixture(t);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(due) - 60000 });
  const requestId = randomUUID();
  const article = articles.save(form(), { requestId });
  t.mock.timers.tick(120000);
  assert.equal(articles.save(form(), { requestId }).id, article.id);
  assert.throws(
    () => articles.save(form(), { requestId: randomUUID() }),
    /в будущем/,
  );
  assert.equal(articles.list().length, 1);
});

test('a rejected scheduled edit preserves its text, old time, revision and image references', (t) => {
  const { articles } = fixture(t);
  const article = articles.save(form(), { requestId: randomUUID() });
  assert.throws(() =>
    articles.save(
      form({ seoTitle: '', scheduledAt: '2035-01-03T00:00:00.000Z' }),
      {
        id: article.id,
        revision: article.revision,
      },
    ),
  );
  assert.deepEqual(articles.get(article.id), article);
});

test('scheduler catches up on startup, retries after an error and stops on close', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;
  const errors: unknown[] = [];
  const failure = new Error('synthetic worker failure');
  const stop = startArticleScheduler(
    {
      publishDue() {
        calls++;
        if (calls === 1) throw failure;
        return 1;
      },
    },
    (e) => errors.push(e),
  );
  assert.equal(calls, 1);
  assert.deepEqual(errors, [failure]);
  t.mock.timers.tick(articleScheduleInterval);
  assert.equal(calls, 2);
  stop();
  t.mock.timers.tick(articleScheduleInterval * 3);
  assert.equal(calls, 2);
});

test('schema 5 migration preserves content and old articles remain unscheduled', (t) => {
  const f = fixture(t);
  const article = f.articles.save(
    form({ status: 'draft', scheduledAt: null }),
    { requestId: randomUUID() },
  );
  const db = new DatabaseSync(f.filename);
  db.exec(
    'DROP INDEX articles_schedule_idx; ALTER TABLE articles DROP COLUMN scheduled_at; PRAGMA user_version=5',
  );
  db.close();
  const migrated = new Store(f.filename);
  try {
    assert.equal(migrated.isAvailable(), true);
    assert.equal(migrated.articles.get(article.id)?.scheduledAt, null);
    assert.equal(migrated.articles.get(article.id)?.content, article.content);
  } finally {
    migrated.close();
  }
});

test('verified backup and restore preserve an unpublished schedule', async (t) => {
  const f = fixture(t);
  const article = f.articles.save(form(), { requestId: randomUUID() });
  const snapshot = join(f.directory, 'snapshot');
  assert.equal((await createBackup(f.filename, snapshot)).schemaVersion, 6);
  const restored = await restoreBackup(snapshot, join(f.directory, 'restored'));
  const store = new Store(restored.databasePath);
  try {
    assert.equal(store.articles.get(article.id)?.scheduledAt, due);
    assert.equal(store.articles.publishDue(new Date(due)), 1);
    assert.equal(store.articles.get(article.id)?.status, 'published');
  } finally {
    store.close();
  }
});

test('Moscow input is independent of browser timezone and rejects impossible dates', () => {
  assert.equal(scheduleInput(due), '2035-01-02T12:00');
  assert.equal(scheduleTimestamp('2035-01-02T12:00'), due);
  assert.equal(
    scheduleTimestamp('2035-01-02T00:15'),
    '2035-01-01T21:15:00.000Z',
  );
  for (const value of [
    '',
    '2035-02-30T12:00',
    '2035-01-02T25:00',
    '2035-01-02',
  ])
    assert.equal(scheduleTimestamp(value), null);
  assert.match(scheduledDate(due), /12:00 МСК$/);
  assert.match(scheduleError(form({ scheduledAt: null })), /дату и время/);
  assert.match(scheduleError(form(), Date.parse(due)), /в будущем/);
  assert.equal(scheduleError(form(), Date.parse(due) - 1), '');
  assert.equal(articleFormSchema.parse(emptyArticle()).scheduledAt, null);
  assert.equal(articleSaveLabel('scheduled'), 'Запланировать');
  assert.equal(
    articleSaveLabel('scheduled', 'scheduled'),
    'Сохранить расписание',
  );
  const html = renderToStaticMarkup(
    createElement(ArticlePublication, {
      form: form(),
      disabled: false,
      onChange: () => {},
    }),
  );
  assert.match(html, /datetime-local/);
  assert.match(html, /МСК/);
  assert.match(html, /2035-01-02T12:00/);
});

async function httpFixture(t: TestContext) {
  const f = fixture(t, false);
  const resources: {
    application?: Awaited<ReturnType<typeof createApplication>>;
    server?: Server;
  } = {};
  t.after(async () => {
    try {
      if (resources.server) {
        const listener = resources.server;
        await new Promise<void>((resolve, reject) => {
          listener.close((error) => (error ? reject(error) : resolve()));
          listener.closeAllConnections();
        });
      }
    } finally {
      try {
        await resources.application?.close();
      } finally {
        f.close();
      }
    }
  });
  const password = 'synthetic-schedule-api-password';
  const application = (resources.application = await createApplication({
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: f.filename,
    trustProxy: 0,
    adminPasswordHash: createHash('sha256').update(password).digest('hex'),
    adminSessionSecret: 'synthetic-schedule-session-secret-at-least-32-chars',
  }));
  const app = application.app;
  const server = (resources.server = await new Promise<Server>(
    (resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
      s.once('error', reject);
    },
  ));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = 'http://127.0.0.1:' + address.port;
  const request = (path: string, options: RequestInit = {}) =>
    fetch(origin + path, {
      ...options,
      signal: AbortSignal.timeout(8000),
    });
  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  return { ...f, application, origin, cookie, request };
}

test('authenticated schedule API keeps future articles, SEO and images private until the worker publishes', async (t) => {
  const f = await httpFixture(t);
  const { application, origin, cookie, request } = f;
  const image = f.articles.addImage(Buffer.from('synthetic-image'), 1, 1);
  const input = {
    requestId: randomUUID(),
    form: form({ image: image.url, imageAlt: 'Проверка' }),
  };
  const write = (headers: Record<string, string>) =>
    request('/api/admin/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(input),
    });
  assert.equal((await write({ Origin: origin })).status, 401);
  assert.equal(
    (await write({ Origin: 'https://outside.invalid', Cookie: cookie })).status,
    403,
  );
  const saved = await write({ Origin: origin, Cookie: cookie });
  assert.equal(saved.status, 200);
  const { article } = await saved.json();
  assert.equal(article.status, 'scheduled');
  assert.equal((await request('/blog/' + article.slug + '/')).status, 404);
  assert.equal((await request(image.url)).status, 404);
  assert.doesNotMatch(
    await (await request('/sitemap.xml')).text(),
    /scheduled-test/,
  );
  assert.doesNotMatch(
    await (await request('/blog/')).text(),
    /Публикация по расписанию/,
  );
  assert.equal(application.store.articles.publishDue(new Date(due)), 1);
  const page = await request('/blog/' + article.slug + '/');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<h1>Публикация по расписанию<\/h1>/);
  assert.match(html, /BlogPosting/);
  assert.match(await (await request('/sitemap.xml')).text(), /scheduled-test/);
  assert.equal((await request(image.url)).status, 200);
});

test('application startup publishes overdue persisted articles without an admin session or request', async (t) => {
  const f = fixture(t);
  const article = f.articles.save(form(), { requestId: randomUUID() });
  const db = new DatabaseSync(f.filename);
  db.prepare('UPDATE articles SET scheduled_at=? WHERE id=?').run(
    '2000-01-01T00:00:00.000Z',
    article.id,
  );
  db.close();
  const application = await createApplication({
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: f.filename,
    trustProxy: 0,
    adminPasswordHash: 'd'.repeat(64),
    adminSessionSecret: 'synthetic-schedule-startup-secret-at-least-32-chars',
  });
  try {
    assert.equal(
      application.store.articles.get(article.id)?.status,
      'published',
    );
  } finally {
    await application.close();
  }
});

test('the running scheduler publishes at its next tick without a browser or HTTP request', (t) => {
  const { articles } = fixture(t);
  t.mock.timers.enable({
    apis: ['Date', 'setInterval'],
    now: Date.parse(due) - 10000,
  });
  const article = articles.save(form(), { requestId: randomUUID() });
  const stop = startArticleScheduler(articles, (error) => {
    throw error;
  });
  try {
    assert.equal(articles.get(article.id)?.status, 'scheduled');
    t.mock.timers.tick(articleScheduleInterval);
    assert.equal(articles.get(article.id)?.status, 'published');
    assert.equal(articles.get(article.id)?.revision, 2);
  } finally {
    stop();
  }
});

test('a failing automatic publication rolls back the whole batch and retries safely', (t) => {
  const f = fixture(t);
  const first = f.articles.save(form(), { requestId: randomUUID() });
  const second = f.articles.save(form({ slug: 'second' }), {
    requestId: randomUUID(),
  });
  const db = new DatabaseSync(f.filename);
  try {
    db.exec(
      "CREATE TRIGGER reject_publication BEFORE UPDATE OF status ON articles WHEN NEW.status='published' BEGIN SELECT RAISE(ABORT,'synthetic-publication-failure'); END",
    );
    assert.throws(
      () => f.articles.publishDue(new Date(due)),
      /synthetic-publication-failure/,
    );
    assert.deepEqual(f.articles.get(first.id), first);
    assert.deepEqual(f.articles.get(second.id), second);
    db.exec('DROP TRIGGER reject_publication');
    assert.equal(f.articles.publishDue(new Date(due)), 2);
    assert.equal(f.articles.publishDue(new Date(due)), 0);
  } finally {
    db.close();
  }
});

test('a pre-scheduler creation request keeps its original idempotency hash after upgrading', (t) => {
  const f = fixture(t);
  const input = form({ status: 'draft', scheduledAt: null });
  const requestId = randomUUID();
  const article = f.articles.save(input, { requestId });
  const { scheduledAt: _scheduledAt, ...legacy } = input;
  const db = new DatabaseSync(f.filename);
  try {
    db.prepare('UPDATE articles SET request_hash=? WHERE id=?').run(
      createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
      article.id,
    );
    assert.equal(f.articles.save(input, { requestId }).id, article.id);
    assert.equal(f.articles.list().length, 1);
  } finally {
    db.close();
  }
});
