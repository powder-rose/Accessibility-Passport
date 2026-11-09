import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LeadSubmissionError,
  leadSubmissionMessages,
  sendLeadRequest,
} from '../src/lib/lead-submission';
import { createApplication } from '../server/application';
import { pdf } from './fixtures/documents';

const requestId = '00000000-0000-4000-8000-000000000001';
const json = JSON.stringify({ requestId });
const ack = (value: unknown = { ok: true, id: requestId }, status = 200) =>
  Response.json(value, { status });
const errorMessage = (message: string) => (error: unknown) => {
  assert.ok(error instanceof LeadSubmissionError);
  assert.equal(error.message, message);
  return true;
};

test('only an HTTP success with acknowledgement for the submitted ID confirms a lead', async () => {
  await sendLeadRequest({ body: json, requestId, fetcher: async () => ack() });
  for (const response of [
    ack({ ok: true, id: 'other-request' }),
    ack({ ok: true }),
    ack({ ok: 'true', id: requestId }),
    ack({ ok: false, id: requestId }),
    ack(null),
    ack([{ ok: true, id: requestId }]),
    ack({ ok: true, id: requestId }, 503),
  ]) {
    await assert.rejects(
      sendLeadRequest({ body: json, requestId, fetcher: async () => response }),
      errorMessage(leadSubmissionMessages.confirmation),
    );
  }
});

test('server validation remains readable while network and malformed-response details stay hidden', async () => {
  await assert.rejects(
    sendLeadRequest({
      body: json,
      requestId,
      fetcher: async () => ack({ error: 'Проверьте телефон.' }, 400),
    }),
    errorMessage('Проверьте телефон.'),
  );
  for (const fetcher of [
    async () => {
      throw new TypeError('synthetic-private-network-diagnostic');
    },
    async () =>
      new Response('<html>synthetic-private-proxy-error</html>', {
        status: 502,
      }),
    async () => new Response(null, { status: 204 }),
  ]) {
    await assert.rejects(
      sendLeadRequest({ body: json, requestId, fetcher }),
      errorMessage(leadSubmissionMessages.confirmation),
    );
  }
});

test('a hanging transport is aborted and the deadline settles even if the transport ignores abort', async () => {
  let signal: AbortSignal | null | undefined;
  await assert.rejects(
    sendLeadRequest({
      body: json,
      requestId,
      timeoutMs: 15,
      fetcher: async (_url, init) => {
        signal = init?.signal;
        return new Promise<Response>(() => {});
      },
    }),
    errorMessage(leadSubmissionMessages.timeout),
  );
  assert.equal(signal?.aborted, true);
});

test('a response that arrives after the deadline cannot turn failure into success', async () => {
  let complete: (response: Response) => void = () => {};
  const delayed = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  let confirmed = false;
  const result = sendLeadRequest({
    body: json,
    requestId,
    timeoutMs: 15,
    fetcher: async () => delayed,
  }).then(() => {
    confirmed = true;
  });
  await assert.rejects(result, errorMessage(leadSubmissionMessages.timeout));
  complete(ack());
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(confirmed, false);
});

test('deadline includes response JSON consumption and cancels a real stalled response body', async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.flushHeaders();
    response.write('{"ok":');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await assert.rejects(
    sendLeadRequest({
      body: json,
      requestId,
      timeoutMs: 100,
      fetcher: (_url, init) => fetch('http://127.0.0.1:' + address.port, init),
    }),
    errorMessage(leadSubmissionMessages.timeout),
  );
});

test('external cancellation settles a pending request and an already-cancelled request never starts', async () => {
  const controller = new AbortController();
  let calls = 0;
  let forwarded: AbortSignal | null | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    forwarded = init?.signal;
    return new Promise<Response>(() => {});
  };
  const waiting = sendLeadRequest({
    body: json,
    requestId,
    signal: controller.signal,
    fetcher,
  });
  controller.abort();
  await assert.rejects(
    waiting,
    errorMessage(leadSubmissionMessages.confirmation),
  );
  assert.equal(forwarded?.aborted, true);
  await assert.rejects(
    sendLeadRequest({
      body: json,
      requestId,
      signal: controller.signal,
      fetcher,
    }),
    errorMessage(leadSubmissionMessages.confirmation),
  );
  assert.equal(calls, 1);
});

test('success and validation failure remove timers and cancellation subscriptions', async () => {
  for (const success of [true, false]) {
    const controller = new AbortController();
    let forwarded: AbortSignal | null | undefined;
    const request = sendLeadRequest({
      body: json,
      requestId,
      signal: controller.signal,
      timeoutMs: 15,
      fetcher: async (_url, init) => {
        forwarded = init?.signal;
        return success ? ack() : ack({ error: 'Проверьте телефон.' }, 400);
      },
    });
    if (success) await request;
    else await assert.rejects(request, errorMessage('Проверьте телефон.'));
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(forwarded?.aborted, false);
  }
});

async function apiFixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'passport-submit-'));
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
    server.closeAllConnections();
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
  const fetcher: typeof fetch = (url, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Origin', origin);
    return fetch(new URL(String(url), origin), { ...init, headers });
  };
  const payload = {
    requestId: randomUUID(),
    source: 'contact',
    name: 'Синтетический контакт',
    phone: '+79990000000',
    email: '',
    consent: true,
    website: '',
    startedAt: Date.now() - 5000,
    pageUrl: origin + '/',
    utm: { utm_source: 'submission-test' },
    service: 'passport',
  };
  return { application, origin, fetcher, payload };
}

test('retry after a saved JSON request loses its acknowledgement creates no second lead', async (t) => {
  const { application, fetcher, payload } = await apiFixture(t);
  const body = JSON.stringify(payload);
  await assert.rejects(
    sendLeadRequest({
      body,
      requestId: payload.requestId,
      fetcher: async (url, init) => {
        const response = await fetcher(url, init);
        assert.equal(response.status, 200);
        await response.json();
        throw new TypeError('synthetic-lost-acknowledgement');
      },
    }),
    errorMessage(leadSubmissionMessages.confirmation),
  );
  const before = application.store.listLeadPage({ limit: 25 });
  assert.equal(before.total, 1);
  await sendLeadRequest({ body, requestId: payload.requestId, fetcher });
  assert.deepEqual(application.store.listLeadPage({ limit: 25 }), before);
});

test('multipart retry preserves the document and does not create another lead or attachment', async (t) => {
  const { application, origin, fetcher, payload } = await apiFixture(t);
  const data = {
    ...payload,
    pageUrl: origin + '/aktualizaciya-pasporta-dostupnosti/',
    service: 'update',
  };
  const body = new FormData();
  body.set('data', JSON.stringify(data));
  body.append(
    'attachment:passport',
    new File([new Uint8Array(pdf)], 'passport.pdf', {
      type: 'application/pdf',
    }),
  );
  await assert.rejects(
    sendLeadRequest({
      body,
      requestId: data.requestId,
      fetcher: async (url, init) => {
        assert.equal(new Headers(init?.headers).has('content-type'), false);
        const response = await fetcher(url, init);
        assert.equal(response.status, 200);
        await response.json();
        throw new TypeError('synthetic-lost-multipart-acknowledgement');
      },
    }),
    errorMessage(leadSubmissionMessages.confirmation),
  );
  const before = application.store.listLeadPage({ limit: 25 });
  assert.equal(before.total, 1);
  await sendLeadRequest({ body, requestId: data.requestId, fetcher });
  const after = application.store.listLeadPage({ limit: 25 });
  assert.deepEqual(after, before);
  const attachments = after.leads[0].payload.attachments as { id: string }[];
  assert.equal(attachments.length, 1);
  assert.deepEqual(
    Buffer.from(application.store.getAttachment(attachments[0].id)!.bytes),
    pdf,
  );
});
