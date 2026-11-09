import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { getEventListeners } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import {
  adminJson,
  adminRequest,
  AdminRequestError,
  adminRequestMessages,
} from '../src/lib/admin-request';
import { articleRequest } from '../src/components/admin/articles/api';
import { createApplication } from '../server/application';
import {
  emptyArticle,
  type ArticleRecord,
} from '../src/features/articles/model';

const privateDetail = 'synthetic-private-transport-detail';
const deadline = { timeout: 5000 };
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function failure(kind: AdminRequestError['kind'], status?: number) {
  return (error: unknown) => {
    assert.ok(error instanceof AdminRequestError);
    assert.equal(error.kind, kind);
    assert.equal(error.status, status);
    assert.ok(!error.message.includes(privateDetail));
    return true;
  };
}
async function httpFixture(
  t: TestContext,
  handler: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const server = createServer(handler);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return 'http://127.0.0.1:' + address.port;
}

test('administrator JSON requests preserve payloads and enforce no-store, same-origin credentials and no redirects', async () => {
  const payload = {
    requestId: randomUUID(),
    form: { title: 'Synthetic article' },
  };
  const input = adminJson('POST', payload);
  let calls = 0;
  const result = await adminRequest('/api/admin/articles', input, {
    fetcher: async (path, options) => {
      calls++;
      assert.equal(path, '/api/admin/articles');
      assert.equal(options?.method, 'POST');
      assert.equal(options?.body, JSON.stringify(payload));
      assert.equal(
        new Headers(options?.headers).get('content-type'),
        'application/json',
      );
      assert.equal(options?.cache, 'no-store');
      assert.equal(options?.credentials, 'same-origin');
      assert.equal(options?.redirect, 'error');
      assert.equal(options?.signal?.aborted, false);
      return Response.json({ ok: true });
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 1);
  assert.equal(input.signal, undefined);
});

test(
  'a stalled transport settles on its deadline even when it ignores cancellation',
  deadline,
  async () => {
    let forwarded: AbortSignal | null | undefined;
    await assert.rejects(
      adminRequest(
        '/api/admin/session',
        {},
        {
          timeoutMs: 20,
          fetcher: async (_path, options) => {
            forwarded = options?.signal;
            return new Promise<Response>(() => {});
          },
        },
      ),
      (error: unknown) => {
        failure('timeout')(error);
        assert.equal(
          (error as AdminRequestError).message,
          adminRequestMessages.timeout,
        );
        return true;
      },
    );
    assert.equal(forwarded?.aborted, true);
  },
);

test(
  'the deadline includes a real response whose headers arrive but JSON body never finishes',
  deadline,
  async (t) => {
    let calls = 0;
    const origin = await httpFixture(t, (_request, response) => {
      calls++;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"authenticated":');
    });
    await assert.rejects(
      adminRequest(
        '/api/admin/session',
        {},
        {
          timeoutMs: 500,
          fetcher: (path, options) =>
            fetch(new URL(String(path), origin), options),
        },
      ),
      failure('timeout', 200),
    );
    assert.equal(calls, 1);
  },
);

test(
  'a body reader that ignores cancellation cannot keep the administrator request pending',
  deadline,
  async () => {
    const response = Response.json({ ok: true });
    response.json = () => new Promise<never>(() => {});
    await assert.rejects(
      adminRequest(
        '/api/admin/articles',
        {},
        {
          timeoutMs: 20,
          fetcher: async () => response,
        },
      ),
      failure('timeout', 200),
    );
  },
);

test(
  'external cancellation settles the request and a cancelled request never starts a transport',
  deadline,
  async () => {
    const controller = new AbortController();
    let calls = 0;
    let forwarded: AbortSignal | null | undefined;
    const fetcher: typeof fetch = async (_path, options) => {
      calls++;
      forwarded = options?.signal;
      return new Promise<Response>(() => {});
    };
    const pending = adminRequest(
      '/api/admin/leads',
      { signal: controller.signal },
      {
        fetcher,
        timeoutMs: 500,
      },
    );
    controller.abort(privateDetail);
    await assert.rejects(pending, failure('aborted'));
    assert.equal(forwarded?.aborted, true);
    await assert.rejects(
      adminRequest(
        '/api/admin/leads',
        { signal: controller.signal },
        {
          fetcher,
          timeoutMs: 500,
        },
      ),
      failure('aborted'),
    );
    assert.equal(calls, 1);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  },
);

test(
  'a late response or late JSON body cannot confirm an operation after its deadline',
  deadline,
  async () => {
    for (const stage of ['headers', 'body']) {
      let complete: () => void = () => {};
      let confirmed = false;
      const delayed = new Promise<void>((resolve) => {
        complete = resolve;
      });
      const response = Response.json({ ok: true });
      if (stage === 'body')
        response.json = async () => {
          await delayed;
          return { ok: true };
        };
      const pending = adminRequest(
        '/api/admin/articles',
        adminJson('POST', {}),
        {
          timeoutMs: 20,
          fetcher: async () => {
            if (stage === 'headers') await delayed;
            return response;
          },
        },
      ).then(() => {
        confirmed = true;
      });
      await assert.rejects(
        pending,
        failure('timeout', stage === 'body' ? 200 : undefined),
      );
      complete();
      await tick();
      assert.equal(confirmed, false);
    }
  },
);

test(
  'completed requests remove deadlines and caller cancellation listeners on success and errors',
  deadline,
  async () => {
    for (const status of [200, 403]) {
      const controller = new AbortController();
      let forwarded: AbortSignal | null | undefined;
      const pending = adminRequest(
        '/api/admin/session',
        { signal: controller.signal },
        {
          timeoutMs: 20,
          fetcher: async (_path, options) => {
            forwarded = options?.signal;
            return Response.json(
              status === 200
                ? { authenticated: true }
                : { error: 'Нет доступа.' },
              { status },
            );
          },
        },
      );
      if (status === 200) await pending;
      else await assert.rejects(pending, failure('http', status));
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal(forwarded?.aborted, false);
    }
  },
);

test('HTTP statuses and readable server messages remain available for session, conflict and rate-limit handling', async () => {
  for (const status of [401, 403, 409, 429, 503]) {
    await assert.rejects(
      adminRequest(
        '/api/admin/session',
        {},
        {
          fetcher: async () =>
            Response.json({ error: 'Синтетическая ошибка.' }, { status }),
        },
      ),
      (error: unknown) => {
        failure('http', status)(error);
        assert.equal(
          (error as AdminRequestError).message,
          'Синтетическая ошибка.',
        );
        return true;
      },
    );
  }
  await assert.rejects(
    articleRequest(
      '/api/admin/articles',
      {},
      {
        fetcher: async () =>
          Response.json({ error: 'Нет доступа.' }, { status: 401 }),
      },
    ),
    (error: unknown) => {
      failure('http', 401)(error);
      assert.match(
        (error as AdminRequestError).message,
        /Войдите в админку в другой вкладке/,
      );
      return true;
    },
  );
});

test(
  'unconfirmed mutations never retry automatically or expose network and malformed-response details',
  deadline,
  async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      for (const mode of ['network', 'response', 'timeout'] as const) {
        let calls = 0;
        await assert.rejects(
          adminRequest(
            '/api/admin/articles',
            adminJson(method, { requestId: 'same-id' }),
            {
              timeoutMs: 20,
              fetcher: async () => {
                calls++;
                if (mode === 'network') throw new TypeError(privateDetail);
                if (mode === 'response')
                  return new Response('<html>' + privateDetail + '</html>');
                return new Promise<Response>(() => {});
              },
            },
          ),
          (error: unknown) => {
            failure(mode, mode === 'response' ? 200 : undefined)(error);
            assert.equal(
              (error as AdminRequestError).message,
              adminRequestMessages.unconfirmed,
            );
            return true;
          },
        );
        assert.equal(calls, 1);
      }
    }
  },
);

test('invalid administrator deadlines fail before issuing a network request', async () => {
  let calls = 0;
  for (const timeoutMs of [0, -1, 0.5, Infinity, NaN, 300_001]) {
    await assert.rejects(
      adminRequest(
        '/api/admin/session',
        {},
        {
          timeoutMs,
          fetcher: async () => {
            calls++;
            return Response.json({});
          },
        },
      ),
      RangeError,
    );
  }
  assert.equal(calls, 0);
});

test(
  'a real redirect cannot silently become an authenticated JSON success',
  deadline,
  async (t) => {
    const paths: string[] = [];
    const origin = await httpFixture(t, (request, response) => {
      paths.push(request.url!);
      if (request.url === '/redirect')
        response.writeHead(302, { Location: '/target' }).end();
      else response.end('{"authenticated":true}');
    });
    await assert.rejects(
      adminRequest(
        '/redirect',
        {},
        {
          fetcher: (path, options) =>
            fetch(new URL(String(path), origin), options),
        },
      ),
      failure('network'),
    );
    assert.deepEqual(paths, ['/redirect']);
  },
);

test(
  'a lost article-save response preserves the request ID and an explicit retry recovers one saved article',
  deadline,
  async (t) => {
    const password = 'synthetic-admin-network-password';
    const config = {
      production: true,
      host: '127.0.0.1',
      port: 0,
      databasePath: ':memory:',
      trustProxy: 0,
      adminPasswordHash: createHash('sha256').update(password).digest('hex'),
      adminSessionSecret: 'synthetic-admin-network-secret-at-least-32',
      appOrigin: '',
    };
    const application = await createApplication(config);
    const server = application.app.listen(0, '127.0.0.1');
    t.after(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await application.close();
    });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = 'http://127.0.0.1:' + address.port;
    config.appOrigin = origin;
    const login = await fetch(origin + '/api/admin/login', {
      ...adminJson('POST', { password }),
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const payload = {
      requestId: randomUUID(),
      form: {
        ...emptyArticle(),
        title: 'Synthetic saved draft',
        content: '<p>Draft text</p>',
      },
    };
    const attempts: string[] = [];
    let loseResponse = true;
    const fetcher: typeof fetch = async (path, options) => {
      const headers = new Headers(options?.headers);
      headers.set('Origin', origin);
      headers.set('Cookie', cookie);
      attempts.push(String(options?.body));
      const response = await fetch(new URL(String(path), origin), {
        ...options,
        headers,
      });
      assert.equal(response.status, 200);
      if (loseResponse) {
        loseResponse = false;
        await response.json();
        throw new TypeError(privateDetail);
      }
      return response;
    };
    const submit = () =>
      adminRequest<{ article: ArticleRecord }>(
        '/api/admin/articles',
        adminJson('POST', payload),
        { fetcher, timeoutMs: 2000 },
      );
    await assert.rejects(submit(), failure('network'));
    assert.equal(application.store.articles.list().length, 1);
    const retried = await submit();
    assert.equal(application.store.articles.list().length, 1);
    assert.equal(retried.article.title, payload.form.title);
    assert.equal(retried.article.content, payload.form.content);
    assert.deepEqual(attempts, [
      JSON.stringify(payload),
      JSON.stringify(payload),
    ]);
  },
);
