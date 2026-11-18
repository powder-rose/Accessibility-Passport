import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/db/store';
import { initialSchema, attachmentSchema } from '../server/db/migrations';
import { articleSchema } from '../server/articles/migration';
import { articleScheduleSchema } from '../server/articles/schedule-migration';
import { aiMaterialsSchema } from '../server/ai/materials-repository';
import { authSchema } from '../server/auth/migration';
import { statisticsSchema } from '../server/statistics/migration';
import {
  articleFormSchema,
  emptyArticle,
} from '../src/features/articles/model';
import {
  createBackup,
  restoreBackup,
  verifyBackup,
} from '../scripts/lib/database-backup.mjs';

const due = '2035-01-02T09:00:00.000Z';
const timestamp = '2026-11-01T00:00:00.000Z';
const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const variants = [
  { name: 'schema five', version: 5, ai: false, schedule: false },
  { name: 'AI schema six', version: 6, ai: true, schedule: false },
  { name: 'scheduling schema six', version: 6, ai: false, schedule: true },
  { name: 'AI schema seven', version: 7, ai: true, schedule: false },
];

function historicalFixture(t: TestContext, variant: (typeof variants)[number]) {
  const directory = mkdtempSync(join(tmpdir(), 'osi-article-integration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'site.sqlite');
  const db = new DatabaseSync(filename);
  try {
    db.exec(
      [
        'PRAGMA foreign_keys=ON',
        initialSchema,
        attachmentSchema,
        articleSchema,
        authSchema,
        statisticsSchema,
        ...(variant.ai ? [aiMaterialsSchema] : []),
        ...(variant.schedule ? [articleScheduleSchema] : []),
        'PRAGMA user_version=' + variant.version,
      ].join(';'),
    );
    const articleId = randomUUID();
    const requestId = randomUUID();
    const imageId = variant.version === 7 ? 'dostupnyj-vhod' : randomUUID();
    const image = '/media/articles/' + imageId + '.webp';
    const form = {
      ...emptyArticle(),
      title: 'Сохранённая статья',
      slug: 'preserved-article',
      content: '<h2>Доступный вход</h2><p>Сохранённый текст</p>',
      seoTitle: 'Доступный вход',
      seoDescription: 'Сохранённое описание',
      image,
      imageAlt: 'Вход в здание',
      status: variant.schedule ? ('scheduled' as const) : ('draft' as const),
      scheduledAt: variant.schedule ? due : null,
    };
    const { scheduledAt: _scheduledAt, ...legacyForm } = form;
    const payload = variant.schedule ? form : legacyForm;
    db.prepare('INSERT INTO leads VALUES (?,?,?,?,?,?)').run(
      'preserved-lead',
      'lead-hash',
      '{"name":"Synthetic client"}',
      timestamp,
      'contact',
      'new',
    );
    db.prepare('INSERT INTO admin_credentials VALUES (1,?,?,1)').run(
      'source-hash',
      null,
    );
    db.prepare('INSERT INTO analytics_visits VALUES (?,?,?,?,?)').run(
      'visit',
      'token-hash',
      1,
      2,
      'direct',
    );
    db.prepare('INSERT INTO analytics_pageviews VALUES (?,?,?,?)').run(
      'view',
      'visit',
      '/',
      2,
    );
    db.prepare('INSERT INTO article_images VALUES (?,?,?,?,?,?,?)').run(
      imageId,
      bytes,
      1,
      1,
      bytes.length,
      createHash('sha256').update(bytes).digest('hex'),
      timestamp,
    );
    const columns =
      'id,request_id,request_hash,slug,status,category,payload,revision,created_at,updated_at,published_at,deleted_at';
    db.prepare(
      'INSERT INTO articles (' +
        columns +
        (variant.schedule ? ',scheduled_at' : '') +
        ') VALUES (' +
        Array(variant.schedule ? 13 : 12)
          .fill('?')
          .join(',') +
        ')',
    ).run(
      articleId,
      requestId,
      createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      form.slug,
      'draft',
      '',
      JSON.stringify(payload),
      4,
      timestamp,
      timestamp,
      null,
      null,
      ...(variant.schedule ? [due] : []),
    );
    db.prepare('INSERT INTO article_slugs VALUES (?,?)').run(
      form.slug,
      articleId,
    );
    db.prepare('INSERT INTO article_image_refs VALUES (?,?)').run(
      articleId,
      imageId,
    );
    if (variant.ai) {
      db.prepare('INSERT INTO ai_materials VALUES (?,?,?,?,0)').run(
        'materials',
        3,
        '{"style":"saved"}',
        null,
      );
      db.prepare('INSERT INTO ai_materials VALUES (?,?,?,?,0)').run(
        'photo1',
        2,
        bytes,
        'image/png',
      );
    }
    return {
      directory,
      filename,
      articleId,
      requestId,
      imageId,
      form,
      payload,
    };
  } finally {
    db.close();
  }
}

for (const variant of variants) {
  test(`${variant.name} migrates and restores without losing articles, media, AI materials or schedules`, async (t) => {
    const f = historicalFixture(t, variant);
    const snapshot = join(f.directory, 'before');
    const metadata = await createBackup(f.filename, snapshot);
    assert.equal(metadata.schemaVersion, variant.version);
    assert.equal(metadata.counts.ai_materials, variant.ai ? 2 : undefined);
    assert.deepEqual(await verifyBackup(snapshot), metadata);
    const restored = await restoreBackup(
      snapshot,
      join(f.directory, 'restored'),
    );

    for (const filename of [f.filename, restored.databasePath]) {
      const store = new Store(filename);
      const db = new DatabaseSync(filename, { readOnly: true });
      try {
        assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 8);
        assert.equal(store.isAvailable(), true);
        assert.equal(store.findLeadHash('preserved-lead'), 'lead-hash');
        assert.equal(
          db.prepare('SELECT source_hash FROM admin_credentials').get()
            ?.source_hash,
          'source-hash',
        );
        assert.equal(
          db.prepare('SELECT COUNT(*) AS count FROM analytics_pageviews').get()
            ?.count,
          1,
        );
        const before = store.articles.get(f.articleId)!;
        assert.equal(before.revision, 4);
        assert.equal(before.content, f.form.content);
        assert.equal(before.image, f.form.image);
        assert.equal(before.scheduledAt, variant.schedule ? due : null);
        assert.equal(before.status, variant.schedule ? 'scheduled' : 'draft');
        assert.equal(
          db.prepare('SELECT payload FROM articles WHERE id=?').get(f.articleId)
            ?.payload,
          JSON.stringify(f.payload),
        );
        assert.deepEqual(
          Buffer.from(store.articles.image(f.imageId)!.bytes),
          bytes,
        );
        assert.equal(
          store.aiMaterials.get('materials')?.value,
          variant.ai ? '{"style":"saved"}' : undefined,
        );
        if (variant.ai)
          assert.deepEqual(
            Buffer.from(store.aiMaterials.get('photo1')!.value as Uint8Array),
            bytes,
          );
        const retry = store.articles.save(articleFormSchema.parse(f.payload), {
          requestId: f.requestId,
        });
        assert.equal(retry.id, before.id);
        assert.equal(retry.revision, before.revision);
        assert.equal(store.articles.bySlug(before.slug), undefined);
        assert.equal(
          Boolean(store.articles.imageMetadata(f.imageId)?.published),
          false,
        );

        if (!variant.schedule)
          store.articles.save(
            { ...before, status: 'scheduled', scheduledAt: due },
            { id: before.id, revision: before.revision },
          );
        assert.equal(
          store.articles.publishDue(new Date(Date.parse(due) - 1)),
          0,
        );
        assert.equal(store.articles.publishDue(new Date(due)), 1);
        assert.equal(store.articles.publishDue(new Date(due)), 0);
        assert.equal(store.articles.bySlug(before.slug)?.image, f.form.image);
        assert.equal(
          Boolean(store.articles.imageMetadata(f.imageId)?.published),
          true,
        );
        assert.equal(
          store.aiMaterials.get('materials')?.value,
          variant.ai ? '{"style":"saved"}' : undefined,
        );
      } finally {
        db.close();
        store.close();
      }
      // Reopening must not repeat either migration or publication.
      const reopened = new Store(filename);
      try {
        assert.equal(reopened.isAvailable(), true);
        assert.equal(reopened.articles.get(f.articleId)?.status, 'published');
      } finally {
        reopened.close();
      }
    }
  });
}

test('a failed combined migration rolls back DDL and releases its database before a retry', (t) => {
  const f = historicalFixture(t, variants[3]);
  const db = new DatabaseSync(f.filename);
  try {
    db.exec('CREATE INDEX articles_schedule_idx ON articles(id)');
    assert.throws(() => new Store(f.filename), /articles_schedule_idx/);
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 7);
    assert.equal(
      db
        .prepare('PRAGMA table_info(articles)')
        .all()
        .some((c) => c.name === 'scheduled_at'),
      false,
    );
    assert.equal(
      db.prepare('SELECT value FROM ai_materials WHERE key=?').get('materials')
        ?.value,
      '{"style":"saved"}',
    );
    assert.equal(
      db.prepare('SELECT revision FROM articles').get()?.revision,
      4,
    );
    db.exec('DROP INDEX articles_schedule_idx');
    const retried = new Store(f.filename);
    try {
      assert.equal(retried.isAvailable(), true);
    } finally {
      retried.close();
    }
  } finally {
    db.close();
  }
});

test('ambiguous schema-six layouts are rejected without changing the database or accepting a backup', async (t) => {
  const f = historicalFixture(t, variants[0]);
  const db = new DatabaseSync(f.filename);
  try {
    db.exec('PRAGMA user_version=6');
    assert.throws(() => new Store(f.filename), /layout/);
    await assert.rejects(
      createBackup(f.filename, join(f.directory, 'invalid')),
      /layout/,
    );
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 6);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM leads').get()?.count,
      1,
    );
    db.exec(aiMaterialsSchema + ';' + articleScheduleSchema);
    assert.throws(() => new Store(f.filename), /layout/);
    await assert.rejects(
      createBackup(f.filename, join(f.directory, 'also-invalid')),
      /layout/,
    );
  } finally {
    db.close();
  }
});
