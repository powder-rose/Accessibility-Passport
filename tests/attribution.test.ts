import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attribution, track } from '../src/lib/analytics';
import { createApplication } from '../server/application';
import { getSiteContent } from '../server/content';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    failRead: false,
    failWrite: false,
    getItem(key: string) {
      if (this.failRead) throw new Error('Storage read blocked');
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (this.failWrite) throw new Error('Storage quota exceeded');
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

function browserFixture(t: TestContext, url: string) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousLocation = Object.getOwnPropertyDescriptor(
    globalThis,
    'location',
  );
  const storage = memoryStorage();
  const calls: unknown[][] = [];
  const browser = {
    sessionStorage: storage,
    dataLayer: [] as Record<string, string>[],
    ym: (...args: unknown[]) => calls.push(args),
  };
  function navigate(next: string) {
    Object.defineProperty(globalThis, 'location', {
      value: new URL(next),
      configurable: true,
    });
  }
  Object.defineProperty(globalThis, 'window', {
    value: browser,
    configurable: true,
  });
  navigate(url);
  t.after(() => {
    if (previousWindow)
      Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousLocation)
      Object.defineProperty(globalThis, 'location', previousLocation);
    else Reflect.deleteProperty(globalThis, 'location');
  });
  return { browser, storage, calls, navigate };
}

test('landing attribution survives untagged service, form and quiz navigation', (t) => {
  const fixture = browserFixture(
    t,
    'https://example.invalid/?utm_source=yandex&utm_medium=cpc&utm_campaign=osi',
  );
  const expected = {
    utm_source: 'yandex',
    utm_medium: 'cpc',
    utm_campaign: 'osi',
  };
  assert.deepEqual(attribution(), expected);
  for (const path of [
    '/anketa-osi/',
    '/anketa-osi/?service=questionnaire#contact',
    '/akt-obsledovaniya-osi/?object_type=education#quiz',
  ]) {
    fixture.navigate('https://example.invalid' + path);
    assert.deepEqual(attribution(), expected);
  }
});

test('a new tagged visit replaces the complete campaign without mixing old fields', (t) => {
  const fixture = browserFixture(
    t,
    'https://example.invalid/?utm_source=yandex&utm_campaign=old&utm_term=old-term',
  );
  attribution();
  fixture.navigate('https://example.invalid/anketa-osi/?utm_source=email');
  assert.deepEqual(attribution(), { utm_source: 'email' });
  fixture.navigate('https://example.invalid/akt-obsledovaniya-osi/');
  assert.deepEqual(attribution(), { utm_source: 'email' });
});

test('only five UTM strings are stored, decoded once and limited to server field bounds', (t) => {
  const fixture = browserFixture(
    t,
    'https://example.invalid/?utm_source=yandex&utm_medium=cpc&utm_campaign=' +
      encodeURIComponent('Анкета ОСИ') +
      '&utm_term=' +
      'x'.repeat(350) +
      '&utm_content=hero&utm_source=second&phone=private&email=private&file=secret.pdf#private',
  );
  const expected = {
    utm_source: 'yandex',
    utm_medium: 'cpc',
    utm_campaign: 'Анкета ОСИ',
    utm_term: 'x'.repeat(300),
    utm_content: 'hero',
  };
  assert.deepEqual(attribution(), expected);
  assert.equal(fixture.storage.values.size, 1);
  const saved = [...fixture.storage.values.values()][0];
  assert.deepEqual(JSON.parse(saved), expected);
  assert.doesNotMatch(saved, /private|secret\.pdf|https:|phone|email|file/);
});

test('empty UTM and ordinary query parameters retain the last tagged visit', (t) => {
  const fixture = browserFixture(
    t,
    'https://example.invalid/?utm_source=initial',
  );
  attribution();
  fixture.navigate(
    'https://example.invalid/anketa-osi/?utm_source=&service=questionnaire',
  );
  assert.deepEqual(attribution(), { utm_source: 'initial' });
});

test('a separate tab storage does not inherit campaign values from module memory', (t) => {
  const fixture = browserFixture(
    t,
    'https://example.invalid/?utm_source=initial',
  );
  attribution();
  fixture.browser.sessionStorage = memoryStorage();
  fixture.navigate('https://example.invalid/anketa-osi/');
  assert.deepEqual(attribution(), {});
  assert.equal(fixture.storage.values.size, 1);
});

test('malformed cached values are ignored and cached fields are validated again', (t) => {
  const fixture = browserFixture(
    t,
    'https://example.invalid/?utm_source=initial',
  );
  attribution();
  const key = [...fixture.storage.values.keys()][0];
  fixture.navigate('https://example.invalid/anketa-osi/');
  for (const saved of [
    '{broken',
    'null',
    '42',
    '["utm_source"]',
    'x'.repeat(10001),
  ]) {
    fixture.storage.values.set(key, saved);
    assert.deepEqual(attribution(), {});
  }
  fixture.storage.values.set(
    key,
    JSON.stringify({
      utm_source: 'x'.repeat(350),
      utm_medium: 123,
      utm_campaign: ['invalid'],
      phone: 'private',
      __proto__: { utm_content: 'inherited' },
    }),
  );
  assert.deepEqual(attribution(), { utm_source: 'x'.repeat(300) });
});

test('blocked storage access does not break current-page attribution or events', (t) => {
  const fixture = browserFixture(
    t,
    'https://example.invalid/?utm_source=current',
  );
  Object.defineProperty(fixture.browser, 'sessionStorage', {
    get() {
      throw new Error('Storage access denied');
    },
  });
  assert.deepEqual(attribution(), { utm_source: 'current' });
  track('lead_submit', '/', '');
  assert.equal(fixture.browser.dataLayer[0].utm_source, 'current');
  fixture.navigate('https://example.invalid/anketa-osi/');
  assert.deepEqual(attribution(), {});
});

test('a failed campaign write removes an old readable campaign instead of reviving it', (t) => {
  const fixture = browserFixture(t, 'https://example.invalid/?utm_source=old');
  attribution();
  fixture.storage.failWrite = true;
  fixture.navigate('https://example.invalid/?utm_source=new');
  assert.deepEqual(attribution(), { utm_source: 'new' });
  fixture.navigate('https://example.invalid/anketa-osi/');
  assert.deepEqual(attribution(), {});
});

test('blocked storage reads return an empty fallback without failing the page', (t) => {
  const fixture = browserFixture(t, 'https://example.invalid/anketa-osi/');
  fixture.storage.failRead = true;
  assert.deepEqual(attribution(), {});
});

test('analytics events use the retained campaign and the actual current page', (t) => {
  const fixture = browserFixture(
    t,
    'https://example.invalid/?utm_source=yandex&utm_campaign=osi&phone=private',
  );
  attribution();
  fixture.navigate(
    'https://example.invalid/anketa-osi/?file=secret.pdf#contact',
  );
  track('lead_submit', '/anketa-osi/', '123456');
  assert.deepEqual(fixture.browser.dataLayer, [
    {
      event: 'lead_submit',
      page: '/anketa-osi/',
      url: 'https://example.invalid/anketa-osi/',
      utm_source: 'yandex',
      utm_campaign: 'osi',
    },
  ]);
  assert.equal(fixture.calls.length, 1);
  assert.doesNotMatch(
    JSON.stringify(fixture.calls),
    /private|secret\.pdf|phone|file=/,
  );
});

test('SSR does not require browser globals or session storage', () => {
  assert.equal(typeof window, 'undefined');
  assert.deepEqual(attribution(), {});
});

test('retained attribution is accepted and persisted for contact and quiz leads on another page', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'osi-attribution-test-'));
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
  const fixture = browserFixture(
    t,
    origin + '/?utm_source=yandex&utm_campaign=osi',
  );
  attribution();
  fixture.navigate(origin + '/anketa-osi/?service=questionnaire#contact');
  const answers = Object.fromEntries(
    getSiteContent().quiz.questions.map((question) => [
      question.id,
      [question.options[0].id],
    ]),
  );
  answers.documentation = ['questionnaire'];
  const expected = { utm_source: 'yandex', utm_campaign: 'osi' };
  for (const source of ['contact', 'express']) {
    const response = await fetch(origin + '/api/leads', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: randomUUID(),
        source,
        name: 'Тест атрибуции',
        phone: '+79990000000',
        email: '',
        consent: true,
        website: '',
        startedAt: Date.now() - 5000,
        pageUrl: location.href.split('#')[0],
        utm: attribution(),
        service: 'questionnaire',
        ...(source === 'express' ? { answers } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    assert.equal(response.status, 200, await response.text());
  }
  const leads = application.store.listLeads();
  assert.equal(leads.length, 2);
  for (const lead of leads) {
    assert.deepEqual(lead.payload.utm, expected);
    assert.equal(lead.payload.sourcePage, '/anketa-osi/');
    assert.equal(
      lead.payload.pageUrl,
      origin + '/anketa-osi/?service=questionnaire',
    );
  }
});
