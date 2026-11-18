import dns from 'node:dns/promises';
import https from 'node:https';
import { publicAddress } from './gateway';

const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_GRAPH_NODES = 200_000;
const MAX_MESSAGES = 2_000;
const MAX_TEXT_LENGTH = 500_000;
const TIMEOUT_MS = 20_000;
const INVALID =
  'Не удалось прочитать чат. Ссылка может быть закрыта, устарела или сервис изменил формат. Можно вставить текст вручную.';

export type ShareTransport = (url: string) => Promise<string>;
export type SharedChat = {
  title: string;
  text: string;
  messageCount: number;
  omittedParts: number;
};

export function normalizeSharedChatUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200)
    throw new Error('Укажите публичную ссылку на чат ChatGPT.');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Укажите корректную ссылку на чат ChatGPT.');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'chatgpt.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/share\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(
      url.pathname,
    )
  )
    throw new Error(
      'Поддерживаются только публичные ссылки https://chatgpt.com/share/... без параметров.',
    );
  return `https://chatgpt.com${url.pathname.replace(/\/$/, '')}`;
}

// Resolve and pin the exact public address. Never send cookies, keys or follow redirects.
export const pinnedSharedChatTransport: ShareTransport = async (rawUrl) => {
  const url = new URL(normalizeSharedChatUrl(rawUrl));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const addresses = await Promise.race([
      dns.lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          'abort',
          () => reject(new Error('timeout')),
          { once: true },
        ),
      ),
    ]);
    if (
      !addresses.length ||
      addresses.some(({ address }) => !publicAddress(address))
    )
      throw new Error('unsafe address');
    const address = addresses[0];
    return await new Promise<string>((resolve, reject) => {
      const request = https.request(
        url,
        {
          method: 'GET',
          servername: 'chatgpt.com',
          family: address.family,
          lookup: (_host, _options, callback) =>
            callback(null, address.address, address.family),
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'ru,en;q=0.8',
            Connection: 'close',
          },
        },
        (response) => {
          if (
            response.statusCode !== 200 ||
            !/^text\/html(?:;|$)/i.test(response.headers['content-type'] || '')
          ) {
            response.resume();
            reject(new Error('unsupported response'));
            return;
          }
          let total = 0;
          const pieces: Buffer[] = [];
          response.on('data', (piece: Buffer) => {
            total += piece.length;
            if (total > MAX_PAGE_BYTES) {
              request.destroy(new Error('oversize'));
              return;
            }
            pieces.push(piece);
          });
          response.on('error', reject);
          response.on('end', () =>
            resolve(Buffer.concat(pieces).toString('utf8')),
          );
        },
      );
      request.on('error', reject);
      request.end();
    });
  } catch {
    throw new Error(INVALID);
  } finally {
    clearTimeout(timer);
  }
};

// ChatGPT currently embeds a compact indexed React Router payload in the page.
// Inspect only known fields and text parts; never execute page scripts or evaluate HTML.
export function parseSharedChat(html: string): SharedChat {
  if (Buffer.byteLength(html, 'utf8') > MAX_PAGE_BYTES)
    throw new Error(
      'Чат слишком большой для загрузки. Вставьте нужные фрагменты вручную.',
    );
  const chunks =
    /window\.__reactRouterContext\.streamController\.enqueue\(("(?:\\.|[^"\\])*")\);/gs;
  let match: RegExpExecArray | null;
  let nodes: unknown[] | undefined;
  while ((match = chunks.exec(html))) {
    try {
      const content: unknown = JSON.parse(JSON.parse(match[1]) as string);
      if (
        Array.isArray(content) &&
        content.length &&
        content.length <= MAX_GRAPH_NODES
      ) {
        nodes = content;
        break;
      }
    } catch {
      /* Other stream chunks are not conversation payloads. */
    }
  }
  if (!nodes) throw new Error(INVALID);
  const graph = nodes;
  function dereference(value: unknown): unknown {
    if (typeof value !== 'number') return value;
    return Number.isSafeInteger(value) && value >= 0 && value < graph.length
      ? graph[value]
      : undefined;
  }
  function entries(value: unknown): Array<[string, unknown]> {
    const object = dereference(value);
    if (!object || typeof object !== 'object' || Array.isArray(object))
      return [];
    const result: Array<[string, unknown]> = [];
    for (const [raw, entry] of Object.entries(object)) {
      const index = /^_(\d+)$/.exec(raw);
      const name = index ? dereference(Number(index[1])) : raw;
      if (typeof name === 'string') result.push([name, dereference(entry)]);
    }
    return result;
  }
  function field(value: unknown, name: string): unknown {
    return entries(value).find(([key]) => key === name)?.[1];
  }
  const loader = field(graph[0], 'loaderData');
  let conversation: unknown;
  for (const [, route] of entries(loader)) {
    const candidate = field(field(route, 'serverResponse'), 'data');
    if (Array.isArray(field(candidate, 'linear_conversation'))) {
      conversation = candidate;
      break;
    }
  }
  const rawMessages = field(conversation, 'linear_conversation');
  if (!Array.isArray(rawMessages) || rawMessages.length > MAX_MESSAGES)
    throw new Error(INVALID);
  const title = field(conversation, 'title');
  const messages: string[] = [];
  let omittedParts = 0,
    size = 0;
  for (const item of rawMessages) {
    const message = field(item, 'message');
    const role = field(field(message, 'author'), 'role');
    if (role !== 'user' && role !== 'assistant') continue;
    const metadata = field(message, 'metadata');
    if (
      field(metadata, 'is_visually_hidden_from_conversation') === true ||
      field(metadata, 'is_user_system_message') === true
    )
      continue;
    const recipient = field(message, 'recipient');
    if (
      role === 'assistant' &&
      typeof recipient === 'string' &&
      recipient !== 'all'
    )
      continue;
    const channel = field(message, 'channel') ?? field(metadata, 'channel');
    if (
      role === 'assistant' &&
      typeof channel === 'string' &&
      channel !== 'final'
    )
      continue;
    let attachmentCount = 0;
    for (const name of ['attachments', 'attached_files', 'file_ids']) {
      const attachments = field(metadata, name);
      if (Array.isArray(attachments))
        attachmentCount = Math.max(attachmentCount, attachments.length);
      else if (attachments && typeof attachments === 'object')
        attachmentCount = Math.max(attachmentCount, 1);
    }
    if (field(metadata, 'is_redacted') === true) {
      omittedParts += Math.max(1, attachmentCount);
      continue;
    }
    const content = field(message, 'content');
    const contentType = field(content, 'content_type');
    if (contentType !== 'text' && contentType !== 'multimodal_text') {
      if (
        typeof contentType === 'string' &&
        /image|audio|video|file|attachment/i.test(contentType)
      )
        omittedParts += Math.max(1, attachmentCount);
      else omittedParts += attachmentCount;
      continue;
    }
    const parts = field(content, 'parts');
    if (!Array.isArray(parts)) {
      if (content) omittedParts += Math.max(1, attachmentCount);
      continue;
    }
    if (parts.length > MAX_MESSAGES) throw new Error(INVALID);
    const texts: string[] = [];
    let nonTextParts = 0;
    for (const part of parts) {
      const value = dereference(part);
      if (typeof value === 'string') texts.push(value);
      else if (value !== undefined && value !== null) nonTextParts++;
    }
    omittedParts += Math.max(attachmentCount, nonTextParts);
    const text = texts.join('\n').trim();
    if (!text) continue;
    const line = `${role === 'user' ? 'Пользователь' : 'Ассистент'}:\n${text}`;
    size += line.length + 2;
    if (size > MAX_TEXT_LENGTH)
      throw new Error(
        'Текст чата превышает 500 000 символов. Вставьте нужные фрагменты вручную.',
      );
    messages.push(line);
  }
  if (!messages.length) throw new Error(INVALID);
  return {
    title: typeof title === 'string' ? title.slice(0, 240) : '',
    text: messages.join('\n\n'),
    messageCount: messages.length,
    omittedParts,
  };
}

export async function importSharedChat(
  rawUrl: unknown,
  transport: ShareTransport = pinnedSharedChatTransport,
): Promise<SharedChat> {
  const url = normalizeSharedChatUrl(rawUrl);
  const html = await transport(url);
  return parseSharedChat(html);
}
