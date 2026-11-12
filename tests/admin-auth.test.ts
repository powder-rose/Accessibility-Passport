import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../server/application';
import type { Config } from '../server/config';
import { Store } from '../server/db/store';
import {
  configureAdmin,
  authenticatePassword,
  createAdminSession,
  credentialKey,
  isAdminAuthenticated,
} from '../server/auth/service';
import {
  hashPassword,
  verifyPassword,
  isScryptHash,
  PasswordBusyError,
} from '../scripts/lib/admin-password.mjs';
import {
  createBackup,
  restoreBackup,
  verifyBackup,
} from '../scripts/lib/database-backup.mjs';
import { pdf } from './fixtures/documents';
import { emptyArticle } from '../src/features/articles/model';

const password = 'synthetic-admin-password';
const secret = 'synthetic-admin-session-secret-longer-than-32';
const sha = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
const script = fileURLToPath(
  new URL('../scripts/setup-admin.mjs', import.meta.url),
);

async function fixture(t: TestContext, encoded = sha(password)) {
  const directory = mkdtempSync(join(tmpdir(), 'passport-auth-'));
  const config: Config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: join(directory, 'site.sqlite'),
    trustProxy: 0,
    adminPasswordHash: encoded,
    adminSessionSecret: secret,
  };
  const seed = new Store(config.databasePath);
  const attachmentId = randomUUID();
  seed.insertLead(
    'preserved-lead',
    'preserved-hash',
    { name: 'Тестовая заявка' },
    '2026-11-09',
    'contact',
    [
      {
        id: attachmentId,
        kind: 'passport',
        name: 'test.pdf',
        bytes: pdf,
        size: pdf.length,
        contentType: 'application/pdf',
        sha256: sha(pdf),
      },
    ],
  );
  seed.close();
  let application = await createApplication(config);
  let server: Server;
  let origin: string;
  async function start() {
    server = await new Promise<Server>((resolve, reject) => {
      const listener = application.app.listen(0, '127.0.0.1', () =>
        resolve(listener),
      );
      listener.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    origin = 'http://127.0.0.1:' + address.port;
    config.appOrigin = origin;
  }
  async function stop() {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await application.close();
  }
  await start();
  t.after(async () => {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  const request = (path: string, init: RequestInit = {}) =>
    fetch(origin + path, { ...init, signal: AbortSignal.timeout(8000) });
  const login = (
    value: unknown = { password },
    headers: Record<string, string> = {},
  ) =>
    request('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        ...headers,
      },
      body: JSON.stringify(value),
    });
  const cookie = async () => {
    const response = await login();
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie')!.split(';')[0];
  };
  return {
    directory,
    config,
    request,
    login,
    cookie,
    attachmentId,
    get store() {
      return application.store;
    },
    async restart(
      hash = config.adminPasswordHash,
      sessionSecret = config.adminSessionSecret,
    ) {
      await stop();
      config.adminPasswordHash = hash;
      config.adminSessionSecret = sessionSecret;
      application = await createApplication(config);
      await start();
    },
  };
}

test('scrypt uses independent salts, rejects changed passwords and bounds concurrent derivations', async () => {
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(isScryptHash(first), true);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password + '-wrong', first), false);
  assert.equal(
    await verifyPassword(password, first.replace('v1:', 'v99:')),
    false,
  );
  assert.equal(await verifyPassword(password, undefined), false);
  const concurrent = await Promise.allSettled([
    hashPassword('one'),
    hashPassword('two'),
    hashPassword('three'),
  ]);
  assert.equal(
    concurrent.filter((result) => result.status === 'fulfilled').length,
    2,
  );
  const rejected = concurrent.find((result) => result.status === 'rejected');
  assert.ok(
    rejected &&
      rejected.status === 'rejected' &&
      rejected.reason instanceof PasswordBusyError,
  );
  assert.equal(await verifyPassword(password, first), true);
});

test('legacy password upgrades on login and keeps working across restart and environment migration', async (t) => {
  const app = await fixture(t);
  const original = app.store.listLeads();
  assert.equal(
    app.store.auth.credential(credentialKey(app.config))!.passwordHash,
    null,
  );
  const cookie = await app.cookie();
  assert.match(cookie, /^osi_admin=v1\.[a-f0-9]{32}\.[a-f0-9]{64}$/);
  const upgraded = app.store.auth.credential(
    credentialKey(app.config),
  )!.passwordHash!;
  assert.equal(await verifyPassword(password, upgraded), true);
  await app.restart();
  assert.equal(
    (await app.request('/api/admin/session', { headers: { Cookie: cookie } }))
      .status,
    200,
  );
  assert.equal((await app.login()).status, 200);
  assert.equal(
    app.store.auth.credential(credentialKey(app.config))!.passwordHash,
    upgraded,
  );
  await app.restart(await hashPassword(password));
  assert.equal(
    (await app.request('/api/admin/session', { headers: { Cookie: cookie } }))
      .status,
    401,
  );
  assert.equal((await app.login()).status, 200);
  assert.deepEqual(app.store.listLeads(), original);
  assert.deepEqual(
    Buffer.from(app.store.getAttachment(app.attachmentId)!.bytes),
    pdf,
  );
});

test('new scrypt credentials issue independent cookies and store no raw verifier', async (t) => {
  const app = await fixture(t, await hashPassword(password));
  const first = await app.cookie();
  const second = await app.cookie();
  assert.notEqual(first, second);
  const database = new DatabaseSync(app.config.databasePath);
  try {
    const rows = database.prepare('SELECT * FROM admin_sessions').all();
    assert.equal(rows.length, 2);
    assert.equal(
      JSON.stringify(rows).includes(first.split('.').at(-1)!),
      false,
    );
    for (const row of rows)
      assert.match(String(row.verifier_hash), /^[a-f0-9]{64}$/);
  } finally {
    database.close();
  }
  app.config.appOrigin = 'https://example.invalid';
  const response = await app.login(
    { password },
    { Origin: app.config.appOrigin },
  );
  assert.equal(response.status, 200);
  const header = response.headers.get('set-cookie')!;
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/'])
    assert.ok(header.includes(flag));
});

test('logout revokes copies of the current session while another login remains valid', async (t) => {
  const app = await fixture(t);
  const first = await app.cookie();
  const second = await app.cookie();
  const path = '/api/admin/attachments/' + app.attachmentId;
  assert.equal(
    (await app.request(path, { headers: { Cookie: first } })).status,
    200,
  );
  const logout = () =>
    app.request('/api/admin/login', {
      method: 'DELETE',
      headers: { Cookie: first, Origin: app.config.appOrigin! },
    });
  const response = await logout();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
  for (const endpoint of [
    '/api/admin/session',
    '/api/admin/leads',
    '/api/admin/articles',
    '/api/admin/statistics',
    path,
  ]) {
    const denied = await app.request(endpoint, { headers: { Cookie: first } });
    assert.equal(denied.status, 401, endpoint);
    assert.equal(denied.headers.get('cache-control'), 'no-store');
  }
  assert.equal(
    (await app.request('/api/admin/session', { headers: { Cookie: second } }))
      .status,
    200,
  );
  assert.equal((await logout()).status, 200);
});

test('old signed cookies, forged verifiers, duplicates and expired sessions are rejected', async (t) => {
  const app = await fixture(t);
  const cookie = await app.cookie();
  const expires = String(Date.now() + 8 * 60 * 60 * 1000);
  const legacy =
    'osi_admin=' +
    expires +
    '.' +
    createHmac('sha256', secret).update(expires).digest('hex');
  const forged = cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0');
  for (const value of [legacy, forged, cookie + '0', cookie + '; ' + cookie])
    assert.equal(
      (await app.request('/api/admin/leads', { headers: { Cookie: value } }))
        .status,
      401,
    );
  const database = new DatabaseSync(app.config.databasePath);
  try {
    database
      .prepare('UPDATE admin_sessions SET expires_at=?')
      .run(Date.now() - 1);
  } finally {
    database.close();
  }
  assert.equal(
    (await app.request('/api/admin/session', { headers: { Cookie: cookie } }))
      .status,
    401,
  );
});

test('origin checks, malformed password inputs and login rate limits remain enforced', async (t) => {
  const app = await fixture(t);
  assert.equal(
    (await app.login({ password }, { Origin: 'https://other.invalid' })).status,
    403,
  );
  const cookie = await app.cookie();
  assert.equal(
    (
      await app.request('/api/admin/login', {
        method: 'DELETE',
        headers: { Cookie: cookie, Origin: 'https://other.invalid' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await app.request('/api/admin/session', { headers: { Cookie: cookie } }))
      .status,
    200,
  );
  for (const value of [null, [], {}, { password: 1 }, { password: '' }])
    assert.equal((await app.login(value)).status, 401);
  assert.equal((await app.login({ password: 'wrong-password' })).status, 401);
  assert.equal(
    (await app.login({ password: 'another-wrong-password' })).status,
    401,
  );
  assert.equal((await app.login()).status, 429);
});

test('changing only the password revokes all sessions and rejects the old password', async (t) => {
  const app = await fixture(t);
  const first = await app.cookie();
  const second = await app.cookie();
  await app.restart(sha('replacement-password'));
  for (const value of [first, second])
    assert.equal(
      (await app.request('/api/admin/session', { headers: { Cookie: value } }))
        .status,
      401,
    );
  assert.equal((await app.login()).status, 401);
  assert.equal(
    (await app.login({ password: 'replacement-password' })).status,
    200,
  );
});

test('secret rotation and disabled administration invalidate prior sessions', async (t) => {
  const app = await fixture(t);
  const first = await app.cookie();
  await app.restart(
    app.config.adminPasswordHash,
    'replacement-session-secret-at-least-32-characters',
  );
  assert.equal(
    (await app.request('/api/admin/session', { headers: { Cookie: first } }))
      .status,
    401,
  );
  const second = await app.cookie();
  await app.restart('', '');
  assert.equal(
    (await app.request('/api/admin/session', { headers: { Cookie: second } }))
      .status,
    401,
  );
  assert.equal((await app.login()).status, 503);
});

test('an in-flight login cannot create a session for credentials that were replaced', async () => {
  const store = new Store(':memory:');
  const config: Config = {
    production: false,
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    trustProxy: 0,
    adminPasswordHash: await hashPassword(password),
    adminSessionSecret: secret,
  };
  try {
    configureAdmin(config, store);
    const replacement = {
      ...config,
      adminPasswordHash: await hashPassword('replacement'),
    };
    const pending = authenticatePassword(password, config, store).then(
      (credential) => {
        assert.ok(credential);
        return createAdminSession(config, store, credential);
      },
    );
    configureAdmin(replacement, store);
    await assert.rejects(pending, /configuration changed/);
  } finally {
    store.close();
  }
});

test('environment migration preserves the password, secret and other settings without echoing input', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'passport-migrate-admin-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, '.env');
  writeFileSync(
    filename,
    'PORT=5500\nEXTRA="keep # this"\nexport ADMIN_PASSWORD_SHA256="' +
      sha(password) +
      '"\nADMIN_SESSION_SECRET="' +
      secret +
      ' # preserved"\n',
  );
  const original = readFileSync(filename, 'utf8');
  const run = (input?: string) =>
    spawnSync(process.execPath, [script, '--migrate'], {
      cwd: directory,
      encoding: 'utf8',
      input,
      timeout: 10000,
    });
  assert.equal(run('wrong\n').status, 1);
  assert.equal(readFileSync(filename, 'utf8'), original);
  assert.equal(run().status, 1);
  assert.equal(readFileSync(filename, 'utf8'), original);
  const result = run(password + '\n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout + result.stderr).includes(password), false);
  const values = parseEnv(readFileSync(filename, 'utf8'));
  assert.equal(values.PORT, '5500');
  assert.equal(values.EXTRA, 'keep # this');
  assert.equal(values.ADMIN_SESSION_SECRET, secret + ' # preserved');
  assert.equal(values.ADMIN_PASSWORD_SHA256, undefined);
  assert.equal(
    await verifyPassword(password, values.ADMIN_PASSWORD_SCRYPT),
    true,
  );
  const migrated = readFileSync(filename, 'utf8');
  assert.equal(run().status, 0);
  assert.equal(readFileSync(filename, 'utf8'), migrated);
  assert.equal(existsSync(join(directory, '.admin-setup.lock')), false);
});

test('explicit password rotation replaces the password and secret without changing unrelated settings', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'passport-rotate-admin-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, '.env');
  writeFileSync(
    filename,
    'PORT=5500\nADMIN_PASSWORD_SHA256=' +
      sha(password) +
      '\nADMIN_SESSION_SECRET=' +
      secret +
      '\n',
  );
  const original = readFileSync(filename, 'utf8');
  assert.equal(
    spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' })
      .status,
    1,
  );
  assert.equal(readFileSync(filename, 'utf8'), original);
  const result = spawnSync(process.execPath, [script, '--rotate'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  const generated = result.stdout.match(
    /Your new CMS password: ([A-Za-z0-9_-]+)/,
  )![1];
  const values = parseEnv(readFileSync(filename, 'utf8'));
  assert.equal(values.PORT, '5500');
  assert.notEqual(values.ADMIN_SESSION_SECRET, secret);
  assert.equal(
    await verifyPassword(generated, values.ADMIN_PASSWORD_SCRYPT),
    true,
  );
  assert.equal(
    await verifyPassword(password, values.ADMIN_PASSWORD_SCRYPT),
    false,
  );
});

test('new hash configuration wins and invalid scrypt never falls back to a legacy hash', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'passport-auth-config-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const encoded = await hashPassword(password);
  const code =
    'import {readConfig} from ' +
    JSON.stringify(new URL('../server/config.ts', import.meta.url).href) +
    '; process.stdout.write(String(readConfig().adminPasswordHash.startsWith("scrypt:v1:")));';
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    APP_ORIGIN: '',
    TRUST_PROXY: '0',
    FORCE_COLOR: '1',
  };
  delete env.ADMIN_PASSWORD_SCRYPT;
  delete env.ADMIN_PASSWORD_SHA256;
  delete env.ADMIN_SESSION_SECRET;
  const run = () =>
    spawnSync(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        '--input-type=module',
        '-e',
        code,
      ],
      { cwd: directory, encoding: 'utf8', timeout: 10000, env },
    );
  writeFileSync(
    join(directory, '.env'),
    'ADMIN_PASSWORD_SCRYPT=' +
      encoded +
      '\nADMIN_PASSWORD_SHA256=' +
      sha('old') +
      '\nADMIN_SESSION_SECRET=' +
      secret +
      '\n',
  );
  const valid = run();
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout.trim(), 'true');
  writeFileSync(
    join(directory, '.env'),
    'ADMIN_PASSWORD_SCRYPT=invalid\nADMIN_PASSWORD_SHA256=' +
      sha(password) +
      '\nADMIN_SESSION_SECRET=' +
      secret +
      '\n',
  );
  assert.notEqual(run().status, 0);
});

test('backups exclude live sessions without logging out the source and restored cookies cannot replay', async (t) => {
  const app = await fixture(t);
  const cookie = await app.cookie();
  const snapshot = join(app.directory, 'snapshot');
  const backup = await createBackup(app.config.databasePath, snapshot);
  assert.equal(backup.schemaVersion, 7);
  assert.equal(backup.counts.admin_sessions, 0);
  assert.equal(backup.counts.admin_credentials, 1);
  assert.equal(
    (await app.request('/api/admin/session', { headers: { Cookie: cookie } }))
      .status,
    200,
  );
  const restored = await restoreBackup(
    snapshot,
    join(app.directory, 'restored'),
  );
  const store = new Store(restored.databasePath);
  try {
    configureAdmin(app.config, store);
    assert.equal(
      isAdminAuthenticated(
        new Request('http://localhost/', { headers: { Cookie: cookie } }),
        app.config,
        store,
      ),
      false,
    );
    assert.deepEqual(
      Buffer.from(store.getAttachment(app.attachmentId)!.bytes),
      pdf,
    );
  } finally {
    store.close();
  }
  const databasePath = join(snapshot, 'site.sqlite');
  const altered = new DatabaseSync(databasePath);
  try {
    altered
      .prepare(
        'INSERT INTO admin_sessions(id,verifier_hash,generation,expires_at) VALUES (?,?,?,?)',
      )
      .run('test', 'hash', 1, Date.now() + 10000);
  } finally {
    altered.close();
  }
  const manifestPath = join(snapshot, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bytes = readFileSync(databasePath);
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...manifest,
      size: bytes.length,
      sha256: sha(bytes),
      counts: { ...manifest.counts, admin_sessions: 1 },
    }),
  );
  await assert.rejects(verifyBackup(snapshot), /administrator sessions/);
});

test('schema-3 snapshots still restore and migrate while preserving saved leads', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'passport-auth-old-backup-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'old.sqlite');
  const seed = new Store(filename);
  const attachmentId = randomUUID();
  seed.insertLead(
    'old-lead',
    'old-hash',
    { name: 'Старая заявка' },
    '2026-01-01',
    'contact',
    [
      {
        id: attachmentId,
        kind: 'passport',
        name: 'old.pdf',
        bytes: pdf,
        size: pdf.length,
        contentType: 'application/pdf',
        sha256: sha(pdf),
      },
    ],
  );
  const article = seed.articles.save(
    {
      ...emptyArticle(),
      title: 'Старая статья',
      slug: 'old-article',
      content: '<p>Сохранённый материал</p>',
      status: 'published',
      seoTitle: 'Старая статья',
      seoDescription: 'Проверка миграции',
    },
    { requestId: randomUUID() },
  );
  seed.close();
  const database = new DatabaseSync(filename);
  database.exec(
    'DROP TABLE ai_materials; DROP TABLE analytics_pageviews; DROP TABLE analytics_visits; DROP TABLE admin_sessions; DROP TABLE admin_credentials; PRAGMA user_version=3;',
  );
  database.close();
  const snapshot = join(directory, 'old-snapshot');
  assert.equal((await createBackup(filename, snapshot)).schemaVersion, 3);
  const restored = await restoreBackup(snapshot, join(directory, 'restored'));
  const store = new Store(restored.databasePath);
  try {
    assert.equal(store.isAvailable(), true);
    assert.equal(store.listLeads()[0].payload.name, 'Старая заявка');
    assert.equal(store.findLeadHash('old-lead'), 'old-hash');
    assert.deepEqual(
      Buffer.from(store.getAttachment(attachmentId)!.bytes),
      pdf,
    );
    assert.deepEqual(store.articles.bySlug('old-article'), article);
  } finally {
    store.close();
  }
});
