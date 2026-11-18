import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATION_SYSTEM } from '../src/components/admin/ai/prompt';
import { servicePaths } from '../src/lib/routes';
import { sanitizeArticleContent } from '../server/articles/html';

test('assistant prompt permits relevant internal service links using current site paths', () => {
  assert.match(GENERATION_SYSTEM, /articleHtml содержит только[^.]*\ba\b/);
  assert.match(GENERATION_SYSTEM, /не выдумывай адреса/);
  for (const path of Object.values(servicePaths))
    assert.ok(GENERATION_SYSTEM.includes(path));
});

test('AI service links survive sanitization while dangerous URLs are removed', () => {
  const html = `<p><a href="${servicePaths.survey}">Акт обследования</a> и <a href="${servicePaths.questionnaire}">анкета</a>.</p><p><a href="javascript:alert(1)">Опасная ссылка</a></p>`;
  const clean = sanitizeArticleContent(html);
  assert.ok(clean.includes(`href="${servicePaths.survey}"`));
  assert.ok(clean.includes(`href="${servicePaths.questionnaire}"`));
  assert.doesNotMatch(clean, /javascript:/i);
});
