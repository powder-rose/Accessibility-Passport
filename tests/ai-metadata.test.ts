import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyArticle } from '../src/features/articles/model';
import { planAiMetadata } from '../src/components/admin/articles/ai-metadata';

test('AI suggestions preserve existing content and identify each overwritten field', () => {
  const form = {
    ...emptyArticle(),
    title: 'Прежнее название',
    slug: 'old-url',
    imageAlt: 'Старый alt',
    content: '<p>Сохранить</p>',
  };
  const original = structuredClone(form);
  const plan = planAiMetadata(
    form,
    {
      title: 'Новое название',
      slug: 'new-url',
      seoTitle: 'SEO',
      seoDescription: 'Описание',
      imageAlt: 'Новый alt',
      inlineImageAlts: [
        'Первое изображение',
        'Второе изображение',
        'Будущее изображение',
      ],
    },
    ['', 'Прежний alt'],
  );
  assert.deepEqual(form, original);
  assert.deepEqual(plan.fields, {
    title: 'Новое название',
    slug: 'new-url',
    seoTitle: 'SEO',
    seoDescription: 'Описание',
    imageAlt: 'Новый alt',
  });
  assert.deepEqual(plan.inline, [
    { index: 0, alt: 'Первое изображение' },
    { index: 1, alt: 'Второе изображение' },
  ]);
  assert.deepEqual(plan.overwrites, [
    'заголовок',
    'URL',
    'alt обложки',
    'alt изображения 2',
  ]);
});

test('AI metadata rejects invalid URLs and oversized content before applying anything', () => {
  const form = emptyArticle();
  assert.throws(
    () =>
      planAiMetadata(form, { title: 'Новая статья', slug: '../invalid' }, []),
    /URL/,
  );
  assert.throws(
    () => planAiMetadata(form, { seoDescription: 'x'.repeat(501) }, []),
    /500/,
  );
  assert.throws(
    () => planAiMetadata(form, { inlineImageAlts: ['x'.repeat(501)] }, ['']),
    /500/,
  );
  assert.throws(
    () => planAiMetadata(form, { inlineImageAlts: ['a', 'b', 'c', 'd'] }, []),
    /описания/i,
  );
  assert.equal(form.title, '');
});

test('empty or unchanged suggestions leave form fields and existing descriptions untouched', () => {
  const form = { ...emptyArticle(), title: 'Заголовок', seoTitle: 'SEO' };
  const plan = planAiMetadata(
    form,
    { title: 'Заголовок', slug: '  ', seoTitle: '', inlineImageAlts: [''] },
    ['Исходный alt'],
  );
  assert.deepEqual(plan, { fields: {}, inline: [], overwrites: [] });
});
