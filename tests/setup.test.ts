import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('CMS setup preserves local settings and refuses to replace existing credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'passport-setup-test-'));
  try {
    const filename = join(directory, '.env');
    writeFileSync(
      filename,
      'PORT=5500\nADMIN_PASSWORD_SHA256=\nADMIN_SESSION_SECRET=\n',
    );
    const script = fileURLToPath(
      new URL('../scripts/setup-admin.mjs', import.meta.url),
    );
    const first = spawnSync(process.execPath, [script], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(first.status, 0);
    const password = first.stdout.match(
      /Your new CMS password: ([A-Za-z0-9_-]+)/,
    )![1];
    const env = readFileSync(filename, 'utf8');
    assert.ok(env.includes('PORT=5500'));
    assert.ok(
      env.includes(
        'ADMIN_PASSWORD_SHA256=' +
          createHash('sha256').update(password).digest('hex'),
      ),
    );
    assert.match(env, /ADMIN_SESSION_SECRET=[a-f0-9]{64}/);
    assert.equal(
      spawnSync(process.execPath, [script], {
        cwd: directory,
        encoding: 'utf8',
      }).status,
      1,
    );
    assert.equal(readFileSync(filename, 'utf8'), env);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
