import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { contentSchema } from '../src/lib/content-schema';
import { createApplication } from '../server/application';

test('oversized configured collections are rejected before accumulating per-element errors', () => {
  const content = JSON.parse(
    readFileSync(new URL('../src/content/home.json', import.meta.url), 'utf8'),
  );
  assert.equal(contentSchema.safeParse(content).success, true);
  content.quiz.questions[0].options = Array(10000).fill({ id: null, label: 0 });
  const result = contentSchema.safeParse(content);
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(
    result.error.issues.length,
    1,
    'the size limit must stop traversal of invalid elements',
  );
  assert.equal(result.error.issues[0].code, 'too_big');
  assert.deepEqual(result.error.issues[0].path, [
    'quiz',
    'questions',
    0,
    'options',
  ]);
});

test('malformed UTM and quiz dictionaries still receive 400 and create no leads', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'osi-validation-'));
  const config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: join(directory, 'site.sqlite'),
    trustProxy: 0,
    adminPasswordHash: '',
    adminSessionSecret: '',
    appOrigin: '',
  };
  const application = await createApplication(config);
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = application.app.listen(0, '127.0.0.1', () =>
      resolve(listener),
    );
    listener.once('error', reject);
  });
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await application.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = 'http://127.0.0.1:' + address.port;
  config.appOrigin = origin;
  const invalidRecords = [
    { utm: { utm_source: [] } },
    { utm: [] },
    { utm: { unexpected: 'not-allowed' } },
    { answers: { documentation: 'passport' } },
    { answers: { documentation: Array(21).fill('passport') } },
    { answers: { documentation: [null] } },
    { answers: [] },
  ];
  for (const record of invalidRecords) {
    const response = await fetch(origin + '/api/leads', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: randomUUID(),
        source: 'contact',
        name: 'Тест валидации',
        phone: '+79990000000',
        email: '',
        consent: true,
        website: '',
        startedAt: Date.now() - 5000,
        pageUrl: origin + '/',
        utm: {},
        ...record,
      }),
      signal: AbortSignal.timeout(8000),
    });
    assert.equal(response.status, 400, JSON.stringify(record));
  }
  assert.equal(application.store.listLeadPage({ limit: 25 }).total, 0);
});
