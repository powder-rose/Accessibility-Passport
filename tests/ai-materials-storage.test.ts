import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/db/store';
import { AiStorageConflict } from '../server/ai/materials-repository';
import { emptyArticle } from '../src/features/articles/model';
import {
  createBackup,
  restoreBackup,
  verifyBackup,
} from '../scripts/lib/database-backup.mjs';

const photo = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

test('schema five migrates without changing data and supports independent CAS across connections', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'passport-ai-storage-'));
  const path = join(dir, 'site.sqlite');
  const initial = new Store(path);
  initial.insertLead(
    'saved',
    'hash',
    { name: 'saved' },
    '2026-01-01T00:00:00.000Z',
    'contact',
  );
  const article = initial.articles.save(
    {
      ...emptyArticle(),
      title: 'Existing article',
      content: '<p>Saved text</p>',
    },
    { requestId: 'saved-request' },
  );
  initial.close();
  const old = new DatabaseSync(path);
  old.exec('DROP TABLE ai_materials; PRAGMA user_version=5;');
  old.close();
  const first = new Store(path);
  const second = new Store(path);
  t.after(() => {
    second.close();
    first.close();
    rmSync(dir, { recursive: true, force: true });
  });
  assert.equal(first.isAvailable(), true);
  assert.equal(first.findLeadHash('saved'), 'hash');
  assert.equal(first.articles.get(article.id)?.content, '<p>Saved text</p>');
  assert.equal(first.aiMaterials.get('materials'), null);
  const initialMaterials = first.aiMaterials.put(
    'materials',
    '{"style":"one"}',
    null,
  );
  assert.equal(initialMaterials.revision, 1);
  assert.throws(
    () => second.aiMaterials.put('materials', '{"style":"other"}', null),
    AiStorageConflict,
  );
  const updated = first.aiMaterials.put(
    'materials',
    '{"style":"two"}',
    initialMaterials.revision,
  );
  assert.equal(updated.revision, 2);
  assert.throws(
    () =>
      second.aiMaterials.put(
        'materials',
        '{"style":"stale"}',
        initialMaterials.revision,
      ),
    AiStorageConflict,
  );
  assert.equal(second.aiMaterials.get('materials')?.value, '{"style":"two"}');
  const image = first.aiMaterials.put('photo1', photo, null, 'image/png');
  assert.equal(image.revision, 1);
  assert.deepEqual(
    Buffer.from(second.aiMaterials.get('photo1')!.value as Uint8Array),
    photo,
  );
  second.aiMaterials.delete('photo1', image.revision);
  assert.equal(first.aiMaterials.get('photo1'), null);
  const recreated = first.aiMaterials.put('photo1', photo, null, 'image/png');
  assert.equal(recreated.revision, 3);
  assert.throws(
    () => second.aiMaterials.put('photo1', photo, image.revision, 'image/png'),
    AiStorageConflict,
  );
  assert.throws(() =>
    first.aiMaterials.put('photo2', photo, null, 'image/jpeg'),
  );
  assert.throws(() => first.aiMaterials.put('materials', '[]', 2));
});

test('schema six snapshots restore and migrate to the compatibility marker without changing data', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'passport-ai-schema-six-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'site.sqlite');
  const initial = new Store(path);
  initial.insertLead(
    'existing',
    'old-hash',
    { name: 'saved' },
    '2026-01-01T00:00:00.000Z',
    'contact',
  );
  initial.aiMaterials.put('materials', '{"style":"сохранённый стиль"}', null);
  initial.aiMaterials.put('photo1', photo, null, 'image/png');
  const image = initial.articles.addImage(photo, 1, 1);
  initial.close();
  const old = new DatabaseSync(path);
  old.exec('PRAGMA user_version=6');
  old.close();
  const snapshot = join(dir, 'old-snapshot');
  assert.equal((await createBackup(path, snapshot)).schemaVersion, 6);
  assert.equal((await verifyBackup(snapshot)).schemaVersion, 6);
  const restored = await restoreBackup(snapshot, join(dir, 'restored'));
  const migrated = new Store(restored.databasePath);
  const version = new DatabaseSync(restored.databasePath, { readOnly: true });
  try {
    assert.equal(version.prepare('PRAGMA user_version').get()?.user_version, 7);
    assert.equal(migrated.isAvailable(), true);
    assert.equal(migrated.findLeadHash('existing'), 'old-hash');
    assert.equal(
      migrated.aiMaterials.get('materials')?.value,
      '{"style":"сохранённый стиль"}',
    );
    assert.deepEqual(
      Buffer.from(migrated.aiMaterials.get('photo1')!.value as Uint8Array),
      photo,
    );
    assert.deepEqual(
      Buffer.from(
        migrated.articles.image(image.url.split('/').at(-1)!.slice(0, -5))!
          .bytes,
      ),
      photo,
    );
  } finally {
    version.close();
    migrated.close();
  }
});

test('backup restores materials and photos; schema-five snapshots still verify and migrate', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'passport-ai-backup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'site.sqlite');
  const store = new Store(path);
  store.aiMaterials.put('materials', '{"style":"Пример"}', null);
  store.aiMaterials.put('photo2', photo, null, 'image/png');
  const snapshot = join(dir, 'snapshot');
  const result = await createBackup(path, snapshot);
  assert.equal(result.schemaVersion, 7);
  assert.equal(result.counts.ai_materials, 2);
  assert.deepEqual(await verifyBackup(snapshot), result);
  const restored = await restoreBackup(snapshot, join(dir, 'restored'));
  const recovered = new Store(restored.databasePath);
  assert.equal(
    recovered.aiMaterials.get('materials')?.value,
    '{"style":"Пример"}',
  );
  assert.deepEqual(
    Buffer.from(recovered.aiMaterials.get('photo2')!.value as Uint8Array),
    photo,
  );
  recovered.close();
  store.close();

  const oldPath = join(dir, 'old.sqlite');
  const old = new Store(oldPath);
  old.close();
  const database = new DatabaseSync(oldPath);
  database.exec('DROP TABLE ai_materials; PRAGMA user_version=5;');
  database.close();
  const oldSnapshot = join(dir, 'old-snapshot');
  assert.equal((await createBackup(oldPath, oldSnapshot)).schemaVersion, 5);
  assert.equal((await verifyBackup(oldSnapshot)).schemaVersion, 5);
  const oldRestored = await restoreBackup(
    oldSnapshot,
    join(dir, 'old-restored'),
  );
  const migrated = new Store(oldRestored.databasePath);
  assert.equal(migrated.isAvailable(), true);
  assert.equal(migrated.aiMaterials.get('materials'), null);
  migrated.close();
});
