import test from 'node:test';
import assert from 'node:assert/strict';
import {
  importSharedChat,
  normalizeSharedChatUrl,
  parseSharedChat,
} from '../server/ai/shared-chat';

const address =
  'https://chatgpt.com/share/12345678-abcd-4321-9876-1234567890ab';

// Compact indexed graph, like the server-rendered React payload, without external data.
function documentFor(value: unknown): string {
  const nodes: unknown[] = [];
  function add(input: unknown): number {
    const index = nodes.length;
    nodes.push(null);
    if (Array.isArray(input)) nodes[index] = input.map(add);
    else if (input && typeof input === 'object') {
      const object: Record<string, number> = {};
      for (const [key, value] of Object.entries(input))
        object[`_${add(key)}`] = add(value);
      nodes[index] = object;
    } else nodes[index] = input;
    return index;
  }
  add(value);
  return `<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(JSON.stringify(nodes))});</script>`;
}
function share(messages: unknown[]): string {
  return documentFor({
    loaderData: {
      route: {
        serverResponse: {
          data: { title: 'Пример', linear_conversation: messages },
        },
      },
    },
  });
}
const textMessage = (role: string, content: unknown[]) => ({
  message: {
    author: { role },
    content: { content_type: 'text', parts: content },
  },
});

test('imports only user and assistant text in order without executing page scripts', async () => {
  const html = share([
    textMessage('system', ['secret']),
    {
      message: {
        author: { role: 'assistant' },
        content: { parts: ['internal'] },
        metadata: { is_visually_hidden_from_conversation: true },
      },
    },
    {
      message: {
        author: { role: 'assistant' },
        content: { parts: ['tool call'] },
        recipient: 'python',
      },
    },
    {
      message: {
        author: { role: 'assistant' },
        channel: 'analysis',
        content: { content_type: 'text', parts: ['private analysis'] },
      },
    },
    {
      message: {
        author: { role: 'assistant' },
        content: {
          content_type: 'model_editable_context',
          parts: ['private context'],
        },
      },
    },
    {
      message: {
        author: { role: 'assistant' },
        metadata: { is_redacted: true },
        content: { content_type: 'text', parts: ['redacted content'] },
      },
    },
    textMessage('user', ['Первая тема']),
    textMessage('assistant', [
      'Ответ',
      { asset_pointer: 'https://example.test/private.png' },
    ]),
    {
      message: {
        author: { role: 'user' },
        metadata: {
          attachments: [{ name: 'Закон.pdf' }],
          file_ids: ['same-file'],
        },
        content: {
          content_type: 'multimodal_text',
          parts: ['Файл приложен', { asset_pointer: 'private-file' }],
        },
      },
    },
    textMessage('user', ['Следующий вопрос']),
  ]);
  const result = await importSharedChat(address, async (url) => {
    assert.equal(url, address);
    return html;
  });
  assert.deepEqual(result, {
    title: 'Пример',
    text: 'Пользователь:\nПервая тема\n\nАссистент:\nОтвет\n\nПользователь:\nФайл приложен\n\nПользователь:\nСледующий вопрос',
    messageCount: 4,
    omittedParts: 3,
  });
  assert.doesNotMatch(
    result.text,
    /secret|example\.test|internal|tool call|private analysis|private context|redacted content|private-file|Закон\.pdf/,
  );
});

test('only accepts a public ChatGPT share URL without parameters or redirects', () => {
  assert.equal(normalizeSharedChatUrl(address + '/'), address);
  for (const bad of [
    'http://chatgpt.com/share/12345678-abcd-4321-9876-1234567890ab',
    'https://chatgpt.com.evil.test/share/12345678-abcd-4321-9876-1234567890ab',
    'https://chatgpt.com@127.0.0.1/share/12345678-abcd-4321-9876-1234567890ab',
    'https://chatgpt.com:444/share/12345678-abcd-4321-9876-1234567890ab',
    address + '?token=secret',
    address + '#part',
    'https://chatgpt.com/c/12345678-abcd-4321-9876-1234567890ab',
    'https://chatgpt.com/share/not-a-uuid',
  ])
    assert.throws(() => normalizeSharedChatUrl(bad));
});

test('rejects private, missing, oversized and malformed content without treating HTML as a chat', () => {
  assert.throws(
    () => parseSharedChat('<title>Check out this chat</title>'),
    /не удалось прочитать/i,
  );
  assert.throws(
    () => parseSharedChat(share([textMessage('user', ['x'.repeat(500001)])])),
    /превышает/,
  );
  assert.throws(
    () =>
      parseSharedChat(
        '<script>window.__reactRouterContext.streamController.enqueue("not-json");</script>',
      ),
    /не удалось прочитать/i,
  );
  assert.throws(
    () => parseSharedChat(share([textMessage('tool', ['tool only'])])),
    /не удалось прочитать/i,
  );
  assert.throws(() => parseSharedChat(share([])), /не удалось прочитать/i);
});
