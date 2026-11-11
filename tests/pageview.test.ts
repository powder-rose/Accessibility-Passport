import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { recordPageView } from '../src/lib/pageview';
import { visitLifetime, type PageView } from '../src/features/statistics/model';

function browserFixture(t: TestContext) {
  const previous = new Map(
    ['window', 'location', 'document', 'navigator'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const values = new Map<string, string>();
  const browser = {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
  };
  const document = {
    referrer: 'https://yandex.ru/search/?text=private-search-query',
  };
  const navigator = { doNotTrack: '0', globalPrivacyControl: false };
  const navigate = (url: string) =>
    Object.defineProperty(globalThis, 'location', {
      value: new URL(url),
      configurable: true,
    });
  for (const [key, value] of Object.entries({
    window: browser,
    document,
    navigator,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  navigate(
    'https://example.invalid/?utm_source=yandex&email=private@example.invalid#private',
  );
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const requests: { path: string; options: RequestInit; view: PageView }[] = [];
  const fetcher: typeof fetch = async (input, options) => {
    requests.push({
      path: String(input),
      options: options!,
      view: JSON.parse(String(options!.body)),
    });
    return new Response(null, { status: 204 });
  };
  return { browser, document, navigator, navigate, values, requests, fetcher };
}

test('browser collection sends only the page path and source, retaining a visit across page loads', (t) => {
  const app = browserFixture(t);
  recordPageView(app.fetcher);
  app.navigate('https://example.invalid/blog/?search=private#private');
  recordPageView(app.fetcher);
  assert.equal(app.requests.length, 2);
  assert.equal(app.requests[0].path, '/api/analytics/pageview');
  assert.equal(app.requests[0].view.path, '/');
  assert.equal(app.requests[0].view.referrer, 'yandex.ru');
  assert.equal(app.requests[0].view.campaign, 'yandex');
  assert.equal(app.requests[1].view.path, '/blog/');
  assert.equal(app.requests[0].view.token, app.requests[1].view.token);
  assert.notEqual(app.requests[0].view.id, app.requests[1].view.id);
  assert.equal(app.requests[0].options.credentials, 'same-origin');
  assert.equal(app.requests[0].options.keepalive, true);
  assert.equal(app.requests[0].options.referrerPolicy, 'no-referrer');
  assert.doesNotMatch(
    JSON.stringify(app.requests),
    /private|email=|search=|text=/,
  );
  assert.doesNotMatch(
    [...app.values.values()].join(),
    /private|example\.invalid|yandex/,
  );
});

test('a browser visit expires after thirty minutes of inactivity and malformed storage is ignored', (t) => {
  const app = browserFixture(t);
  let clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  recordPageView(app.fetcher);
  const first = app.requests[0].view.token;
  clock += visitLifetime - 1;
  recordPageView(app.fetcher);
  assert.equal(app.requests[1].view.token, first);
  clock += visitLifetime;
  recordPageView(app.fetcher);
  assert.notEqual(app.requests[2].view.token, first);
  const key = [...app.values.keys()][0];
  for (const stored of [
    '{broken',
    'null',
    '[]',
    '{"token":"invalid","seen":1}',
    'x'.repeat(201),
  ]) {
    app.values.set(key, stored);
    assert.doesNotThrow(() => recordPageView(app.fetcher));
  }
});

test('privacy signals disable collection and blocked storage or network never breaks a page', async (t) => {
  const app = browserFixture(t);
  app.navigator.doNotTrack = '1';
  recordPageView(app.fetcher);
  app.navigator.doNotTrack = '0';
  app.navigator.globalPrivacyControl = true;
  recordPageView(app.fetcher);
  assert.equal(app.requests.length, 0);
  assert.equal(app.values.size, 0);
  app.navigator.globalPrivacyControl = false;
  Object.defineProperty(app.browser, 'sessionStorage', {
    get() {
      throw new Error('Storage denied');
    },
  });
  assert.doesNotThrow(() => recordPageView(app.fetcher));
  assert.equal(app.requests.length, 1);
  recordPageView(async () => {
    throw new TypeError('Network denied');
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
});
