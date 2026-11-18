import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyArticle } from '../src/features/articles/model';
import { planAiAutofill } from '../src/components/admin/articles/ai-autofill';
import {
  chooseImagePrompt,
  defaultImagePrompt,
  nextImageScene,
} from '../src/components/admin/ai/image-prompt';
import { ensureCurrentDraft } from '../src/components/admin/ai/fresh-draft';
import {
  emptyDraft,
  type DraftRevision,
} from '../src/components/admin/ai/draft-store';

test('auto-fill keeps existing fields and does not attach an alt to a missing cover', () => {
  const form = {
    ...emptyArticle(),
    title: 'Ручной заголовок',
    seoTitle: 'Ручной SEO',
    content: '<p>Своя статья</p>',
  };
  const before = structuredClone(form);
  const plan = planAiAutofill(
    form,
    {
      title: 'ИИ заголовок',
      slug: 'accessible-entrance',
      category: 'Доступность',
      seoTitle: 'ИИ SEO',
      seoDescription: 'Описание',
      imageAlt: 'Николай осматривает вход',
    },
    '<p>Новый текст</p>',
    true,
    true,
  );
  assert.deepEqual(form, before);
  assert.deepEqual(plan.changes, {
    slug: 'accessible-entrance',
    category: 'Доступность',
    seoDescription: 'Описание',
  });
  assert.ok(plan.preserved.includes('заголовок'));
  assert.ok(plan.preserved.includes('текст статьи'));
  assert.match(plan.review.join(' '), /alt обложки/);
  assert.equal(plan.textApplied, false);
});

test('auto-fill fills an empty text and existing cover alt without changing status', () => {
  const form = {
    ...emptyArticle(),
    image: '/media/articles/example.webp',
    status: 'published' as const,
  };
  const plan = planAiAutofill(
    form,
    { title: 'Тема', imageAlt: 'Вход в здание' },
    '<p>Статья</p>',
    false,
    true,
  );
  assert.deepEqual(plan.changes, {
    title: 'Тема',
    imageAlt: 'Вход в здание',
    content: '<p>Статья</p>',
  });
  assert.equal(plan.textApplied, true);
  assert.ok(!('status' in plan.changes));
});

test('image prompt is constructed only when there is an article theme or title', () => {
  assert.equal(defaultImagePrompt(' ', ''), '');
  assert.match(defaultImagePrompt('', 'Доступный вход'), /Доступный вход/);
  assert.match(defaultImagePrompt('Пандус', 'Название'), /Николай/);
  assert.match(defaultImagePrompt('Пандус', 'Название'), /статьи «Название»/);
  assert.match(
    defaultImagePrompt('Пандус', 'Название'),
    /Контекст кластера: Пандус/,
  );
  assert.match(defaultImagePrompt('Пандус', ''), /статьи «Пандус»/);
  assert.doesNotMatch(
    defaultImagePrompt('Пандус', 'Пандус'),
    /Контекст кластера/,
  );
});

test('automatic scenes change for subsequent illustrations while manual prompts are preserved', () => {
  const alts = ['Пандус', 'Дверь', 'План'];
  const firstScene = nextImageScene('inline', 0, 'Обложка', alts, []);
  const secondScene = nextImageScene('inline', 1, 'Обложка', alts, []);
  const first = chooseImagePrompt('', null, 'Доступность', 'Вход', firstScene);
  const next = chooseImagePrompt(
    first.prompt,
    first.automatic,
    'Доступность',
    'Вход',
    secondScene,
  );
  assert.match(first.prompt, /Сюжет этой иллюстрации: Пандус/);
  assert.match(next.prompt, /Сюжет этой иллюстрации: Дверь/);
  assert.notEqual(first.prompt, next.prompt);
  const manual = chooseImagePrompt(
    'Ручной сюжет Николая',
    null,
    'Доступность',
    'Вход',
    secondScene,
  );
  assert.equal(manual.prompt, 'Ручной сюжет Николая');
  assert.equal(manual.automatic, null);
  assert.equal(
    nextImageScene('inline', 1, '', [], ['Вход', 'Пандус', 'Дверь']),
    'Пандус',
  );
  assert.equal(
    nextImageScene('cover', 0, 'Николай у входа', alts, []),
    'Николай у входа',
  );
});

test('changed materials or either photo stop a request before transmission', async () => {
  const expected: DraftRevision = {
    materials: 1,
    photo1: 2,
    photo2: 3,
    savedMaterials: '',
    savedPhotos: ['', ''],
  };
  for (const key of ['materials', 'photo1', 'photo2'] as const) {
    const newer = { ...expected, [key]: (expected[key] || 0) + 1 };
    await assert.rejects(
      () =>
        ensureCurrentDraft(expected, async () => ({
          revision: newer,
          value: emptyDraft(),
        })),
      /Запрос не отправлен/,
    );
  }
  await ensureCurrentDraft(expected, async () => ({
    revision: { ...expected },
    value: emptyDraft(),
  }));
});
