import test from 'node:test';
import assert from 'node:assert/strict';
import {
  equalBase,
  revisionBase,
} from '../src/components/admin/ai/recovery-store';
import {
  canApplyImage,
  listImageJobs,
  readImageJob,
  startImageJob,
} from '../src/components/admin/ai/image-request';
import { buildPrompt, selectExamples } from '../src/components/admin/ai/prompt';
import {
  emptyDraft,
  readDraft,
  writeDraft,
} from '../src/components/admin/ai/draft-store';

test('examples are selected by topic and legal sources are not silently cut', () => {
  const draft = emptyDraft();
  draft.topic = 'Пандусы доступного здания';
  draft.examples = [
    {
      id: '1',
      name: 'Образец.docx',
      text: 'Случайный текст.\n\nПандусы доступны посетителям и требуют осмотра.',
      emptyPages: 0,
    },
  ];
  draft.documents = [
    { id: '2', name: 'Закон.txt', text: 'Закон полностью.', emptyPages: 0 },
  ];
  assert.match(selectExamples(draft.examples, draft.topic), /Пандусы/);
  assert.match(buildPrompt(draft, '', false), /Закон полностью/);
  draft.documents[0].text = 'п'.repeat(120001);
  assert.throws(() => buildPrompt(draft, '', false), /не помещаются/);
});

test('materials and photos use independent revisions and do not send photos with text', async () => {
  const old = globalThis.fetch;
  const sent: Array<{ path: string; body: Record<string, unknown> }> = [];
  try {
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const path = String(input);
      if (!init?.method || init.method === 'GET') {
        return Response.json(
          path.endsWith('/materials')
            ? { revision: null, value: null }
            : { revision: null, dataUrl: null },
        );
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      sent.push({ path, body });
      return Response.json({ revision: 1 });
    }) as typeof fetch;
    const { value, revision } = await readDraft();
    value.topic = 'Тестовая тема';
    value.photos[0] = 'data:image/png;base64,dGVzdA==';
    await writeDraft(value, revision);
    assert.equal(sent.length, 2);
    assert.equal(sent[0].path, '/api/admin/ai/materials');
    assert.equal(sent[1].path, '/api/admin/ai/photo1');
    assert.equal(Object.hasOwn(sent[0].body.value as object, 'photos'), false);
    assert.equal(revision.materials, 1);
    assert.equal(revision.photo1, 1);
    await writeDraft(value, revision);
    assert.equal(sent.length, 2);
    value.sources = 'Я'.repeat(1_000_001);
    await assert.rejects(() => writeDraft(value, revision), /1 миллион/);
    assert.equal(sent.length, 2);
  } finally {
    globalThis.fetch = old;
  }
});

test('recovery compares each independent server revision', () => {
  const original = {
    materials: 1,
    photo1: 2,
    photo2: null,
    savedMaterials: '',
    savedPhotos: ['', ''] as [string, string],
  };
  assert.equal(
    equalBase(revisionBase(original), {
      materials: 1,
      photo1: 2,
      photo2: null,
    }),
    true,
  );
  assert.equal(
    equalBase(revisionBase(original), {
      materials: 1,
      photo1: 3,
      photo2: null,
    }),
    false,
  );
});

test('an image creates one identified job and only reads thereafter', async () => {
  const old = globalThis.fetch;
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  try {
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const method = init?.method || 'GET';
      const url = String(input);
      calls.push({
        method,
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (url.endsWith('/image-jobs'))
        return Response.json({ jobs: [{ id: 'job-id', status: 'running' }] });
      return Response.json(
        { id: 'job-id', status: 'running' },
        { status: method === 'POST' ? 202 : 200 },
      );
    }) as typeof fetch;
    await startImageJob('job-id', 'prompt', ['photo-a', 'photo-b']);
    await readImageJob('job-id');
    await listImageJobs();
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
    assert.deepEqual(calls[0].body, {
      requestId: 'job-id',
      prompt: 'prompt',
      referenceDataUrls: ['photo-a', 'photo-b'],
    });
  } finally {
    globalThis.fetch = old;
  }
});

test('a previous image cannot be applied to an unknown, failed or expired job', () => {
  const dataUrl = 'data:image/png;base64,dGVzdA==';
  assert.equal(
    canApplyImage(dataUrl, { id: '1', status: 'succeeded', dataUrl }),
    true,
  );
  for (const status of ['running', 'unknown', 'failed', 'expired'] as const) {
    assert.equal(canApplyImage(dataUrl, { id: '2', status }), false);
  }
  assert.equal(
    canApplyImage(dataUrl, { id: '3', status: 'succeeded', dataUrl: 'other' }),
    false,
  );
});
