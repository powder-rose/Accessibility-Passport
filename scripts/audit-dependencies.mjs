import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assessAudit, picomatchException } from './lib/dependency-audit.mjs';

try {
  if (!process.env.npm_execpath) {
    throw new Error('Run this check with npm run audit:check.');
  }
  // Running npm through Node avoids shell quoting and npm.cmd differences on
  // Windows. A transport failure never becomes an empty successful report.
  const result = spawnSync(
    process.execPath,
    [
      process.env.npm_execpath,
      'audit',
      '--json',
      '--audit-level=high',
      '--fetch-retries=1',
      '--fetch-timeout=20000',
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error('npm audit did not complete successfully.');
  }
  const report = JSON.parse(result.stdout);
  const lockfile = JSON.parse(
    readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
  );
  const assessment = assessAudit(report, lockfile);
  console.log('AUDIT_COUNTS=' + JSON.stringify(assessment.counts));
  if (assessment.accepted.length) {
    console.warn(
      'AUDIT_TEMPORARY_EXCEPTION=' +
        picomatchException.advisory +
        ' development-only; expires ' +
        picomatchException.expiresAt,
    );
    console.warn('AUDIT_REVIEWED_PACKAGES=' + assessment.accepted.join(', '));
  }
  if (assessment.blocked.length) {
    console.error('AUDIT_BLOCKED=' + assessment.blocked.join(', '));
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } else {
    console.log('AUDIT_POLICY_OK (see docs/DEPENDENCIES.md)');
  }
} catch (error) {
  console.error('AUDIT_ERROR: ' + error.message);
  process.exitCode = 1;
}
