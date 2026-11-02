import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { routes, publishedHref } from '../src/lib/routes';
import { documentationForService, serviceFromAnswers } from '../src/lib/service-intent';
import { getSurveyContent } from '../server/service-content';
import { getSiteContent } from '../server/content';
import { createPageData } from '../server/page-data';
import { buildHead } from '../server/seo';

const source = JSON.parse(
  readFileSync(new URL('../src/content/survey.json', import.meta.url), 'utf8'),
);
const content = getSiteContent();
const page = getSurveyContent(content);
const directory = mkdtempSync(join(tmpdir(), 'passport-survey-test-'));
const password = 'survey-page-integration-password';
let child: ChildProcess;
let origin: string;
let cookie: string;
let output = '';

before(async () => {
  child = spawn(process.execPath, ['dist/server/index.js', '--production'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: '0',
      HOST: '127.0.0.1',
      APP_ORIGIN: 'http://127.0.0.1',
      DATABASE_PATH: join(directory, 'site.sqlite'),
      TRUST_PROXY: '0',
      ADMIN_PASSWORD_SHA256: createHash('sha256').update(password).digest('hex'),
      ADMIN_SESSION_SECRET: 'survey-page-test-secret-at-least-32-characters',
    },
  });
  child.stdout!.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr!.on('data', (chunk) => {
    output += chunk.toString();
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    origin = output.match(/Server ready at (http:\/\/127\.0\.0\.1:\d+)/)?.[1] || '';
    if (origin) break;
    if (child.exitCode !== null) throw new Error(output);
    await delay(100);
  }
  assert.ok(origin, output);
  // The fixture's request origin is configured separately from the ephemeral listen port.
  const response = await request('/api/admin/login', {
    method: 'POST',
    headers: { Origin: 'http://127.0.0.1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie')!.split(';')[0];
});
after(async () => {
  if (child?.exitCode === null) {
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGTERM');
    await exited;
  }
  rmSync(directory, { recursive: true, force: true });
});
function request(path: string, options: RequestInit = {}) {
  return fetch(origin + path, { ...options, signal: AbortSignal.timeout(8000) });
}
function normalized(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}
function visibleText(html: string) {
  return normalized(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&amp;/g, '&'),
  );
}
function schemaFrom(html: string) {
  return JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
}

test('survey service has the complete approved structure and approved price', () => {
  assert.equal(page.path, '/akt-obsledovaniya-osi/');
  assert.equal(source.hero.title, 'Акт обследования объекта социальной инфраструктуры (ОСИ)');
  assert.equal(page.advantages.length, 3);
  assert.equal(page.sections['4'].items!.length, 8);
  assert.equal(page.sections['5'].items!.length, 4);
  assert.equal(page.sections['6'].items!.length, 6);
  assert.equal(page.sections['7'].items!.length, 9);
  assert.equal(page.sections['10'].benefits!.length, 13);
  assert.deepEqual(
    page.sections['10'].groups!.flatMap((group) => group.indices).sort((a, b) => a - b),
    Array.from({ length: 13 }, (_, index) => index),
    'Source-data groups must include each approved item exactly once.',
  );
  assert.equal(page.sections['11'].items!.length, 9);
  assert.equal(page.sections['16'].items!.length, 14);
  assert.equal(content.services.find((service) => service.id === 'survey')!.price, 12500);
  assert.ok(page.sections['6'].note!.includes('организуются заказчиком'));
  assert.ok(page.sections['7'].note!.includes('не входят выездное обследование'));
});

test('survey production HTML contains every specialised heading, paragraph and FAQ without script execution', async () => {
  const response = await request(routes.survey);
  assert.equal(response.status, 200);
  const html = await response.text();
  const text = visibleText(html);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.ok(text.includes(normalized(page.hero.title)));
  let previous = -1;
  for (let n = 3; n <= 17; n++) {
    const section = page.sections[String(n)];
    const offset = text.indexOf(normalized(section.title));
    assert.ok(offset > previous, 'Wrong section order: ' + n);
    previous = offset;
    for (const paragraph of section.paragraphs || [])
      assert.ok(text.includes(normalized(paragraph)));
    for (const item of section.items || []) {
      assert.ok(text.includes(normalized(item.title)));
      if (item.text) assert.ok(text.includes(normalized(item.text)));
    }
    if (section.note) assert.ok(text.includes(normalized(section.note)));
    for (const detail of [
      ...(section.benefits || []),
      ...(section.flow || []),
      section.description,
      section.noteTitle,
      section.noteText,
      section.priceNote,
    ]) {
      if (detail) assert.ok(text.includes(normalized(detail)), 'Missing SSR copy: ' + detail);
    }
  }
  assert.equal((html.match(/class="quiz-panel"/g) || []).length, 1);
  assert.equal((html.match(/class="faq-item"/g) || []).length, 14);
  assert.ok(!text.includes('акт категорирования'));
  assert.ok(!text.includes('Быть полностью редактируемой'));
});

test('survey metadata, breadcrumb schema, canonical route and sitemap are independent of the home SEO cluster', async () => {
  const html = await (await request(routes.survey + '?utm_source=test')).text();
  assert.ok(
    normalized(html).includes(
      normalized('Акт обследования ОСИ — разработка за 12 500 ₽ | БОЙКОВГРУПП'),
    ),
  );
  assert.ok(
    html.includes(
      '<link rel="canonical" href="https://pasport-dostupnosty.ru/akt-obsledovaniya-osi/">',
    ),
  );
  assert.match(html, /name="robots" content="index, follow"/);
  const schema = schemaFrom(html);
  assert.equal(
    schema['@graph'].filter((item: { '@type': string }) => item['@type'] === 'Service').length,
    1,
  );
  assert.equal(
    schema['@graph'].find((item: { '@type': string }) => item['@type'] === 'Service').offers.price,
    12500,
  );
  assert.equal(
    schema['@graph'].find((item: { '@type': string }) => item['@type'] === 'FAQPage').mainEntity
      .length,
    14,
  );
  const breadcrumbs = schema['@graph'].find(
    (item: { '@type': string }) => item['@type'] === 'BreadcrumbList',
  );
  assert.equal(breadcrumbs.itemListElement[1].item, content.site.domain + routes.survey);
  const sitemap = await (await request('/sitemap.xml')).text();
  assert.equal((sitemap.match(/<url>/g) || []).length, 2);
  assert.ok(sitemap.includes(content.site.domain + routes.survey));
  const redirect = await request('/akt-obsledovaniya-osi?utm_source=test', { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), routes.survey + '?utm_source=test');
});

test('survey links lead only to published pages or live local actions; the main service links back', async () => {
  const html = await (await request(routes.survey)).text();
  const links = Array.from(html.matchAll(/href="([^"]+)"/g), (match) => match[1]);
  const allowed = new Set(['/', routes.survey, '/privacy/', '/personal-data/']);
  for (const href of links) {
    if (
      !href.startsWith('/') ||
      href.startsWith('/assets/') ||
      href.startsWith('/images/') ||
      href.startsWith('/fonts/') ||
      href === '/favicon.svg'
    )
      continue;
    const path = new URL(href, 'https://example.invalid').pathname;
    assert.ok(allowed.has(path), 'Unpublished link: ' + href);
  }
  assert.ok(!links.some((href) => /\.docx?$|\.pdf$|\/blog\//.test(href)));
  const home = await (await request('/')).text();
  assert.ok(home.includes('href="' + routes.survey + '"'));
  assert.equal(publishedHref('/unpublished-industry/'), undefined);
});

test('one service catalog resolves prices in page copy, SEO, FAQ and service schema', () => {
  const changed = structuredClone(content);
  changed.services.find((service) => service.id === 'survey')!.price = 14700;
  const changedPage = getSurveyContent(changed);
  assert.ok(normalized(changedPage.seo.title).includes('14 700'));
  assert.ok(normalized(changedPage.sections['16'].items![5].text!).includes('14 700'));
  assert.ok(!changedPage.sections['13'].note!.includes('Каждый из трёх'));
  const data = createPageData(new URL('https://example.invalid' + routes.survey), changed).data;
  const head = buildHead(data, routes.survey);
  assert.equal(
    schemaFrom(head)['@graph'].find((item: { '@type': string }) => item['@type'] === 'Service')
      .offers.price,
    14700,
  );
  assert.ok(!JSON.stringify(changedPage).includes('{{price:'));
});

test('the shared quiz preselects the survey and permits a changed service without another quiz copy', () => {
  const data = createPageData(new URL('https://example.invalid' + routes.survey), content).data;
  assert.equal(data.service, 'survey');
  assert.equal(documentationForService(data.service), 'survey');
  const changed = createPageData(
    new URL(
      'https://example.invalid' + routes.survey + '?service=questionnaire&object_type=health',
    ),
    content,
  ).data;
  assert.equal(changed.service, 'questionnaire');
  assert.equal(changed.objectType, 'health');
  assert.equal(serviceFromAnswers(['survey']), 'survey');
  assert.equal(serviceFromAnswers(['questionnaire']), 'questionnaire');
  assert.equal(serviceFromAnswers(['consultation']), undefined);
});

test('survey and changed-service leads retain page, UTM, object and selected service', async () => {
  const headers = { Origin: 'http://127.0.0.1', 'Content-Type': 'application/json' };
  const base = {
    requestId: randomUUID(),
    source: 'contact',
    name: 'Проверка страницы акта',
    phone: '+79990000000',
    email: '',
    consent: true,
    website: '',
    startedAt: Date.now() - 5000,
    pageUrl: 'http://127.0.0.1' + routes.survey + '?utm_source=survey-test',
    utm: { utm_source: 'survey-test' },
    service: 'survey',
    objectType: 'health',
  };
  assert.equal(
    (await request('/api/leads', { method: 'POST', headers, body: JSON.stringify(base) })).status,
    200,
  );
  const answers = Object.fromEntries(content.quiz.questions.map((q) => [q.id, [q.options[0].id]]));
  answers.documentation = ['questionnaire'];
  const express = {
    ...base,
    requestId: randomUUID(),
    source: 'express',
    service: 'survey',
    answers,
  };
  assert.equal(
    (await request('/api/leads', { method: 'POST', headers, body: JSON.stringify(express) }))
      .status,
    200,
  );
  const result = await (await request('/api/admin/leads', { headers: { Cookie: cookie } })).json();
  const act = result.leads.find((lead: { id: string }) => lead.id === base.requestId).payload;
  assert.equal(act.service, 'survey');
  assert.equal(act.sourcePage, routes.survey);
  assert.equal(act.initialService, 'survey');
  assert.equal(act.objectType, 'health');
  assert.equal(act.utm.utm_source, 'survey-test');
  const changed = result.leads.find(
    (lead: { id: string }) => lead.id === express.requestId,
  ).payload;
  assert.equal(changed.service, 'questionnaire');
  assert.equal(changed.initialService, 'survey');
  assert.equal(changed.questions.length, 5);
  assert.equal(changed.serviceTitle, 'Разработка анкеты ОСИ');
});
