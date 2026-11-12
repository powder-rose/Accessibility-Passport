import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/db/store';
import type { Config } from '../server/config';
import {
  configureAdmin,
  authenticatePassword,
  createAdminSession,
} from '../server/auth/service';
import { Diagnostics } from '../server/diagnostics';
import { createAiEndpoints } from '../server/ai/api';
import {
  imageResult,
  publicAddress,
  type Transport,
} from '../server/ai/gateway';
import type { ShareTransport } from '../server/ai/shared-chat';
import { createApplication } from '../server/application';

const password = 'synthetic-password';
const key = 'synthetic-gateway-secret';
const image = (
  await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#f0f0f0' },
  })
    .png()
    .toBuffer()
).toString('base64');
async function completedJob(
  get: () => Promise<Response>,
): Promise<{ status: string; dataUrl: string; error?: string }> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = (await (await get()).json()) as {
      status: string;
      dataUrl: string;
      error?: string;
    };
    if (result.status !== 'running') return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Synthetic image job did not complete.');
}
async function setup(
  t: import('node:test').TestContext,
  transport: Transport,
  shareTransport?: ShareTransport,
) {
  const dir = mkdtempSync(join(tmpdir(), 'passport-ai-'));
  const config: Config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: join(dir, 'site.sqlite'),
    trustProxy: 0,
    adminPasswordHash: createHash('sha256').update(password).digest('hex'),
    adminSessionSecret: 'synthetic-admin-session-secret-at-least-32',
    appOrigin: 'https://example.test',
  };
  const store = new Store(config.databasePath);
  configureAdmin(config, store);
  const credential = await authenticatePassword(password, config, store);
  assert.ok(credential);
  const cookie = 'osi_admin=' + createAdminSession(config, store, credential);
  const context = {
    config,
    store,
    diagnostics: new Diagnostics(),
    clientIp: '127.0.0.1',
  };
  const endpoints = createAiEndpoints(transport, shareTransport);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const call = async (
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
    auth = true,
    origin = 'https://example.test',
  ) => {
    const headers: Record<string, string> = { Origin: origin };
    if (auth) headers.Cookie = cookie;
    if (body) headers['Content-Type'] = 'application/json';
    const handler =
      endpoints[path] ||
      (/^\/api\/admin\/ai\/image-jobs\//.test(path)
        ? endpoints['/api/admin/ai/image-jobs/*']
        : undefined);
    return handler[method](
      new Request('https://example.test' + path, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      context,
    );
  };
  return { dir, config, call, endpoints, context, cookie };
}
const configPath = '/api/admin/ai/config',
  statusPath = '/api/admin/ai/status',
  textPath = '/api/admin/ai/text',
  imagePath = '/api/admin/ai/image';
const configData = {
  baseUrl: 'https://ai.d1n0tf.ru/v1',
  apiKey: key,
  textModel: 'gpt-6.1-terra',
  imageModel: 'gpt-image-2',
};

test('gateway results are validated and converted to bounded WebP without another request', async () => {
  for (const kind of ['png', 'jpeg', 'webp'] as const) {
    const bytes = await sharp({
      create: { width: 8, height: 6, channels: 3, background: '#ff0000' },
    })
      .toFormat(kind)
      .toBuffer();
    const result = await imageResult({
      data: [{ b64_json: bytes.toString('base64') }],
    });
    assert.match(result, /^data:image\/webp;base64,/);
    const converted = Buffer.from(
      result.slice(result.indexOf(',') + 1),
      'base64',
    );
    if (kind === 'webp') assert.deepEqual(converted, bytes);
    assert.equal(converted.toString('ascii', 0, 4), 'RIFF');
    assert.equal(converted.toString('ascii', 8, 12), 'WEBP');
    const metadata = await sharp(converted).metadata();
    assert.equal(metadata.width, 8);
    assert.equal(metadata.height, 6);
    assert.ok(converted.length <= 5 * 1024 * 1024);
  }
  await assert.rejects(
    imageResult({
      data: [{ b64_json: Buffer.from('not an image').toString('base64') }],
    }),
    /неподдерживаемый/i,
  );
  const malformedPng = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0,
  ]);
  await assert.rejects(
    imageResult({ data: [{ b64_json: malformedPng.toString('base64') }] }),
    /автоматически не повторяется/i,
  );
  const malformedWebp = Buffer.from('RIFF....WEBP');
  await assert.rejects(
    imageResult({ data: [{ b64_json: malformedWebp.toString('base64') }] }),
    /автоматически не повторяется/i,
  );
  const oversizedPng = await sharp({
    create: { width: 6500, height: 6500, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    imageResult({ data: [{ b64_json: oversizedPng.toString('base64') }] }),
    /автоматически не повторяется/i,
  );
});

test('share import requires a valid admin session and same origin before requesting an external page', async (t) => {
  let fetched = 0;
  const f = await setup(
    t,
    async () => {
      throw new Error('no gateway request');
    },
    async () => {
      fetched++;
      return '<html></html>';
    },
  );
  const route = '/api/admin/ai/share-import';
  const body = {
    url: 'https://chatgpt.com/share/12345678-abcd-4321-9876-1234567890ab',
  };
  assert.equal((await f.call(route, 'POST', body, false)).status, 401);
  assert.equal(
    (await f.call(route, 'POST', body, true, 'https://other.test')).status,
    403,
  );
  assert.equal(
    (
      await f.call(route, 'POST', {
        url: 'https://127.0.0.1/share/12345678-abcd-4321-9876-1234567890ab',
      })
    ).status,
    400,
  );
  assert.equal(fetched, 0);
  assert.equal((await f.call(route, 'POST', body)).status, 400);
  assert.equal(fetched, 1);
});

test('structured output validates metadata, sanitizes the HTML and preserves unstructured compatibility', async (t) => {
  const validAnswer = {
    clusterTopic: 'Доступность входной группы',
    title: 'Название',
    slug: 'sample-slug',
    seoTitle: 'SEO',
    seoDescription: 'Описание',
    imageAlt: 'Обложка',
    inlineImageAlts: ['Картинка 1', 'Картинка 2', 'Картинка 3'],
    articleHtml:
      '<h2>Раздел</h2><blockquote><p>Важно: проверка</p></blockquote><script>alert(1)</script><img src="x">',
  };
  let answer = JSON.stringify(validAnswer);
  let calls = 0;
  const f = await setup(t, async () => {
    calls++;
    return {
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: answer } }] }),
    };
  });
  assert.equal((await f.call(configPath, 'POST', configData)).status, 200);
  const response = await f.call(textPath, 'POST', {
    prompt: 'Статья',
    structured: true,
  });
  assert.equal(response.status, 200);
  const result = (await response.json()) as {
    metadata: Record<string, unknown>;
    safeHtml: string;
    text: string;
  };
  assert.equal(result.metadata.title, 'Название');
  assert.equal(result.metadata.clusterTopic, 'Доступность входной группы');
  assert.equal(result.metadata.slug, 'sample-slug');
  assert.equal(result.metadata.imageAlt, 'Обложка');
  assert.deepEqual(result.metadata.inlineImageAlts, [
    'Картинка 1',
    'Картинка 2',
    'Картинка 3',
  ]);
  assert.match(result.safeHtml, /<blockquote>/);
  assert.doesNotMatch(result.safeHtml, /<script|<img/i);
  answer = JSON.stringify({ ...validAnswer, clusterTopic: 'т'.repeat(500) });
  assert.equal(
    (await f.call(textPath, 'POST', { prompt: 'Статья', structured: true }))
      .status,
    200,
  );
  for (const clusterTopic of ['', ' '.repeat(2), 'т'.repeat(501)]) {
    answer = JSON.stringify({ ...validAnswer, clusterTopic });
    const malformed = await f.call(textPath, 'POST', {
      prompt: 'Статья',
      structured: true,
    });
    assert.equal(malformed.status, 400);
  }
  answer = '{invalid json';
  const invalid = await f.call(textPath, 'POST', {
    prompt: 'Статья',
    structured: true,
  });
  assert.equal(invalid.status, 400);
  assert.match(await invalid.text(), /не применены/i);
  assert.equal(calls, 6);
  answer = '<p>Обычный текст</p>';
  const legacy = await f.call(textPath, 'POST', { prompt: 'Статья' });
  assert.equal(legacy.status, 200);
  assert.match(
    ((await legacy.json()) as { safeHtml: string }).safeHtml,
    /Обычный текст/,
  );
});

test('AI configuration requires admin and same origin, stores ciphertext, and never returns the key', async (t) => {
  const f = await setup(t, async () => {
    throw new Error('not used');
  });
  assert.equal((await f.call(statusPath, 'GET', undefined, false)).status, 401);
  assert.equal(
    (
      await f.call(
        configPath,
        'POST',
        configData,
        true,
        'https://attacker.test',
      )
    ).status,
    403,
  );
  const response = await f.call(configPath, 'POST', configData);
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /synthetic-gateway-secret/);
  assert.doesNotMatch(
    readFileSync(join(f.dir, 'ai-settings.enc'), 'utf8'),
    /synthetic-gateway-secret/,
  );
  assert.doesNotMatch(
    await (await f.call(statusPath, 'GET')).text(),
    /synthetic-gateway-secret/,
  );
  assert.equal(
    (await f.call(configPath, 'POST', { ...configData, apiKey: '' })).status,
    200,
  );
  const wrong = {
    ...f.config,
    adminSessionSecret: 'different-secret-also-at-least-32-bytes',
  };
  const changed = await f.endpoints[statusPath].GET(
    new Request('https://example.test' + statusPath, {
      headers: { Cookie: f.cookie },
    }),
    { ...f.context, config: wrong },
  );
  assert.equal(changed.status, 401);
  assert.equal(
    (
      await f.call(configPath, 'POST', {
        ...configData,
        baseUrl: 'https://127.0.0.1/v1',
      })
    ).status,
    400,
  );
});

test('generated HTML is sanitized and the gateway receives two explicit image parts without retries', async (t) => {
  const calls: Array<{
    url: string;
    body: Buffer;
    headers: Record<string, string>;
    timeout: number;
  }> = [];
  const transport: Transport = async (url, headers, body, timeout) => {
    calls.push({ url, headers, body, timeout });
    return {
      status: 200,
      body: url.endsWith('/chat/completions')
        ? JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '<h2>Заголовок</h2><script>alert(1)</script><blockquote><p>Важно: да</p></blockquote><img src="/media/articles/00000000-0000-0000-0000-000000000000.webp"><a href="javascript:alert(1)">опасно</a>',
                },
              },
            ],
          })
        : JSON.stringify({ data: [{ b64_json: image }] }),
    };
  };
  const f = await setup(t, transport);
  assert.equal((await f.call(configPath, 'POST', configData)).status, 200);
  const text = await f.call(textPath, 'POST', {
    prompt: 'подготовь HTML',
    system: 'системное правило',
  });
  assert.equal(text.status, 200);
  const result = (await text.json()) as { safeHtml: string };
  assert.match(result.safeHtml, /<blockquote>/);
  assert.doesNotMatch(result.safeHtml, /<img|script|javascript:/i);
  const ref = 'data:image/png;base64,' + image;
  const requestId = randomUUID();
  const generated = await f.call(imagePath, 'POST', {
    requestId,
    prompt: 'иллюстрация',
    referenceDataUrls: [ref, ref],
  });
  assert.equal(generated.status, 202);
  const ready = await completedJob(() =>
    f.call('/api/admin/ai/image-jobs/' + requestId, 'GET'),
  );
  assert.match(ready.dataUrl, /^data:image\/webp;base64,/);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith('/images/edits'));
  assert.equal(
    (calls[1].body.toString('latin1').match(/name="image\[\]"/g) || []).length,
    2,
  );
  assert.doesNotMatch(calls[1].body.toString('latin1'), /name="output_format"/);
  assert.equal(calls[1].timeout, 900000);
  assert.equal(
    (
      await f.call(imagePath, 'POST', {
        requestId: randomUUID(),
        prompt: 'test',
        referenceDataUrls: [ref, ref, ref],
      })
    ).status,
    400,
  );
  assert.equal(calls.length, 2);
});

test('asynchronous image job survives disconnect and retries are idempotent', async (t) => {
  let complete: ((value: { status: number; body: string }) => void) | undefined;
  let requests = 0;
  let generationBody: Record<string, unknown> | undefined;
  const f = await setup(t, async (_url, _headers, body) => {
    requests++;
    generationBody = JSON.parse(body.toString('utf8')) as Record<
      string,
      unknown
    >;
    return await new Promise((resolve) => {
      complete = resolve;
    });
  });
  await f.call(configPath, 'POST', configData);
  const requestId = randomUUID(),
    payload = { requestId, prompt: 'test', referenceDataUrls: [] };
  assert.equal((await f.call(imagePath, 'POST', payload)).status, 202);
  assert.equal((await f.call(imagePath, 'POST', payload)).status, 202);
  assert.equal(requests, 1);
  assert.equal(Object.hasOwn(generationBody || {}, 'output_format'), false);
  assert.equal(generationBody?.model, configData.imageModel);
  assert.equal(generationBody?.prompt, 'test');
  assert.equal(
    (await f.call(imagePath, 'POST', { ...payload, prompt: 'other' })).status,
    409,
  );
  const path = '/api/admin/ai/image-jobs/' + requestId;
  assert.equal(
    ((await (await f.call(path, 'GET')).json()) as { status: string }).status,
    'running',
  );
  assert.ok(complete);
  complete({
    status: 200,
    body: JSON.stringify({ data: [{ b64_json: image }] }),
  });
  const finished = await completedJob(() => f.call(path, 'GET'));
  assert.equal(finished.status, 'succeeded');
  assert.match(finished.dataUrl, /^data:image\/webp;base64,/);
  assert.equal(requests, 1);
  const list = (await (
    await f.call('/api/admin/ai/image-jobs', 'GET')
  ).json()) as { jobs: Array<Record<string, unknown>> };
  assert.equal(list.jobs.length, 1);
  assert.equal(list.jobs[0].id, requestId);
  assert.equal(list.jobs[0].dataUrl, undefined);
  assert.equal((await f.call(path, 'GET', undefined, false)).status, 401);
});

test('a malformed generated image fails WebP preparation without retrying the paid request', async (t) => {
  let requests = 0;
  const invalidPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const f = await setup(t, async () => {
    requests++;
    return {
      status: 200,
      body: JSON.stringify({
        data: [{ b64_json: invalidPng.toString('base64') }],
      }),
    };
  });
  await f.call(configPath, 'POST', configData);
  const requestId = randomUUID();
  const payload = { requestId, prompt: 'тест', referenceDataUrls: [] };
  assert.equal((await f.call(imagePath, 'POST', payload)).status, 202);
  const result = await completedJob(() =>
    f.call('/api/admin/ai/image-jobs/' + requestId, 'GET'),
  );
  assert.equal(result.status, 'unknown');
  assert.match(result.error || '', /WebP.*автоматически не повторяется/i);
  assert.equal((await f.call(imagePath, 'POST', payload)).status, 202);
  assert.equal(requests, 1);
});

test('unfinished persisted job becomes unknown after restart without repeat', async (t) => {
  let requests = 0;
  const f = await setup(t, async () => {
    requests++;
    throw new Error('must not run');
  });
  const id = randomUUID(),
    dir = join(f.dir, 'ai-image-jobs'),
    now = new Date().toISOString();
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, id + '.json'),
    JSON.stringify({
      id,
      status: 'running',
      createdAt: now,
      updatedAt: now,
      digest: 'synthetic',
    }),
  );
  const job = (await (
    await f.call('/api/admin/ai/image-jobs/' + id, 'GET')
  ).json()) as { status: string; error: string };
  assert.equal(job.status, 'unknown');
  assert.match(job.error, /Результат неизвестен/);
  assert.equal(requests, 0);
});

test('gateway address checks reject private or fake IP addresses', () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '198.18.0.1',
    '::1',
    '::ffff:127.0.0.1',
  ])
    assert.equal(publicAddress(address), false);
  assert.equal(publicAddress('8.8.8.8'), true);
});

test('materials and photos are shared, protected and use separate conflict-safe versions', async (t) => {
  const f = await setup(t, async () => {
    throw new Error('not used');
  });
  const materials = '/api/admin/ai/materials',
    photo = '/api/admin/ai/photo1',
    ref = 'data:image/png;base64,' + image;
  assert.equal((await f.call(materials, 'GET', undefined, false)).status, 401);
  const initial = await (await f.call(materials, 'GET')).json();
  assert.deepEqual(initial, { revision: null, value: null });
  const created = await f.call(materials, 'POST', {
    revision: null,
    value: { topic: 'Первая тема', style: 'Общий стиль' },
  });
  assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), { revision: 1 });
  assert.equal(
    (
      await f.call(materials, 'POST', {
        revision: null,
        value: { topic: 'Старый браузер' },
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.call(photo, 'POST', { revision: null, dataUrl: ref })).status,
    200,
  );
  assert.deepEqual(await (await f.call(photo, 'GET')).json(), {
    revision: 1,
    dataUrl: ref,
  });
  assert.equal(
    (await f.call(photo, 'POST', { revision: 1, dataUrl: null })).status,
    200,
  );
  assert.equal(
    (await f.call(photo, 'POST', { revision: null, dataUrl: ref })).status,
    200,
  );
  assert.equal(
    (await f.call(photo, 'POST', { revision: 1, dataUrl: null })).status,
    409,
  );
  assert.deepEqual(await (await f.call(materials, 'GET')).json(), {
    revision: 1,
    value: { topic: 'Первая тема', style: 'Общий стиль' },
  });
});

test('HTTP endpoints authorize before large bodies and persist materials above the normal JSON limit', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'passport-ai-http-'));
  const config: Config = {
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: join(dir, 'site.sqlite'),
    trustProxy: 0,
    adminPasswordHash: createHash('sha256').update(password).digest('hex'),
    adminSessionSecret: 'synthetic-admin-session-secret-at-least-32',
  };
  const app = await createApplication(config);
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = 'http://127.0.0.1:' + address.port;
  config.appOrigin = origin;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const credential = await authenticatePassword(password, config, app.store);
  assert.ok(credential);
  const cookie =
    'osi_admin=' + createAdminSession(config, app.store, credential);
  const endpoint = origin + '/api/admin/ai/materials';
  const data = JSON.stringify({
    revision: null,
    value: { style: 'я'.repeat(600000) },
  });
  const send = (headers: Record<string, string>) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: data,
    });
  assert.equal((await send({ Origin: origin })).status, 401);
  assert.equal(
    (await send({ Origin: 'https://attacker.example', Cookie: cookie })).status,
    403,
  );
  assert.equal((await send({ Origin: origin, Cookie: cookie })).status, 200);
  const saved = await fetch(endpoint, { headers: { Cookie: cookie } });
  assert.equal(saved.status, 200);
  const result = (await saved.json()) as {
    revision: number;
    value: { style: string };
  };
  assert.equal(result.revision, 1);
  assert.equal(result.value.style.length, 600000);
});
