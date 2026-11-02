import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify } from '../src/lib/classify.ts';
import { contentSchema } from '../src/lib/content-schema.ts';
const content = JSON.parse(readFileSync(new URL('../src/content/home.json', import.meta.url)));
test('approved content validates and has all 17 sections', () => {
  assert.equal(contentSchema.safeParse(content).success, true);
  assert.equal(Object.keys(content.sections).length, 17);
  assert.equal(content.sections['16'].items.length, 13);
});
test('document intent takes priority over existing passport', () => {
  const result = classify({ existingPassport: ['update'], documentation: ['passport'] });
  assert.equal(result.type, 'Разработка отдельного документа.');
  assert.equal(result.clarification, true);
});
test('update selected explicitly has priority', () => {
  assert.equal(
    classify({ existingPassport: ['first'], documentation: ['update'] }).type,
    'Актуализация документации ОСИ.',
  );
});
test('document bundle never adds approval support', () => {
  const result = classify({ existingPassport: ['first'], documentation: ['documents'] });
  assert.equal(result.type, 'Полный комплекс документации.');
  assert.equal(result.includesApprovalSupport, false);
});
test('uncertain intent is routed to consultation', () => {
  assert.equal(
    classify({ existingPassport: ['exists'], documentation: ['consultation'] }).type,
    'Определение необходимого состава документации.',
  );
});
test('question reordering preserves valid configuration', () => {
  const c = structuredClone(content);
  c.quiz.questions.reverse();
  assert.equal(contentSchema.safeParse(c).success, true);
});
test('source configuration supports multiple document selection', () => {
  const c = structuredClone(content);
  c.quiz.questions.find((x) => x.id === 'documentation').multiple = true;
  assert.equal(contentSchema.safeParse(c).success, true);
});
test('unsafe links, duplicate IDs and missing core questions are rejected', () => {
  const c = structuredClone(content);
  c.sections['7'].items[0].url = 'javascript:alert(1)';
  assert.equal(contentSchema.safeParse(c).success, false);
  const q = structuredClone(content);
  q.quiz.questions[0].options[1].id = q.quiz.questions[0].options[0].id;
  assert.equal(contentSchema.safeParse(q).success, false);
  q.quiz.questions[0].id = 'replaced';
  assert.equal(contentSchema.safeParse(q).success, false);
});
test('commercial prices are the approved fixed prices and package floor', () => {
  assert.deepEqual(
    content.services.map((x) => [x.price, x.from]),
    [
      [12500, false],
      [12500, false],
      [12500, false],
      [12500, false],
      [45000, true],
    ],
  );
});
