import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combineThreePart,
  continueThreePart,
  loadThreePart,
  promptForPart,
  saveThreePart,
} from '../src/components/admin/ai/three-part.ts';

function storage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}
function part(n) {
  const html = `<h2>Раздел ${n}</h2><p>Текст ${n}</p>`;
  return {
    text: html,
    safeHtml: html,
    metadata: {
      title: 'Название',
      slug: 'name',
      category: 'Категория',
      seoTitle: 'SEO',
      seoDescription: 'Описание',
      clusterTopic: 'Тема',
      imageAlt: 'Обложка',
      inlineImageAlts: ['а', 'б', 'в'],
    },
  };
}
function initial() {
  return {
    version: 1,
    id: 'id',
    scope: '/new',
    prompt: 'Полный SEO-план',
    parts: [],
    state: 'ready',
  };
}

test('makes three sequential requests using the full plan and earlier blocks, then combines in order', async () => {
  const local = storage();
  const prompts = [];
  const states = [];
  const completed = await continueThreePart(
    initial(),
    local,
    async (prompt) => {
      prompts.push(prompt);
      return part(prompts.length);
    },
    (state) => states.push(state),
  );
  assert.equal(prompts.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.match(prompts[i], /Полный SEO-план/);
    assert.match(prompts[i], new RegExp(`БЛОК ${i + 1} ИЗ 3`));
  }
  assert.match(prompts[2], /Раздел 1/);
  assert.match(prompts[2], /Раздел 2/);
  assert.equal(
    combineThreePart(completed).safeHtml,
    [1, 2, 3].map((n) => part(n).safeHtml).join('\n'),
  );
  assert.equal(loadThreePart(local, '/new').state, 'complete');
  assert.deepEqual(
    states.map((s) => [s.state, s.parts.length]),
    [
      ['sending', 0],
      ['ready', 1],
      ['sending', 1],
      ['ready', 2],
      ['sending', 2],
      ['complete', 3],
    ],
  );
});

test('network failure preserves the first block and does not retry without explicit consent', async () => {
  const local = storage();
  let calls = 0;
  await assert.rejects(
    continueThreePart(
      initial(),
      local,
      async () => {
        calls++;
        if (calls === 2) throw new Error('disconnected');
        return part(calls);
      },
      () => {},
    ),
    /disconnected/,
  );
  const saved = loadThreePart(local, '/new');
  assert.equal(saved.state, 'sending');
  assert.equal(saved.parts.length, 1);
  await assert.rejects(
    continueThreePart(
      saved,
      local,
      async () => {
        calls++;
        return part(calls);
      },
      () => {},
    ),
    /неизвестен/,
  );
  assert.equal(calls, 2);
  let n = 1;
  const finished = await continueThreePart(
    saved,
    local,
    async () => part(++n),
    () => {},
    true,
  );
  assert.equal(finished.parts.length, 3);
});

test('does not send if saving the request checkpoint fails', async () => {
  let calls = 0;
  const local = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
  };
  await assert.rejects(
    continueThreePart(
      initial(),
      local,
      async () => {
        calls++;
        return part(1);
      },
      () => {},
    ),
    /quota/,
  );
  assert.equal(calls, 0);
});

test('keeps a received block in memory if browser storage becomes full', async () => {
  let writes = 0;
  let shown;
  const local = {
    getItem: () => null,
    setItem: () => {
      if (++writes === 2) throw new Error('quota');
    },
  };
  await assert.rejects(
    continueThreePart(
      initial(),
      local,
      async () => part(1),
      (value) => {
        shown = value;
      },
    ),
    /quota/,
  );
  assert.equal(shown.parts.length, 1);
});

test('rejects an identical block and corrupt checkpoints', async () => {
  const local = storage();
  await assert.rejects(
    continueThreePart(
      initial(),
      local,
      async () => part(1),
      () => {},
    ),
    /повторила/,
  );
  assert.equal(loadThreePart(local, '/new').parts.length, 1);
  saveThreePart(local, { ...initial(), state: 'complete' });
  assert.throws(() => loadThreePart(local, '/new'));
});

test('never sends oversized material and refuses premature combination', () => {
  assert.throws(
    () => promptForPart({ ...initial(), prompt: 'а'.repeat(120000) }),
    /не помещаются/,
  );
  assert.throws(() => combineThreePart(initial()));
});

test('an existing first block is preserved and only the remaining two are requested', async () => {
  const local = storage();
  const original = part(1);
  original.metadata.title = '';
  const seeded = { ...initial(), parts: [original], seeded: true };
  let calls = 0;
  const done = await continueThreePart(
    seeded,
    local,
    async (prompt) => {
      calls++;
      assert.match(prompt, /Раздел 1/);
      return part(calls + 1);
    },
    () => {},
  );
  assert.equal(calls, 2);
  assert.equal(combineThreePart(done).metadata.title, 'Название');
  assert.ok(combineThreePart(done).safeHtml.startsWith(original.safeHtml));
});
