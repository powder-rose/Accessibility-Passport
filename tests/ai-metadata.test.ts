import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyArticle } from '../src/features/articles/model';
import { planAiMetadata } from '../src/components/admin/articles/ai-metadata';
import {
  selectAiField,
  type AiMetadataTarget,
} from '../src/components/admin/articles/ai-target';

test('selecting a single AI field preserves all other article fields', () => {
  const values = {
    title: 'Название',
    slug: 'new-url',
    imageAlt: 'Описание',
    seoTitle: 'SEO',
    seoDescription: 'Аннотация',
    category: 'Доступность',
  };
  const fields: AiMetadataTarget[] = [
    'title',
    'slug',
    'imageAlt',
    'seoTitle',
    'seoDescription',
    'category',
  ];
  for (const target of fields) {
    const suggestion = selectAiField(target, values);
    const plan = planAiMetadata(emptyArticle(), suggestion, []);
    assert.deepEqual(Object.keys(plan.fields), [target]);
    assert.equal(plan.fields[target], values[target]);
    assert.deepEqual(plan.inline, []);
  }
});

test('AI suggestions preserve existing content and identify each overwritten field', () => {
  const form = {
    ...emptyArticle(),
    title: 'Прежнее название',
    slug: 'old-url',
    imageAlt: 'Старый alt',
    category: 'Старая категория',
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
      category: 'Новая категория',
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
    category: 'Новая категория',
  });
  assert.deepEqual(plan.inline, [
    { index: 0, alt: 'Первое изображение' },
    { index: 1, alt: 'Второе изображение' },
  ]);
  assert.deepEqual(plan.overwrites, [
    'заголовок',
    'URL',
    'alt обложки',
    'категория статьи',
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
    () => planAiMetadata(form, { category: 'x'.repeat(81) }, []),
    /80/,
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
