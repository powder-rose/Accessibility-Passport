import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Server } from 'node:http';
import { createApplication } from '../server/application';
import type { Config } from '../server/config';
import { Store } from '../server/db/store';
import { initialSchema } from '../server/db/migrations';
import { defaultAttachmentLimits, MiB } from '../src/lib/attachments';
import { validateAttachment } from '../server/uploads/validate';
import { pdf, png, office, zip } from './fixtures/documents';
import { getServiceContent } from '../server/service-content';
import { getSiteContent } from '../server/content';
import { track } from '../src/lib/analytics';

const directory = mkdtempSync(join(tmpdir(), 'osi-update-upload-'));
const filename = join(directory, 'leads.sqlite');
const password = 'synthetic-upload-test-password';
const config: Config = {
  production: true,
  host: '127.0.0.1',
  port: 0,
  databasePath: filename,
  trustProxy: 0,
  adminPasswordHash: createHash('sha256').update(password).digest('hex'),
  adminSessionSecret: 'synthetic-upload-session-secret-32-characters',
};
let application: Awaited<ReturnType<typeof createApplication>>;
let server: Server;
let origin: string;
let cookie: string;
const endpoint = '/aktualizaciya-pasporta-dostupnosti/';
async function start() {
  application = await createApplication(config);
  server = await new Promise<Server>((resolve) => {
    const listener = application.app.listen(0, '127.0.0.1', () =>
      resolve(listener),
    );
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  config.appOrigin = origin;
  const response = await json('/api/admin/login', { password });
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie')!.split(';')[0];
}
async function stop() {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await application.close();
}
function request(path: string, options: RequestInit = {}) {
  return fetch(origin + path, {
    ...options,
    signal: AbortSignal.timeout(8000),
  });
}
function json(
  path: string,
  body: unknown,
  method = 'POST',
  authenticated = false,
) {
  return request(path, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(authenticated ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
function lead(overrides: Record<string, unknown> = {}) {
  return {
    requestId: randomUUID(),
    source: 'contact',
    name: 'Тест вложений',
    phone: '+79990000000',
    email: '',
    consent: true,
    website: '',
    startedAt: Date.now() - 5000,
    pageUrl: origin + endpoint + '?utm_source=upload-test',
    utm: { utm_source: 'upload-test' },
    service: 'update',
    passportDevelopedAt: '2022',
    comment: 'Изменились входные группы.',
    ...overrides,
  };
}
function upload(
  data: unknown,
  files: { name: string; bytes: Buffer; kind?: string; type?: string }[],
  headers: Record<string, string> = {},
) {
  const form = new FormData();
  form.set('data', JSON.stringify(data));
  for (const file of files)
    form.append(
      'attachment:' + (file.kind || 'passport'),
      new File([new Uint8Array(file.bytes)], file.name, {
        type: file.type || 'application/octet-stream',
      }),
    );
  return request('/api/leads', {
    method: 'POST',
    headers: { Origin: origin, ...headers },
    body: form,
  });
}
before(start);
after(async () => {
  await stop();
  rmSync(directory, { recursive: true, force: true });
});

test('accepted formats are checked by structure and MIME, executable renames and unsafe Office packages fail', async () => {
  for (const [name, bytes] of [
    ['паспорт.pdf', pdf],
    ['фото.png', png],
    ['акт.docx', office('docx')],
    ['анкета.xlsx', office('xlsx')],
    ['фото.jpg', Buffer.from([255, 216, 255, 224, 0, 2, 255, 217])],
  ] as const) {
    const file = await validateAttachment(
      new File([new Uint8Array(bytes)], name),
      'passport',
      defaultAttachmentLimits,
    );
    assert.equal(file.size, bytes.length);
    assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
  for (const [name, bytes, type] of [
    ['virus.exe', pdf, ''],
    ['virus.exe.pdf', pdf, ''],
    ['../паспорт.pdf', pdf, ''],
    ['fake.pdf', Buffer.from('MZ executable'), ''],
    ['fake.docx', zip({ 'random.txt': 'text' }), ''],
    ['macro.docx', office('docx', { 'word/vbaProject.bin': 'bad' }), ''],
    ['path.docx', office('docx', { '../escape.xml': 'bad' }), ''],
    ['fake.xlsx', office('docx'), ''],
    ['wrong.pdf', pdf, 'image/png'],
  ] as const)
    await assert.rejects(
      () =>
        validateAttachment(
          new File([new Uint8Array(bytes)], name, { type }),
          'passport',
          defaultAttachmentLimits,
        ),
      name,
    );
  await assert.rejects(() =>
    validateAttachment(
      new File([new Uint8Array(5 * MiB + 1)], 'big.pdf'),
      'passport',
      defaultAttachmentLimits,
    ),
  );
});

test('multipart lead persists files atomically, identical retries deduplicate and changed file retries conflict', async () => {
  const data = lead();
  const files = [
    { name: 'старый паспорт.pdf', bytes: pdf },
    { name: 'акт.docx', bytes: office('docx'), kind: 'survey' },
    { name: 'анкета.xlsx', bytes: office('xlsx'), kind: 'questionnaire' },
  ];
  let response = await upload(data, files);
  assert.equal(response.status, 200, await response.text());
  response = await upload(data, files);
  assert.equal(response.status, 200, await response.text());
  response = await upload(data, [{ name: 'другой.pdf', bytes: pdf }]);
  assert.equal(response.status, 409);
  const rows = application.store.listLeads();
  assert.equal(rows.length, 1);
  const saved = rows[0].payload;
  assert.equal(saved.initialService, 'update');
  assert.equal(saved.service, 'update');
  assert.equal(saved.passportDevelopedAt, '2022');
  assert.equal(saved.pageUrl, data.pageUrl);
  assert.deepEqual(saved.utm, data.utm);
  assert.equal((saved.attachments as unknown[]).length, 3);
  const db = new DatabaseSync(filename);
  assert.equal(
    (
      db.prepare('SELECT COUNT(*) AS count FROM lead_attachments').get() as {
        count: number;
      }
    ).count,
    3,
  );
  db.close();
});

test('attachments require a valid staff session and download as private non-executable responses', async () => {
  const saved = application.store.listLeads()[0].payload.attachments as {
    id: string;
    name: string;
  }[];
  const path = '/api/admin/attachments/' + saved[0].id;
  assert.equal((await request(path)).status, 401);
  assert.equal(
    (await request(path, { headers: { Cookie: 'osi_admin=invalid' } })).status,
    401,
  );
  const response = await request(path, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  assert.equal(
    response.headers.get('content-type'),
    'application/octet-stream',
  );
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-disposition')!, /^attachment;/);
  assert.match(response.headers.get('content-security-policy')!, /sandbox/);
  assert.equal(
    (
      await request('/api/admin/attachments/' + randomUUID(), {
        headers: { Cookie: cookie },
      })
    ).status,
    404,
  );
  assert.equal((await request('/uploads/' + saved[0].id)).status, 404);
});

test('invalid contacts, disallowed page uploads and malformed fields save neither lead nor attachments', async () => {
  const before = application.store.listLeads().length;
  for (const data of [
    lead({ consent: false }),
    lead({ pageUrl: origin + '/' }),
    lead({ source: 'express' }),
  ]) {
    const response = await upload(data, [{ name: 'passport.pdf', bytes: pdf }]);
    assert.equal(response.status, 400, await response.text());
  }
  const form = new FormData();
  form.append('data', JSON.stringify(lead()));
  form.append('attachment:unknown', new File([pdf], 'passport.pdf'));
  assert.equal(
    (
      await request('/api/leads', {
        method: 'POST',
        headers: { Origin: origin },
        body: form,
      })
    ).status,
    400,
  );
  assert.equal(application.store.listLeads().length, before);
  const db = new DatabaseSync(filename);
  assert.equal(
    (
      db.prepare('SELECT COUNT(*) AS count FROM lead_attachments').get() as {
        count: number;
      }
    ).count,
    3,
  );
  db.close();
});

test('file count, format, per-file and overall limits fail clearly without creating records', async () => {
  const base = application.store.listLeads().length;
  for (const files of [
    Array.from({ length: 7 }, (_, i) => ({ name: `${i}.pdf`, bytes: pdf })),
    [{ name: 'executable.exe', bytes: pdf }],
    [{ name: 'fake.pdf', bytes: Buffer.from('not a PDF') }],
    [{ name: 'large.pdf', bytes: Buffer.alloc(5 * MiB + 1) }],
    Array.from({ length: 5 }, (_, i) => ({
      name: `${i}.pdf`,
      bytes: Buffer.alloc(5 * MiB),
    })),
  ]) {
    const response = await upload(lead(), files);
    assert.ok([400, 413, 415].includes(response.status), await response.text());
  }
  assert.equal(application.store.listLeads().length, base);
});

test('attachment settings are removed and legacy values cannot change fixed limits after restart', async () => {
  const value = { maxFiles: 2, maxFileBytes: MiB, maxTotalBytes: 2 * MiB };
  const database = new DatabaseSync(filename);
  try {
    database
      .prepare(
        'INSERT INTO upload_settings VALUES (1,?) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings',
      )
      .run(JSON.stringify(value));
  } finally {
    database.close();
  }
  for (const authenticated of [false, true]) {
    assert.equal(
      (
        await json(
          '/api/admin/attachment-settings',
          value,
          'PUT',
          authenticated,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request('/api/admin/attachment-settings', {
          headers: authenticated ? { Cookie: cookie } : {},
        })
      ).status,
      404,
    );
  }
  assert.deepEqual(
    await (await request('/api/attachment-limits')).json(),
    defaultAttachmentLimits,
  );
  assert.equal(
    (
      await upload(
        lead(),
        Array.from({ length: 3 }, (_, i) => ({ name: `${i}.pdf`, bytes: pdf })),
      )
    ).status,
    200,
  );
  await stop();
  await start();
  assert.deepEqual(
    await (await request('/api/attachment-limits')).json(),
    defaultAttachmentLimits,
  );
  const saved = application.store.listLeads()[0].payload.attachments as {
    id: string;
  }[];
  assert.deepEqual(
    Buffer.from(
      await (
        await request('/api/admin/attachments/' + saved[0].id, {
          headers: { Cookie: cookie },
        })
      ).arrayBuffer(),
    ),
    pdf,
  );
});

test('update quiz preserves five themed answers without age-based legal conclusions or numeric prices', async () => {
  const quiz = getServiceContent('update', getSiteContent()).quiz!;
  const answers = Object.fromEntries(
    quiz.questions.map((q) => [q.id, [q.options[0].id]]),
  );
  answers.passportAge = ['older'];
  answers.changes = ['repair', 'equipment'];
  const data = lead({ source: 'express', quizMode: 'update', answers });
  const response = await json('/api/leads', data);
  assert.equal(response.status, 200, await response.text());
  const saved = application.store
    .listLeads()
    .find((row) => row.id === data.requestId)!.payload;
  assert.deepEqual(saved.answers, answers);
  assert.equal(saved.service, 'update');
  assert.equal((saved.questions as unknown[]).length, 5);
  assert.doesNotMatch(
    JSON.stringify(saved.classification),
    /обязан|ежегод|12\s?500|45\s?000/,
  );
  assert.equal(
    (
      await json(
        '/api/leads',
        lead({
          source: 'express',
          quizMode: 'update',
          answers: { ...answers, passportAge: ['not-valid'] },
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await json(
        '/api/leads',
        lead({
          source: 'express',
          quizMode: 'update',
          pageUrl: origin + '/',
          answers,
        }),
      )
    ).status,
    400,
  );
});

test('cross-origin and compressed multipart attempts are rejected before files are stored', async () => {
  assert.equal(
    (
      await upload(lead(), [{ name: 'passport.pdf', bytes: pdf }], {
        Origin: 'https://other.invalid',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await upload(lead(), [{ name: 'passport.pdf', bytes: pdf }], {
        'Content-Encoding': 'gzip',
      })
    ).status,
    415,
  );
});

test('schema v1 migration preserves old leads and private uploads commit together or roll back', async () => {
  const path = join(directory, 'legacy.sqlite');
  const db = new DatabaseSync(path);
  db.exec(initialSchema + '; PRAGMA user_version=1');
  db.prepare('INSERT INTO leads VALUES (?,?,?,?,?,?)').run(
    'legacy',
    'old-hash',
    '{"name":"Старая заявка"}',
    '2020-01-01',
    'contact',
    'new',
  );
  db.close();
  const store = new Store(path);
  assert.equal(store.listLeads()[0].payload.name, 'Старая заявка');
  const file = await validateAttachment(
    new File([pdf], 'passport.pdf'),
    'passport',
    defaultAttachmentLimits,
  );
  assert.throws(() =>
    store.insertLead('rollback', 'hash', {}, '2026-01-01', 'contact', [
      file,
      file,
    ]),
  );
  assert.equal(store.findLeadHash('rollback'), undefined);
  assert.equal(store.getAttachment(file.id), undefined);
  store.close();
  const migrated = new DatabaseSync(path);
  assert.equal(
    (migrated.prepare('PRAGMA user_version').get() as { user_version: number })
      .user_version,
    5,
  );
  migrated.close();
});

test('analytics events contain URL and whitelisted attribution rather than uploaded content or contacts', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousLocation = Object.getOwnPropertyDescriptor(
    globalThis,
    'location',
  );
  const captured: unknown[][] = [];
  const browser = {
    dataLayer: [],
    ym: (...args: unknown[]) => captured.push(args),
  };
  try {
    Object.defineProperty(globalThis, 'window', {
      value: browser,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'location', {
      value: new URL(
        'https://example.invalid' +
          endpoint +
          '?utm_source=test&phone=private&file=secret.pdf#contact',
      ),
      configurable: true,
    });
    track('document_upload_success', endpoint, '123456');
    assert.deepEqual(browser.dataLayer, [
      {
        event: 'document_upload_success',
        page: endpoint,
        url: 'https://example.invalid' + endpoint,
        utm_source: 'test',
      },
    ]);
    assert.equal(captured.length, 1);
    assert.doesNotMatch(JSON.stringify(captured), /private|secret\.pdf|phone/);
  } finally {
    if (previousWindow)
      Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousLocation)
      Object.defineProperty(globalThis, 'location', previousLocation);
    else Reflect.deleteProperty(globalThis, 'location');
  }
});
