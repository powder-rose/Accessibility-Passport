import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApplication } from '../server/application';
import { Consent } from '../src/components/forms/ContactFields';
import documents from '../src/content/legal.json';
import { publishedHref } from '../src/lib/routes';

async function fixture(t: TestContext) {
  const application = await createApplication({
    production: true,
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    trustProxy: 0,
    adminPasswordHash: 'd'.repeat(64),
    adminSessionSecret: 'synthetic-legal-page-test-session-secret',
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

test('legal documents identify the accessibility site and actual operator without claiming an on-site payment integration', () => {
  assert.deepEqual(Object.keys(documents).sort(), [
    'oferta',
    'personal-data',
    'privacy',
  ]);
  for (const document of Object.values(documents)) {
    const text = document.lines.join('\n');
    assert.ok(text.includes('https://pasport-dostupnosty.ru'));
    assert.ok(text.includes('5027310150'));
    assert.ok(text.includes('1225000108618'));
    assert.ok(text.includes('mail@pasport-bezopasnosty.ru'));
    assert.doesNotMatch(
      text,
      /https:\/\/pasport-bezopasnosty\.ru|CloudPayments|CloudKassir/,
    );
  }
  const privacy = documents.privacy.lines.join('\n');
  assert.match(privacy, /114185674/);
  assert.match(privacy, /Вебвизор/);
  assert.match(privacy, /osi-cookie-notice-v1/);
  assert.match(privacy, /не являются переключателями аналитики/);
  const offer = documents.oferta.lines.join('\n');
  assert.match(offer, /акта обследования ОСИ/);
  assert.match(offer, /анкеты ОСИ/);
  assert.match(offer, /актуализации паспорта/);
  assert.doesNotMatch(
    offer,
    /пожарная безопасность|план эвакуации|воинский учет/,
  );
});

test('all three legal documents are readable in SSR, have canonical redirects and remain outside the public sitemap', async (t) => {
  const origin = await fixture(t);
  for (const [slug, document] of Object.entries(documents)) {
    const path = '/' + slug + '/';
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.ok(html.includes('<h1>' + document.title + '</h1>'));
    assert.ok(html.includes(document.lines.at(-1)!));
    assert.ok(
      html.includes(
        '<link rel="canonical" href="https://pasport-dostupnosty.ru' +
          path +
          '">',
      ),
    );
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.ok(html.includes('href="/oferta/"'));
    assert.ok(html.includes('href="/privacy/"'));
    assert.ok(html.includes('href="/personal-data/"'));
    assert.equal(publishedHref(path), path);
    const redirect = await fetch(
      origin + '/' + slug + '?utm_source=legal-check',
      { redirect: 'manual' },
    );
    assert.equal(redirect.status, 308);
    assert.equal(
      redirect.headers.get('location'),
      path + '?utm_source=legal-check',
    );
  }
  const sitemap = await (await fetch(origin + '/sitemap.xml')).text();
  assert.doesNotMatch(sitemap, /\/oferta\/|\/privacy\/|\/personal-data\//);
});

test('form consent is a separate unchecked required choice and policy information is outside its label', () => {
  const html = renderToStaticMarkup(
    createElement(Consent, { prefix: 'legal-test' }),
  );
  const label = html.match(/<label\b[\s\S]*?<\/label>/)?.[0];
  assert.ok(label);
  assert.match(label, /type="checkbox"/);
  assert.match(label, /required=""/);
  assert.doesNotMatch(label, /checked|href="\/privacy\/"|принимаю/);
  assert.ok(label.includes('href="/personal-data/"'));
  assert.ok(html.indexOf('href="/privacy/"') > html.indexOf('</label>'));
  assert.match(
    documents['personal-data'].lines.join('\n'),
    /не разрешает.*рекламные рассылки/,
  );
});
