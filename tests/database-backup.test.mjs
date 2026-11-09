import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/db/store.ts';
import { emptyArticle } from '../src/features/articles/model.ts';
import {
  createBackup,
  restoreBackup,
  verifyBackup,
} from '../scripts/lib/database-backup.mjs';

const timestamp = '2026-11-09T00:00:00.000Z';
const attachment = Buffer.from('%PDF-1.7\nSynthetic document');
const image = Buffer.from('Synthetic stored image bytes');
const attachmentId = '00000000-0000-4000-8000-000000000001';
const imageId = '00000000-0000-4000-8000-000000000002';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'passport-backup-'));
  const filename = join(root, 'source.sqlite');
  const store = new Store(filename);
  const writer = new DatabaseSync(filename);
  const cleanup = [];
  writer.exec('PRAGMA wal_autocheckpoint=0; PRAGMA foreign_keys=ON;');
  store.insertLead(
    'lead',
    'stable-request-hash',
    { name: 'Тестовая заявка', utm: { utm_source: 'backup-test' } },
    timestamp,
    'contact',
    [
      {
        id: attachmentId,
        kind: 'document',
        name: 'test.pdf',
        size: attachment.length,
        contentType: 'application/pdf',
        sha256: hash(attachment),
        bytes: attachment,
      },
    ],
  );
  writer
    .prepare('INSERT INTO article_images VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(imageId, image, 10, 10, image.length, hash(image), timestamp);
  writer
    .prepare('INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      'article',
      'request',
      'article-hash',
      'test-article',
      'published',
      'Test',
      JSON.stringify({
        ...emptyArticle(),
        title: 'Тестовая статья',
        content: '<p>Текст восстановления</p>',
        slug: 'test-article',
        status: 'published',
        seoTitle: 'Тест восстановления',
        seoDescription: 'Проверка статьи после восстановления',
        image: '/media/articles/' + imageId + '.webp',
        imageAlt: 'Тестовое изображение',
      }),
      1,
      timestamp,
      timestamp,
      timestamp,
      null,
    );
  writer
    .prepare('INSERT INTO article_slugs VALUES (?, ?)')
    .run('old-slug', 'article');
  writer
    .prepare('INSERT INTO article_slugs VALUES (?, ?)')
    .run('test-article', 'article');
  writer
    .prepare('INSERT INTO article_image_refs VALUES (?, ?)')
    .run('article', imageId);
  store.setAttachmentLimits(store.getAttachmentLimits());
  writer
    .prepare('INSERT INTO rate_limits VALUES (?, ?, ?)')
    .run('rate', 3, 100);
  t.after(async () => {
    for (const close of cleanup.reverse()) await close();
    writer.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    filename,
    store,
    writer,
    cleanup,
    snapshot: join(root, 'snapshot'),
  };
}

function refreshManifest(snapshot, update = {}) {
  const filename = join(snapshot, 'site.sqlite');
  const manifestPath = join(snapshot, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...manifest,
      size: lstatSync(filename).size,
      sha256: hash(readFileSync(filename)),
      ...update,
    }),
  );
}

test('live WAL backup restores leads, binary documents, articles, images and relations', async (t) => {
  const { root, filename, store, writer, snapshot } = fixture(t);
  assert.ok(lstatSync(filename + '-wal').size > 0);
  // The committed record is deliberately still in WAL while the source is open.
  writer
    .prepare('UPDATE leads SET status=? WHERE id=?')
    .run('processed', 'lead');
  const result = await createBackup(filename, snapshot);
  assert.equal(result.counts.leads, 1);
  assert.equal(result.counts.lead_attachments, 1);
  assert.equal(result.counts.articles, 1);
  assert.equal(result.counts.article_images, 1);
  for (const suffix of ['-wal', '-shm', '-journal'])
    assert.equal(existsSync(join(snapshot, 'site.sqlite' + suffix)), false);
  assert.deepEqual(await verifyBackup(snapshot), result);
  const restored = await restoreBackup(snapshot, join(root, 'restored'));
  const database = new DatabaseSync(restored.databasePath, { readOnly: true });
  try {
    for (const table of Object.keys(result.counts))
      assert.deepEqual(
        database.prepare(`SELECT * FROM ${table}`).all(),
        writer.prepare(`SELECT * FROM ${table}`).all(),
        table,
      );
    assert.equal(
      database.prepare('SELECT status FROM leads').get().status,
      'processed',
    );
    assert.equal(
      database.prepare('SELECT payload_hash FROM leads').get().payload_hash,
      'stable-request-hash',
    );
    assert.deepEqual(
      Buffer.from(
        database.prepare('SELECT bytes FROM lead_attachments').get().bytes,
      ),
      attachment,
    );
    assert.deepEqual(
      Buffer.from(
        database.prepare('SELECT bytes FROM article_images').get().bytes,
      ),
      image,
    );
  } finally {
    database.close();
  }
  // A successful backup does not stop subsequent intake on the live database.
  store.insertLead(
    'after',
    'hash-after',
    { name: 'После копии' },
    timestamp,
    'contact',
  );
  assert.equal(store.listLeadPage({ limit: 25 }).total, 2);
  assert.equal((await verifyBackup(snapshot)).counts.leads, 1);
  if (process.platform !== 'win32') {
    assert.equal(lstatSync(snapshot).mode & 0o777, 0o700);
    assert.equal(lstatSync(join(snapshot, 'site.sqlite')).mode & 0o777, 0o600);
    assert.equal(
      lstatSync(join(snapshot, 'manifest.json')).mode & 0o777,
      0o600,
    );
    assert.equal(lstatSync(restored.databasePath).mode & 0o777, 0o600);
  }
});

test('backup includes committed work but excludes an uncommitted transaction', async (t) => {
  const { root, filename, writer, snapshot } = fixture(t);
  writer.exec('BEGIN IMMEDIATE');
  writer.prepare('UPDATE leads SET status=?').run('not-committed');
  try {
    await createBackup(filename, snapshot);
  } finally {
    writer.exec('ROLLBACK');
  }
  const restored = await restoreBackup(snapshot, join(root, 'restored'));
  const database = new DatabaseSync(restored.databasePath, { readOnly: true });
  try {
    assert.equal(
      database.prepare('SELECT status FROM leads').get().status,
      'new',
    );
  } finally {
    database.close();
  }
});

test('missing sources and unsupported schemas never create an empty successful backup', async (t) => {
  const { root, filename, writer, snapshot } = fixture(t);
  const missing = join(root, 'missing.sqlite');
  await assert.rejects(createBackup(missing, snapshot));
  assert.equal(existsSync(missing), false);
  assert.equal(existsSync(snapshot), false);
  writer.exec('PRAGMA user_version=999');
  await assert.rejects(createBackup(filename, snapshot), /schema/);
  assert.equal(existsSync(snapshot), false);
});

test('existing snapshot and restore destinations are preserved byte for byte', async (t) => {
  const { root, filename, snapshot } = fixture(t);
  await createBackup(filename, snapshot);
  const original = readFileSync(join(snapshot, 'site.sqlite'));
  await assert.rejects(createBackup(filename, snapshot), /exist/i);
  await assert.rejects(restoreBackup(snapshot, snapshot), /exist/i);
  const restored = await restoreBackup(snapshot, join(root, 'restored'));
  const prior = readFileSync(restored.databasePath);
  await assert.rejects(
    restoreBackup(snapshot, join(root, 'restored')),
    /exist/i,
  );
  assert.deepEqual(readFileSync(join(snapshot, 'site.sqlite')), original);
  assert.deepEqual(readFileSync(restored.databasePath), prior);
});

test('damaged backups fail verification and restoration before creating a destination', async (t) => {
  const { root, filename, snapshot } = fixture(t);
  await createBackup(filename, snapshot);
  const databasePath = join(snapshot, 'site.sqlite');
  const bytes = readFileSync(databasePath);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(databasePath, bytes);
  await assert.rejects(verifyBackup(snapshot), /SHA-256/);
  const destination = join(root, 'restored');
  await assert.rejects(restoreBackup(snapshot, destination), /SHA-256/);
  assert.equal(existsSync(destination), false);
  // Updating the checksum cannot make a truncated SQLite database valid.
  writeFileSync(databasePath, bytes.subarray(0, 512));
  refreshManifest(snapshot);
  await assert.rejects(verifyBackup(snapshot));
});

test('incomplete snapshots and manifest count mismatches are rejected', async (t) => {
  const { filename, snapshot } = fixture(t);
  await createBackup(filename, snapshot);
  const manifestPath = join(snapshot, 'manifest.json');
  const manifest = readFileSync(manifestPath);
  refreshManifest(snapshot, { counts: { leads: 999 } });
  await assert.rejects(verifyBackup(snapshot), /counts/);
  rmSync(manifestPath);
  await assert.rejects(verifyBackup(snapshot));
  writeFileSync(manifestPath, manifest);
  writeFileSync(join(snapshot, 'site.sqlite-wal'), 'incomplete');
  await assert.rejects(verifyBackup(snapshot), /sidecars/);
});

test('extra manifest fields cannot redirect restoration to another database', async (t) => {
  const { root, filename, snapshot } = fixture(t);
  await createBackup(filename, snapshot);
  refreshManifest(snapshot, {
    directory: join(root, 'other'),
    databasePath: filename,
  });
  assert.equal((await verifyBackup(snapshot)).directory, snapshot);
  const restored = await restoreBackup(snapshot, join(root, 'restored'));
  assert.equal(restored.databasePath, join(root, 'restored', 'site.sqlite'));
  assert.equal(restored.counts.leads, 1);
});

test('foreign key damage aborts backup without publishing a snapshot', async (t) => {
  const { filename, writer, snapshot } = fixture(t);
  writer.exec('PRAGMA foreign_keys=OFF');
  writer
    .prepare('UPDATE article_image_refs SET image_id=?')
    .run('missing-image');
  await assert.rejects(createBackup(filename, snapshot), /foreign key/);
  assert.equal(existsSync(snapshot), false);
  assert.equal(
    writer.prepare('SELECT COUNT(*) AS count FROM leads').get().count,
    1,
  );
});

test('CLI uses DATABASE_PATH and performs a full backup, verify and restore cycle', (t) => {
  const { root, filename, snapshot } = fixture(t);
  const cli = fileURLToPath(
    new URL('../scripts/database.mjs', import.meta.url),
  );
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      env: { ...process.env, DATABASE_PATH: filename },
      encoding: 'utf8',
      timeout: 20_000,
    });
  const created = run('backup', '--destination', snapshot);
  assert.equal(created.status, 0, created.stderr);
  assert.equal(JSON.parse(created.stdout).ok, true);
  assert.equal(run('verify', '--snapshot', snapshot).status, 0);
  const destination = join(root, 'restored');
  assert.equal(
    run('restore', '--snapshot', snapshot, '--destination', destination).status,
    0,
  );
  assert.equal(
    run('restore', '--snapshot', snapshot, '--destination', destination).status,
    1,
  );
  assert.equal(
    run('verify', '--snapshot', snapshot, '--destination', destination).status,
    1,
  );
  assert.equal(run('backup', '--destination', snapshot, '--unknown').status, 1);
  assert.equal(run('--help').status, 0);
  assert.equal(created.stdout.includes('Тестовая заявка'), false);
});

test(
  'production server starts on restored data and serves the lead, document and article',
  { timeout: 45_000 },
  async (t) => {
    const { root, filename, snapshot, cleanup } = fixture(t);
    await createBackup(filename, snapshot);
    const restored = await restoreBackup(
      snapshot,
      join(root, 'production-restored'),
    );
    const password = 'synthetic-restoration-password';
    const child = spawn(
      process.execPath,
      ['dist/server/index.js', '--production', '--port', '0'],
      {
        env: {
          ...process.env,
          HOST: '127.0.0.1',
          APP_ORIGIN: 'http://127.0.0.1',
          DATABASE_PATH: restored.databasePath,
          ADMIN_PASSWORD_SHA256: hash(password),
          ADMIN_SESSION_SECRET:
            'synthetic-restoration-secret-with-more-than-32-characters',
          TRUST_PROXY: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    cleanup.push(async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const stopped = new Promise((resolve) => child.once('exit', resolve));
      const killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
      child.kill('SIGTERM');
      await stopped;
      clearTimeout(killTimer);
    });
    child.stderr.resume();
    const origin = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(
        () =>
          reject(new Error('Restored production server startup timed out.')),
        15_000,
      );
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error('Restored production server exited: ' + code));
      });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const ready = output.match(
          /Server ready at (http:\/\/127\.0\.0\.1:\d+)/,
        );
        if (ready) {
          clearTimeout(timer);
          resolve(ready[1]);
        }
      });
    });
    const request = (path, options = {}) =>
      fetch(origin + path, {
        ...options,
        signal: AbortSignal.timeout(8000),
      });
    const login = await request('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1',
      },
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const leads = await request('/api/admin/leads', {
      headers: { Cookie: cookie },
    });
    assert.equal(leads.status, 200);
    assert.equal((await leads.json()).leads[0].payload.name, 'Тестовая заявка');
    const document = await request('/api/admin/attachments/' + attachmentId, {
      headers: { Cookie: cookie },
    });
    assert.equal(document.status, 200);
    assert.deepEqual(Buffer.from(await document.arrayBuffer()), attachment);
    assert.equal(
      (await request('/api/admin/attachments/' + attachmentId)).status,
      401,
    );
    const article = await request('/blog/test-article/');
    assert.equal(article.status, 200);
    assert.match(await article.text(), /Текст восстановления/);
    const oldSlug = await request('/blog/old-slug/', { redirect: 'manual' });
    assert.equal(oldSlug.status, 301);
    assert.equal(oldSlug.headers.get('location'), '/blog/test-article/');
    const restoredImage = await request('/media/articles/' + imageId + '.webp');
    assert.equal(restoredImage.status, 200);
    assert.deepEqual(Buffer.from(await restoredImage.arrayBuffer()), image);
  },
);
