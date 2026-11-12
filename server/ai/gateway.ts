import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import type { AISettings } from './settings';

export interface Reference {
  bytes: Buffer;
  mime: string;
  ext: string;
}
export type Transport = (
  url: string,
  headers: Record<string, string>,
  body: Buffer,
  timeout: number,
) => Promise<{ status: number; body: string }>;
const maxReply = 32 * 1024 * 1024;
export function publicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family === 6) {
    const lower = address.toLowerCase(),
      first = parseInt(lower.split(':')[0], 16);
    return first >= 0x2000 && first <= 0x3fff && !lower.startsWith('2001:db8:');
  }
  return false;
}
export function parseReference(value: unknown): Reference {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil((5 * 1024 * 1024 * 4) / 3) + 100
  )
    throw new Error('Каждое фото должно быть не больше 5 МБ.');
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error('Фото должно быть в формате PNG, JPEG или WebP.');
  const bytes = Buffer.from(match[2], 'base64');
  const format = match[1];
  const png =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  const webp =
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP';
  if (
    !bytes.length ||
    bytes.length > 5 * 1024 * 1024 ||
    !(format === 'png' ? png : format === 'jpeg' ? jpeg : webp)
  )
    throw new Error('Формат фотографии не соответствует её содержимому.');
  return {
    bytes,
    mime: 'image/' + format,
    ext: format === 'jpeg' ? 'jpg' : format,
  };
}
export const pinnedTransport: Transport = async (
  rawUrl,
  headers,
  body,
  timeout,
) => {
  const target = new URL(rawUrl);
  if (
    target.protocol !== 'https:' ||
    target.hostname !== 'ai.d1n0tf.ru' ||
    target.port ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    !/^\/v1\/(?:chat\/completions|images\/(?:edits|generations))$/.test(
      target.pathname,
    )
  )
    throw new Error('Недопустимый адрес шлюза.');
  // The absolute deadline covers DNS, connection, upload and response. No retry:
  // a timeout can occur after the gateway accepted a billable request.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const addresses = await Promise.race([
      dns.lookup(target.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          'abort',
          () => reject(new Error('deadline')),
          { once: true },
        ),
      ),
    ]);
    if (!addresses.length || addresses.some((x) => !publicAddress(x.address)))
      throw new Error('Недопустимый адрес шлюза.');
    const chosen = addresses[0];
    return await new Promise((resolve, reject) => {
      const req = https.request(
        target,
        {
          method: 'POST',
          headers,
          servername: target.hostname,
          family: chosen.family,
          lookup: (_host, _opts, done) =>
            done(null, chosen.address, chosen.family),
          signal: controller.signal,
        },
        (res) => {
          let total = 0;
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > maxReply) {
              req.destroy(new Error('response too large'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () =>
            resolve({
              status: res.statusCode || 0,
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  } catch {
    if (controller.signal.aborted)
      throw new Error(
        'Время ожидания истекло. Результат запроса неизвестен; проверьте историю сервиса перед повтором.',
      );
    throw new Error('Не удалось связаться со шлюзом. Проверьте соединение.');
  } finally {
    clearTimeout(timer);
  }
};
export async function callGateway(
  settings: AISettings,
  kind: 'text' | 'image',
  prompt: string,
  system: string,
  refs: Reference[],
  transport: Transport,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.apiKey}`,
    Accept: 'application/json',
  };
  let body: Buffer;
  let path: string;
  if (kind === 'text') {
    path = '/chat/completions';
    body = Buffer.from(
      JSON.stringify({
        model: settings.textModel,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt },
        ],
      }),
    );
    headers['Content-Type'] = 'application/json';
  } else if (refs.length) {
    path = '/images/edits';
    const boundary = '----PassportAI' + randomUUID().replaceAll('-', ''),
      parts: Buffer[] = [];
    for (const [name, value] of [
      ['model', settings.imageModel],
      ['prompt', prompt],
    ])
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        ),
      );
    for (const [i, ref] of refs.entries())
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${refs.length > 1 ? 'image[]' : 'image'}"; filename="reference-${i + 1}.${ref.ext}"\r\nContent-Type: ${ref.mime}\r\n\r\n`,
        ),
        ref.bytes,
        Buffer.from('\r\n'),
      );
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    body = Buffer.concat(parts);
    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
  } else {
    path = '/images/generations';
    body = Buffer.from(JSON.stringify({ model: settings.imageModel, prompt }));
    headers['Content-Type'] = 'application/json';
  }
  headers['Content-Length'] = String(body.length);
  const reply = await transport(
    settings.baseUrl + path,
    headers,
    body,
    kind === 'image' ? 900000 : 90000,
  );
  if (reply.status < 200 || reply.status >= 300)
    throw new Error(
      `Шлюз вернул HTTP ${reply.status}. Проверьте подключение и модель.`,
    );
  try {
    return JSON.parse(reply.body) as unknown;
  } catch {
    throw new Error('Шлюз вернул ответ неподдерживаемого формата.');
  }
}
export function imageResult(value: unknown): string {
  const x = value as { data?: Array<{ b64_json?: unknown }> };
  const b = x?.data?.[0]?.b64_json;
  if (
    typeof b !== 'string' ||
    b.length > maxReply ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(b)
  )
    throw new Error('Шлюз не вернул изображение в поддерживаемом формате.');
  const bytes = Buffer.from(b, 'base64');
  let mime = '';
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    mime = 'image/png';
  else if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    mime = 'image/jpeg';
  else if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    mime = 'image/webp';
  if (!mime) throw new Error('Шлюз вернул неподдерживаемый файл изображения.');
  return `data:${mime};base64,${b}`;
}
