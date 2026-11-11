import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { runInNewContext } from 'node:vm';
import { createApplication } from '../server/application';
import { getSiteContent } from '../server/content';
import { metrikaMarkup } from '../server/metrika';
import { track } from '../src/lib/analytics';
import type { PageData } from '../src/page-data';

const counterId = '114185674';
const loaderUrl = 'https://mc.yandex.ru/metrika/tag.js?id=' + counterId;
const data: PageData = { route: 'home', content: getSiteContent() };

function browserFixture(existingLoader = false) {
  const scripts = existingLoader ? [{ src: loaderUrl, async: 1 }] : [];
  const inserted: typeof scripts = [];
  const document = {
    referrer: 'https://yandex.ru/',
    scripts,
    createElement: () => ({ src: '', async: 0 }),
    getElementsByTagName: () => [
      {
        parentNode: {
          insertBefore(script: (typeof scripts)[number]) {
            inserted.push(script);
            scripts.push(script);
          },
        },
      },
    ],
  };
  const scope: Record<string, unknown> = {
    document,
    location: new URL('https://pasport-dostupnosty.ru/?utm_source=yandex'),
    dataLayer: [{ event: 'earlier-event' }],
  };
  scope.window = scope;
  const code = metrikaMarkup(data).head.match(
    /<script\b[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(code);
  runInNewContext(code, scope, { timeout: 1000 });
  const ym = scope.ym as NonNullable<Window['ym']>;
  return { scope, ym, inserted };
}

test('the provided counter initializes before hydration with Webvisor and ecommerce without fetching external code in tests', () => {
  const { ym, inserted, scope } = browserFixture();
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].src, loaderUrl);
  assert.equal(inserted[0].async, 1);
  assert.ok(ym.l && Number.isFinite(ym.l));
  assert.deepEqual(
    JSON.parse(JSON.stringify(ym.a?.map((args) => Array.from(args)))),
    [
      [
        Number(counterId),
        'init',
        {
          ssr: true,
          webvisor: true,
          clickmap: true,
          ecommerce: 'dataLayer',
          referrer: 'https://yandex.ru/',
          url: 'https://pasport-dostupnosty.ru/?utm_source=yandex',
          accurateTrackBounce: true,
          trackLinks: true,
        },
      ],
    ],
  );
  assert.deepEqual(scope.dataLayer, [{ event: 'earlier-event' }]);
  assert.equal(browserFixture(true).inserted.length, 0);
});

test('lead and phone goals remain queued when the external library is slow or blocked', (t) => {
  const { scope, ym } = browserFixture();
  for (const key of ['window', 'location'] as const) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      value: key === 'window' ? scope : scope.location,
      configurable: true,
    });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  track('lead_submit', '/', counterId);
  track('phone_click', '/', counterId);
  const calls = JSON.parse(
    JSON.stringify(ym.a?.map((args) => Array.from(args))),
  ) as unknown[][];
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.slice(1).map((call) => call.slice(0, 3)),
    [
      [Number(counterId), 'reachGoal', 'lead_submit'],
      [Number(counterId), 'reachGoal', 'phone_click'],
    ],
  );
  assert.equal(JSON.stringify(calls).includes('email'), false);
});

test('all public routes use the same counter while private, missing and invalid configurations emit no markup', () => {
  for (const route of [
    'home',
    'survey',
    'questionnaire',
    'update',
    'legal',
    'blog',
    'article',
  ] as const) {
    const markup = metrikaMarkup({ ...data, route });
    assert.ok(markup.head.includes(loaderUrl), route);
    assert.ok(
      markup.body.includes('https://mc.yandex.ru/watch/' + counterId),
      route,
    );
  }
  for (const route of ['admin', 'not-found'] as const)
    assert.deepEqual(metrikaMarkup({ ...data, route }), { head: '', body: '' });
  for (const id of ['', '0', '-1', 'abc', '9007199254740992', '1</script>']) {
    assert.deepEqual(
      metrikaMarkup({
        ...data,
        content: {
          ...data.content,
          site: { ...data.content.site, metrikaId: id },
        },
      }),
      { head: '', body: '' },
    );
  }
});

async function applicationFixture(t: TestContext) {
  const application = await createApplication({
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    trustProxy: 0,
    adminPasswordHash: 'a'.repeat(64),
    adminSessionSecret: 'synthetic-metrika-test-session-secret',
  });
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
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return 'http://127.0.0.1:' + address.port;
}

test('public SSR contains one early bootstrap and a noscript fallback with protected contact fields', async (t) => {
  const origin = await applicationFixture(t);
  for (const path of [
    '/',
    '/blog/',
    '/privacy/',
    '/personal-data/',
    '/akt-obsledovaniya-osi/',
    '/anketa-osi/',
    '/aktualizaciya-pasporta-dostupnosti/',
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.equal(
      html.match(/\bym\s*\(\s*114185674\s*,\s*['"]init['"]/g)?.length,
      1,
      path,
    );
    assert.ok(html.indexOf(loaderUrl) < html.indexOf('</head>'), path);
    assert.match(
      html,
      /<noscript><div><img src="https:\/\/mc\.yandex\.ru\/watch\/114185674"/,
    );
    assert.ok(html.indexOf('<noscript>') > html.indexOf('</head>'), path);
    assert.doesNotMatch(html, /<!--app-metrika-(?:head|body)-->/);
    if (path === '/') {
      for (const field of ['name', 'phone', 'email', 'comment']) {
        const element = html.match(
          new RegExp(
            '<(?:input|textarea)\\b[^>]*\\bname="' + field + '"[^>]*>',
          ),
        )?.[0];
        assert.ok(element?.includes('ym-disable-keys'), field);
      }
    }
  }
});

test('admin screens and real not-found responses contain no Yandex requests or fallback pixel', async (t) => {
  const origin = await applicationFixture(t);
  for (const [path, status] of [
    ['/admin/', 200],
    ['/admin/articles/new/', 200],
    ['/missing-metrika-page/', 404],
  ] as const) {
    const response = await fetch(origin + path);
    assert.equal(response.status, status, path);
    assert.doesNotMatch(await response.text(), /mc\.yandex\.ru|ym\(114185674/);
  }
});
