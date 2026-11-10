import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inImmediateTransaction } from '../server/db/transaction';
import { initialSchema, attachmentSchema } from '../server/db/migrations';
import { articleSchema } from '../server/articles/migration';
import { authSchema } from '../server/auth/migration';
import { ArticleRepository } from '../server/articles/repository';
import { AdminRepository } from '../server/auth/repository';
import { StorageRepository } from '../server/storage/repository';
import { Store } from '../server/db/store';
import { emptyArticle } from '../src/features/articles/model';
import { pdf } from './fixtures/documents';

function database(t: TestContext) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  t.after(() => db.close());
  return db;
}
function repositories(t: TestContext) {
  const db = database(t);
  db.exec(
    [initialSchema, attachmentSchema, articleSchema, authSchema].join(';'),
  );
  return {
    db,
    articles: new ArticleRepository(db),
    auth: new AdminRepository(db),
    storage: new StorageRepository(db),
  };
}
function count(db: DatabaseSync, table: string) {
  return (
    db.prepare('SELECT COUNT(*) AS count FROM ' + table).get() as {
      count: number;
    }
  ).count;
}
function originalFailure(message: string) {
  return (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, message);
    assert.equal((error as NodeJS.ErrnoException).code, 'ERR_SQLITE_ERROR');
    return true;
  };
}
const directory = () => mkdtempSync(join(tmpdir(), 'passport-transactions-'));
const timestamp = '2020-01-01T00:00:00.000Z';

test('a failed migration preserves its original error, schema version and preexisting data before retry', (t) => {
  const path = directory();
  const filename = join(path, 'migration.sqlite');
  const initial = new DatabaseSync(filename);
  initial.exec(
    initialSchema + ';' + attachmentSchema + '; PRAGMA user_version=2',
  );
  initial
    .prepare('INSERT INTO leads VALUES (?,?,?,?,?,?)')
    .run('preserved-lead', 'synthetic-hash', '{}', timestamp, 'contact', 'new');
  initial.close();
  const execute = DatabaseSync.prototype.exec;
  const failure = new Error('synthetic-migration-failure');
  const failedConnections: DatabaseSync[] = [];
  const inject = t.mock.method(
    DatabaseSync.prototype,
    'exec',
    function (this: DatabaseSync, sql: string) {
      execute.call(this, sql);
      if (sql === articleSchema) {
        failedConnections.push(this);
        execute.call(this, 'ROLLBACK');
        throw failure;
      }
    },
  );
  try {
    assert.throws(
      () => new Store(filename),
      (error: unknown) => error === failure,
    );
  } finally {
    inject.mock.restore();
    for (const connection of failedConnections) connection.close();
  }
  const db = new DatabaseSync(filename);
  t.after(() => {
    db.close();
    rmSync(path, { recursive: true, force: true });
  });
  assert.equal(
    (db.prepare('PRAGMA user_version').get() as { user_version: number })
      .user_version,
    2,
  );
  assert.equal(
    db.prepare("SELECT name FROM sqlite_master WHERE name='articles'").get(),
    undefined,
  );
  assert.equal(count(db, 'leads'), 1);
  const retried = new Store(filename);
  try {
    assert.equal(retried.findLeadHash('preserved-lead'), 'synthetic-hash');
    assert.equal(
      (db.prepare('PRAGMA user_version').get() as { user_version: number })
        .user_version,
      4,
    );
  } finally {
    retried.close();
  }
});

test('successful transactions commit related writes and return the callback result', (t) => {
  const db = database(t);
  db.exec('CREATE TABLE entries (id INTEGER PRIMARY KEY, value TEXT)');
  const expected = { id: 1 };
  const result = inImmediateTransaction(db, () => {
    db.prepare('INSERT INTO entries VALUES (?,?)').run(1, 'first');
    db.prepare('INSERT INTO entries VALUES (?,?)').run(2, 'second');
    return expected;
  });
  assert.equal(result, expected);
  assert.equal(db.isTransaction, false);
  assert.equal(count(db, 'entries'), 2);
});

test('callback failure rolls back earlier writes and preserves the exact thrown value', (t) => {
  const db = database(t);
  db.exec('CREATE TABLE entries (id INTEGER PRIMARY KEY)');
  for (const failure of [
    new Error('synthetic-write-failure'),
    'synthetic-non-error',
  ]) {
    assert.throws(
      () =>
        inImmediateTransaction(db, () => {
          db.exec('INSERT INTO entries VALUES (1)');
          throw failure;
        }),
      (error: unknown) => error === failure,
    );
    assert.equal(db.isTransaction, false);
    assert.equal(count(db, 'entries'), 0);
  }
  inImmediateTransaction(db, () => db.exec('INSERT INTO entries VALUES (2)'));
  assert.equal(count(db, 'entries'), 1);
});

test('real SQLITE_FULL automatic rollback retains its code and permits a later small write', (t) => {
  const db = database(t);
  db.exec(
    'PRAGMA page_size=512; CREATE TABLE entries (bytes BLOB); PRAGMA max_page_count=4',
  );
  assert.throws(
    () =>
      inImmediateTransaction(db, () => {
        db.prepare('INSERT INTO entries VALUES (?)').run(Buffer.alloc(10000));
      }),
    (error: unknown) => {
      assert.ok(error && typeof error === 'object' && 'errcode' in error);
      assert.equal(Number(error.errcode) & 255, 13);
      return true;
    },
  );
  assert.equal(db.isTransaction, false);
  assert.equal(count(db, 'entries'), 0);
  inImmediateTransaction(db, () =>
    db.prepare('INSERT INTO entries VALUES (?)').run(Buffer.alloc(1)),
  );
  assert.equal(count(db, 'entries'), 1);
});

test('a rejected nested BEGIN does not roll back the callers active transaction', (t) => {
  const db = database(t);
  db.exec(
    'CREATE TABLE entries (id INTEGER PRIMARY KEY); BEGIN IMMEDIATE; INSERT INTO entries VALUES (1)',
  );
  let called = false;
  assert.throws(() =>
    inImmediateTransaction(db, () => {
      called = true;
    }),
  );
  assert.equal(called, false);
  assert.equal(db.isTransaction, true);
  assert.equal(count(db, 'entries'), 1);
  db.exec('COMMIT');
  assert.equal(db.isTransaction, false);
});

test('a busy BEGIN neither runs the callback nor disturbs another connections write', (t) => {
  const path = directory();
  const filename = join(path, 'locked.sqlite');
  const writer = new DatabaseSync(filename, { timeout: 0 });
  const follower = new DatabaseSync(filename, { timeout: 0 });
  t.after(() => {
    follower.close();
    writer.close();
    rmSync(path, { recursive: true, force: true });
  });
  writer.exec(
    'CREATE TABLE entries (id INTEGER PRIMARY KEY); BEGIN IMMEDIATE; INSERT INTO entries VALUES (1)',
  );
  let called = false;
  assert.throws(
    () =>
      inImmediateTransaction(follower, () => {
        called = true;
      }),
    (error: unknown) => {
      assert.ok(error && typeof error === 'object' && 'errcode' in error);
      assert.equal(Number(error.errcode) & 255, 5);
      return true;
    },
  );
  assert.equal(called, false);
  assert.equal(follower.isTransaction, false);
  assert.equal(writer.isTransaction, true);
  writer.exec('COMMIT');
  inImmediateTransaction(follower, () =>
    follower.exec('INSERT INTO entries VALUES (2)'),
  );
  assert.equal(count(follower, 'entries'), 2);
});

test('deferred constraint failure at COMMIT rolls back instead of returning an uncommitted result', (t) => {
  const db = database(t);
  db.exec(
    'CREATE TABLE parents (id INTEGER PRIMARY KEY); CREATE TABLE children (parent_id INTEGER REFERENCES parents(id) DEFERRABLE INITIALLY DEFERRED)',
  );
  assert.throws(
    () =>
      inImmediateTransaction(db, () => {
        db.exec('INSERT INTO children VALUES (1)');
        return 'must-not-be-returned';
      }),
    /FOREIGN KEY constraint failed/,
  );
  assert.equal(db.isTransaction, false);
  assert.equal(count(db, 'children'), 0);
  inImmediateTransaction(db, () =>
    db.exec('INSERT INTO children VALUES (1); INSERT INTO parents VALUES (1)'),
  );
  assert.equal(count(db, 'children'), 1);
});

test('a secondary rollback failure does not replace the original error or imply recovery', (t) => {
  const db = database(t);
  db.exec('CREATE TABLE entries (id INTEGER PRIMARY KEY)');
  const execute = db.exec.bind(db);
  const original = new Error('synthetic-primary-failure');
  const rollback = t.mock.method(db, 'exec', (sql: string) => {
    if (sql === 'ROLLBACK') throw new Error('synthetic-rollback-failure');
    return execute(sql);
  });
  assert.throws(
    () =>
      inImmediateTransaction(db, () => {
        db.exec('INSERT INTO entries VALUES (1)');
        throw original;
      }),
    (error: unknown) => error === original,
  );
  assert.equal(db.isTransaction, true);
  rollback.mock.restore();
  execute('ROLLBACK');
  assert.equal(count(db, 'entries'), 0);
});

test('article creation and edits atomically restore payload, slug history and image references after failure', (t) => {
  for (const mode of ['ABORT', 'ROLLBACK']) {
    const f = repositories(t);
    const image = f.articles.addImage(Buffer.from('synthetic-image'), 1, 1);
    const form = {
      ...emptyArticle(),
      title: 'Synthetic atomic article',
      slug: 'atomic-article',
      content: '<p>Synthetic article</p>',
      image: image.url,
      imageAlt: 'Synthetic image',
    };
    const requestId = randomUUID();
    const fail = () =>
      f.db.exec(
        'CREATE TRIGGER reject_ref BEFORE INSERT ON article_image_refs BEGIN SELECT RAISE(' +
          mode +
          ", 'synthetic-reference-failure'); END",
      );
    fail();
    assert.throws(
      () => f.articles.save(form, { requestId }),
      originalFailure('synthetic-reference-failure'),
    );
    assert.equal(count(f.db, 'articles'), 0);
    assert.equal(count(f.db, 'article_slugs'), 0);
    assert.equal(count(f.db, 'article_image_refs'), 0);
    assert.equal(count(f.db, 'article_images'), 1);
    assert.equal(f.db.isTransaction, false);
    f.db.exec('DROP TRIGGER reject_ref');
    const saved = f.articles.save(form, { requestId });
    assert.equal(f.articles.save(form, { requestId }).id, saved.id);
    fail();
    assert.throws(
      () =>
        f.articles.save(
          { ...saved, title: 'Changed', slug: 'changed-article' },
          { id: saved.id, revision: saved.revision },
        ),
      originalFailure('synthetic-reference-failure'),
    );
    assert.deepEqual(f.articles.get(saved.id), saved);
    assert.equal(count(f.db, 'article_slugs'), 1);
    assert.equal(count(f.db, 'article_image_refs'), 1);
    assert.equal(f.db.isTransaction, false);
    f.db.exec('DROP TRIGGER reject_ref');
    const updated = f.articles.save(
      { ...saved, slug: 'changed-article' },
      { id: saved.id, revision: saved.revision },
    );
    assert.equal(updated.revision, saved.revision + 1);
  }
});

test('image insertion preserves an automatic rollback error and accepts a retry without partial quota usage', (t) => {
  const f = repositories(t);
  f.db.exec(
    "CREATE TRIGGER reject_image AFTER INSERT ON article_images BEGIN SELECT RAISE(ROLLBACK, 'synthetic-image-failure'); END",
  );
  assert.throws(
    () => f.articles.addImage(Buffer.from('synthetic-image'), 1, 1),
    originalFailure('synthetic-image-failure'),
  );
  assert.equal(f.db.isTransaction, false);
  assert.equal(f.storage.report().images.bytes, 0);
  f.db.exec('DROP TRIGGER reject_image');
  const image = f.articles.addImage(Buffer.from('synthetic-image'), 1, 1);
  assert.match(image.url, /^\/media\/articles\/[a-f0-9-]{36}\.webp$/);
  assert.equal(f.storage.report().images.count, 1);
  assert.equal(
    f.storage.report().images.bytes,
    Buffer.byteLength('synthetic-image'),
  );
});

test('cleanup failure restores all previously deleted images and succeeds on a fresh retry', (t) => {
  for (const mode of ['ABORT', 'ROLLBACK']) {
    const f = repositories(t);
    for (let index = 0; index < 2; index++)
      f.articles.addImage(Buffer.from('synthetic-image'), 1, 1);
    f.db.prepare('UPDATE article_images SET created_at=?').run(timestamp);
    const images = f.storage.preview().images;
    assert.equal(images.length, 2);
    f.db.exec(
      "CREATE TRIGGER reject_cleanup BEFORE DELETE ON article_images WHEN OLD.id='" +
        images[1].id +
        "' BEGIN SELECT RAISE(" +
        mode +
        ", 'synthetic-cleanup-failure'); END",
    );
    assert.throws(
      () => f.storage.cleanup(images),
      originalFailure('synthetic-cleanup-failure'),
    );
    assert.equal(f.db.isTransaction, false);
    assert.equal(count(f.db, 'article_images'), 2);
    f.db.exec('DROP TRIGGER reject_cleanup');
    assert.equal(f.storage.cleanup(f.storage.preview().images).count, 2);
    assert.equal(count(f.db, 'article_images'), 0);
  }
});

test('failed credential rotation preserves both the old generation and its sessions', (t) => {
  for (const mode of ['ABORT', 'ROLLBACK']) {
    const f = repositories(t);
    f.auth.configure('synthetic-source-old', 'synthetic-password-old');
    const credential = f.auth.credential('synthetic-source-old')!;
    assert.equal(
      f.auth.createSession(
        'synthetic-source-old',
        credential,
        randomUUID(),
        'synthetic-verifier',
        1000,
        0,
      ),
      true,
    );
    f.db.exec(
      'CREATE TRIGGER reject_revoke BEFORE DELETE ON admin_sessions BEGIN SELECT RAISE(' +
        mode +
        ", 'synthetic-revocation-failure'); END",
    );
    assert.throws(
      () => f.auth.configure('synthetic-source-new', 'synthetic-password-new'),
      originalFailure('synthetic-revocation-failure'),
    );
    assert.equal(f.db.isTransaction, false);
    assert.deepEqual(f.auth.credential('synthetic-source-old'), credential);
    assert.equal(f.auth.credential('synthetic-source-new'), undefined);
    assert.equal(count(f.db, 'admin_sessions'), 1);
    f.db.exec('DROP TRIGGER reject_revoke');
    f.auth.configure('synthetic-source-new', 'synthetic-password-new');
    assert.equal(
      f.auth.credential('synthetic-source-new')!.generation,
      credential.generation + 1,
    );
    assert.equal(count(f.db, 'admin_sessions'), 0);
  }
});

test('lead attachments remain atomic and duplicate early returns commit cleanly after migration and restart', (t) => {
  const path = directory();
  const filename = join(path, 'site.sqlite');
  let store = new Store(filename);
  const db = new DatabaseSync(filename);
  t.after(() => {
    db.close();
    store.close();
    rmSync(path, { recursive: true, force: true });
  });
  const files = ['first.pdf', 'fail.pdf'].map((name) => ({
    id: randomUUID(),
    name,
    kind: 'passport' as const,
    size: pdf.length,
    contentType: 'application/pdf',
    sha256: createHash('sha256').update(pdf).digest('hex'),
    bytes: pdf,
  }));
  const write = () =>
    store.insertLead(
      'synthetic-lead',
      'synthetic-hash',
      { comment: 'Synthetic transaction test' },
      timestamp,
      'contact',
      files,
    );
  db.exec(
    "CREATE TRIGGER reject_attachment BEFORE INSERT ON lead_attachments WHEN NEW.name='fail.pdf' BEGIN SELECT RAISE(ABORT, 'synthetic-attachment-failure'); END",
  );
  assert.throws(write, originalFailure('synthetic-attachment-failure'));
  assert.equal(count(db, 'leads'), 0);
  assert.equal(count(db, 'lead_attachments'), 0);
  db.exec('DROP TRIGGER reject_attachment');
  write();
  write();
  store.insertLead(
    'synthetic-next-lead',
    'synthetic-next-hash',
    {},
    timestamp,
    'contact',
  );
  store.close();
  store = new Store(filename);
  assert.equal(
    (db.prepare('PRAGMA user_version').get() as { user_version: number })
      .user_version,
    4,
  );
  assert.equal(store.findLeadHash('synthetic-lead'), 'synthetic-hash');
  assert.equal(store.listLeadPage({ limit: 10 }).total, 2);
  assert.equal(count(db, 'lead_attachments'), 2);
});
