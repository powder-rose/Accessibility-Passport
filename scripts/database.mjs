import { parseArgs, styleText } from 'node:util';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import {
  createBackup,
  restoreBackup,
  RecoveryError,
  verifyBackup,
} from './lib/database-backup.mjs';

const usage = `Usage (Node.js 24):
  npm run db:backup -- --destination <new-directory> [--database <existing.sqlite>]
  npm run db:verify -- --snapshot <snapshot-directory>
  npm run db:restore -- --snapshot <snapshot-directory> --destination <new-directory>

Backup reads DATABASE_PATH from the environment or .env (default: data/site.sqlite).
Restore only creates a NEW directory. Existing databases are never overwritten.
Keep both site.sqlite and manifest.json. Back up .env separately and securely.`;

try {
  const [command, ...arguments_] = process.argv.slice(2);
  const { values } = parseArgs({
    args: arguments_,
    options: {
      database: { type: 'string' },
      destination: { type: 'string' },
      snapshot: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help || command === '--help') {
    console.log(usage);
  } else {
    if (!['backup', 'verify', 'restore'].includes(command))
      throw new RecoveryError(usage);
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major !== 24 || minor < 15)
      throw new RecoveryError('Use Node.js >=24.15.0 <25.');
    if (
      (command !== 'verify' && !values.destination?.trim()) ||
      (command !== 'backup' && !values.snapshot?.trim()) ||
      (command !== 'backup' && values.database !== undefined) ||
      (command === 'backup' && values.snapshot !== undefined) ||
      (command === 'verify' && values.destination !== undefined) ||
      (values.database !== undefined && !values.database.trim())
    )
      throw new RecoveryError(usage);
    if (command === 'backup' && existsSync('.env')) loadEnvFile('.env');
    // Also bound a native backup that cannot reach its progress callback.
    const timer = setTimeout(() => {
      console.error('DATABASE_ERROR: Operation exceeded five minutes.');
      process.exit(1);
    }, 300_000);
    timer.unref();
    try {
      const result =
        command === 'backup'
          ? await createBackup(
              values.database ||
                process.env.DATABASE_PATH ||
                './data/site.sqlite',
              values.destination,
            )
          : command === 'verify'
            ? await verifyBackup(values.snapshot)
            : await restoreBackup(values.snapshot, values.destination);
      console.log(JSON.stringify({ operation: command, ok: true, ...result }));
    } finally {
      clearTimeout(timer);
    }
  }
} catch (error) {
  // Native SQLite errors may include data. Emit only operational diagnostics.
  const fileErrors = {
    EEXIST: 'Destination already exists; it was preserved.',
    ENOENT: 'Required file or directory does not exist.',
    EACCES: 'File access denied.',
    EPERM: 'File operation is not permitted.',
    ENOSPC: 'Not enough free disk space.',
  };
  const message =
    error instanceof RecoveryError
      ? error.message
      : fileErrors[error.code] || 'Database operation failed.';
  console.error(styleText('red', 'DATABASE_ERROR: ' + message));
  console.error(
    'Check arguments, file permissions, snapshot integrity and schema version.',
  );
  console.error(usage);
  process.exitCode = 1;
}
