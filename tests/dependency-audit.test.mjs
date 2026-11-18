import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessAudit,
  picomatchException,
} from '../scripts/lib/dependency-audit.mjs';

const reviewedAt = new Date('2026-11-18T00:00:00Z');
function fixture() {
  const advisory = {
    name: 'picomatch',
    dependency: 'picomatch',
    url: picomatchException.advisory,
    severity: 'high',
    range: '<=4.0.7',
  };
  const vulnerabilities = {
    picomatch: {
      name: 'picomatch',
      severity: 'high',
      via: [advisory],
      nodes: ['node_modules/picomatch'],
    },
    vite: {
      name: 'vite',
      severity: 'high',
      via: ['picomatch'],
      nodes: ['node_modules/vite'],
    },
  };
  const lockfile = {
    lockfileVersion: 3,
    packages: {
      'node_modules/picomatch': { version: '4.0.7', dev: true },
      'node_modules/vite': { version: '8.3.6', dev: true },
    },
  };
  function report() {
    const counts = Object.fromEntries(
      ['info', 'low', 'moderate', 'high', 'critical'].map((level) => [
        level,
        Object.values(vulnerabilities).filter((v) => v.severity === level)
          .length,
      ]),
    );
    return {
      auditReportVersion: 2,
      vulnerabilities,
      metadata: {
        vulnerabilities: {
          ...counts,
          total: Object.keys(vulnerabilities).length,
        },
      },
    };
  }
  return { advisory, vulnerabilities, lockfile, report };
}

test('only the reviewed development graph receives a visible temporary audit exception', () => {
  const f = fixture();
  const result = assessAudit(f.report(), f.lockfile, reviewedAt);
  assert.deepEqual(result.accepted, ['picomatch', 'vite']);
  assert.deepEqual(result.blocked, []);
  assert.equal(result.counts.high, 2);
  delete f.vulnerabilities.picomatch;
  delete f.vulnerabilities.vite;
  assert.deepEqual(
    assessAudit(f.report(), f.lockfile, reviewedAt).accepted,
    [],
  );
});

test('production dependencies, changed versions and unreviewed package locations block the audit', () => {
  for (const change of [
    (f) => delete f.lockfile.packages['node_modules/picomatch'].dev,
    (f) => (f.lockfile.packages['node_modules/picomatch'].version = '4.0.8'),
    (f) =>
      (f.vulnerabilities.picomatch.nodes = ['node_modules/other/picomatch']),
    (f) => delete f.lockfile.packages['node_modules/picomatch'],
  ]) {
    const f = fixture();
    change(f);
    assert.deepEqual(assessAudit(f.report(), f.lockfile, reviewedAt).blocked, [
      'picomatch',
      'vite',
    ]);
  }
  const f = fixture();
  f.lockfile.packages['node_modules/vite'].dev = false;
  assert.deepEqual(assessAudit(f.report(), f.lockfile, reviewedAt).blocked, [
    'vite',
  ]);
  f.vulnerabilities.unreviewed = {
    name: 'unreviewed',
    severity: 'high',
    via: [{ ...f.advisory, name: 'unreviewed', dependency: 'unreviewed' }],
    nodes: ['node_modules/unreviewed'],
  };
  assert.deepEqual(assessAudit(f.report(), f.lockfile, reviewedAt).blocked, [
    'vite',
    'unreviewed',
  ]);
});

test('new advisories, critical severity and expired review cannot reuse the exception', () => {
  for (const change of [
    (f) => (f.advisory.url = 'https://github.com/advisories/GHSA-new-issue'),
    (f) => f.vulnerabilities.picomatch.via.push({ ...f.advisory, range: '*' }),
    (f) => (f.vulnerabilities.picomatch.severity = 'critical'),
    (f) => (f.advisory.range = '<=4.0.8'),
  ]) {
    const f = fixture();
    change(f);
    assert.deepEqual(assessAudit(f.report(), f.lockfile, reviewedAt).blocked, [
      'picomatch',
      'vite',
    ]);
  }
  const f = fixture();
  assert.deepEqual(
    assessAudit(f.report(), f.lockfile, new Date(picomatchException.expiresAt))
      .blocked,
    ['picomatch', 'vite'],
  );
  f.vulnerabilities.vite.via = ['vite'];
  assert.deepEqual(assessAudit(f.report(), f.lockfile, reviewedAt).blocked, [
    'vite',
  ]);
});

test('registry errors and malformed or incomplete reports fail closed', () => {
  const f = fixture();
  for (const report of [
    {},
    { ...f.report(), error: { code: 'EAI_AGAIN' } },
    { ...f.report(), auditReportVersion: 3 },
    { ...f.report(), metadata: {} },
    { ...f.report(), vulnerabilities: {} },
  ]) {
    assert.throws(() => assessAudit(report, f.lockfile, reviewedAt));
  }
  f.vulnerabilities.vite.via = ['missing'];
  assert.throws(() => assessAudit(f.report(), f.lockfile, reviewedAt));
});

test('the audit command preserves npm failures and a clean result without using a shell', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'osi-audit-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fakeNpm = join(directory, 'npm.mjs');
  const script = fileURLToPath(
    new URL('../scripts/audit-dependencies.mjs', import.meta.url),
  );
  function run(body) {
    writeFileSync(fakeNpm, body);
    return spawnSync(process.execPath, [script], {
      env: { ...process.env, npm_execpath: fakeNpm },
      encoding: 'utf8',
      timeout: 10000,
    });
  }
  const f = fixture();
  // Empty audit reports remain successful after the temporary exception expires.
  delete f.vulnerabilities.picomatch;
  delete f.vulnerabilities.vite;
  const clean = run(
    'console.log(' + JSON.stringify(JSON.stringify(f.report())) + ');',
  );
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /AUDIT_POLICY_OK/);
  assert.doesNotMatch(clean.stderr, /AUDIT_TEMPORARY_EXCEPTION/);
  for (const body of [
    'console.log("not JSON"); process.exitCode = 1;',
    'console.log("{}"); process.exitCode = 2;',
    'console.log(JSON.stringify({error:{code:"EAI_AGAIN"}})); process.exitCode = 1;',
  ]) {
    const failed = run(body);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /AUDIT_ERROR/);
    assert.doesNotMatch(failed.stdout, /AUDIT_POLICY_OK/);
  }
});
