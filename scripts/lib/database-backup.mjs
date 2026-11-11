import { backup, DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  createReadStream,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const tables = [
  'leads',
  'lead_attachments',
  'upload_settings',
  'rate_limits',
  'articles',
  'article_slugs',
  'article_images',
  'article_image_refs',
];
const authTables = ['admin_credentials', 'admin_sessions'];
const statisticsTables = ['analytics_visits', 'analytics_pageviews'];

export class RecoveryError extends Error {}

function requireFile(filename) {
  if (!lstatSync(filename).isFile())
    throw new RecoveryError(
      'Expected a regular file; symbolic links are refused.',
    );
}

function openDatabase(filename) {
  requireFile(filename);
  return new DatabaseSync(filename, { readOnly: true, timeout: 5000 });
}

function checkVersion(database) {
  const version = database.prepare('PRAGMA user_version').get().user_version;
  if (![3, 4, 5].includes(version))
    throw new RecoveryError(
      'Unsupported database schema; use matching application code.',
    );
  return version;
}

function inspectDatabase(filename) {
  const database = openDatabase(filename);
  try {
    database.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');
    const schemaVersion = checkVersion(database);
    if (database.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete')
      throw new RecoveryError(
        'Snapshot must use standalone DELETE journal mode.',
      );
    const integrity = database.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
      throw new RecoveryError('Database integrity check failed.');
    if (database.prepare('PRAGMA foreign_key_check').all().length)
      throw new RecoveryError('Database foreign key check failed.');
    const counts = Object.fromEntries(
      [
        ...tables,
        ...(schemaVersion >= 4 ? authTables : []),
        ...(schemaVersion >= 5 ? statisticsTables : []),
      ].map((table) => [
        table,
        database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
      ]),
    );
    if (schemaVersion >= 4 && counts.admin_sessions !== 0)
      throw new RecoveryError(
        'Snapshots must not contain active administrator sessions.',
      );
    return { schemaVersion, counts };
  } finally {
    database.close();
  }
}

async function digest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

function syncFile(filename) {
  const descriptor = openSync(filename, 'r+');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function newDirectory(destination) {
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  // No recursive mkdir here: an existing directory must never be reused.
  mkdirSync(destination, { mode: 0o700 });
}

function requireStandalone(directory) {
  if (!lstatSync(directory).isDirectory())
    throw new RecoveryError(
      'Expected a snapshot directory; symbolic links are refused.',
    );
  for (const suffix of ['-wal', '-shm', '-journal'])
    if (existsSync(join(directory, 'site.sqlite' + suffix)))
      throw new RecoveryError(
        'Snapshot must be standalone, without journal sidecars.',
      );
}

function sameCounts(actual, expected) {
  return (
    expected &&
    Object.keys(expected).length === Object.keys(actual).length &&
    Object.keys(actual).every((table) => actual[table] === expected[table])
  );
}

export async function createBackup(databasePath, destination) {
  const source = openDatabase(resolve(databasePath));
  const directory = resolve(destination);
  let owned = false;
  try {
    checkVersion(source);
    newDirectory(directory);
    owned = true;
    const pending = join(directory, 'site.sqlite.partial');
    writeFileSync(pending, '', { flag: 'wx', mode: 0o600 });
    const deadline = Date.now() + 120_000;
    await backup(source, pending, {
      rate: 256,
      progress() {
        if (Date.now() > deadline)
          throw new RecoveryError(
            'Backup exceeded the two-minute progress deadline.',
          );
      },
    });
    // Convert the snapshot to a self-contained file; never checkpoint the source.
    const snapshot = new DatabaseSync(pending, { timeout: 5000 });
    try {
      if (checkVersion(snapshot) >= 4)
        snapshot.exec('PRAGMA trusted_schema=OFF; DELETE FROM admin_sessions;');
      const mode = snapshot.prepare('PRAGMA journal_mode=DELETE').get();
      if (mode.journal_mode !== 'delete')
        throw new RecoveryError('Could not finalize a standalone snapshot.');
    } finally {
      snapshot.close();
    }
    renameSync(pending, join(directory, 'site.sqlite'));
    const filename = join(directory, 'site.sqlite');
    const { schemaVersion, counts } = inspectDatabase(filename);
    requireStandalone(directory);
    syncFile(filename);
    const manifest = {
      formatVersion: 1,
      schemaVersion,
      createdAt: new Date().toISOString(),
      size: lstatSync(filename).size,
      sha256: await digest(filename),
      counts,
    };
    const manifestPath = join(directory, 'manifest.json');
    writeFileSync(
      manifestPath + '.partial',
      JSON.stringify(manifest, null, 2) + '\n',
      {
        flag: 'wx',
        mode: 0o600,
      },
    );
    syncFile(manifestPath + '.partial');
    // The manifest is the completion marker; interrupted copies are not valid.
    renameSync(manifestPath + '.partial', manifestPath);
    return { directory, ...manifest };
  } catch (error) {
    if (owned) rmSync(directory, { recursive: true, force: true });
    throw error;
  } finally {
    source.close();
  }
}

export async function verifyBackup(snapshotPath) {
  const directory = resolve(snapshotPath);
  requireStandalone(directory);
  const manifestPath = join(directory, 'manifest.json');
  requireFile(manifestPath);
  if (lstatSync(manifestPath).size > 64 * 1024)
    throw new RecoveryError('Snapshot manifest is too large.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    !manifest ||
    manifest.formatVersion !== 1 ||
    ![3, 4, 5].includes(manifest.schemaVersion) ||
    typeof manifest.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    !Number.isSafeInteger(manifest.size) ||
    manifest.size <= 0 ||
    typeof manifest.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256)
  )
    throw new RecoveryError('Invalid or unsupported snapshot manifest.');
  const filename = join(directory, 'site.sqlite');
  requireFile(filename);
  if (
    lstatSync(filename).size !== manifest.size ||
    (await digest(filename)) !== manifest.sha256
  )
    throw new RecoveryError('Snapshot size or SHA-256 mismatch.');
  const { schemaVersion, counts } = inspectDatabase(filename);
  if (schemaVersion !== manifest.schemaVersion)
    throw new RecoveryError('Snapshot schema does not match its manifest.');
  if (!sameCounts(counts, manifest.counts))
    throw new RecoveryError('Snapshot row counts do not match its manifest.');
  return {
    directory,
    formatVersion: 1,
    schemaVersion,
    createdAt: manifest.createdAt,
    size: manifest.size,
    sha256: manifest.sha256,
    counts,
  };
}

export async function restoreBackup(snapshotPath, destination) {
  const verified = await verifyBackup(snapshotPath);
  const directory = resolve(destination);
  newDirectory(directory);
  try {
    const filename = join(directory, 'site.sqlite');
    copyFileSync(
      join(verified.directory, 'site.sqlite'),
      filename,
      constants.COPYFILE_EXCL,
    );
    chmodSync(filename, 0o600);
    if (
      (await digest(filename)) !== verified.sha256 ||
      !sameCounts(inspectDatabase(filename).counts, verified.counts)
    )
      throw new RecoveryError('Restored database verification failed.');
    syncFile(filename);
    return { databasePath: filename, ...verified, directory };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
