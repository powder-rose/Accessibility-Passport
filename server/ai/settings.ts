import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { Config } from '../config';

export interface AISettings {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
}
const host = 'ai.d1n0tf.ru';
export function baseUrl(input: unknown): string {
  let u: URL;
  try {
    u = new URL(String(input));
  } catch {
    throw new Error('Укажите корректный адрес API.');
  }
  if (
    u.protocol !== 'https:' ||
    u.hostname !== host ||
    u.port ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname.replace(/\/+$/, '') !== '/v1'
  )
    throw new Error('Разрешён только адрес https://ai.d1n0tf.ru/v1.');
  return `${u.origin}/v1`;
}
function filename(config: Config) {
  return join(dirname(config.databasePath), 'ai-settings.enc');
}
function encryptionKey(config: Config) {
  if (config.adminSessionSecret.length < 32)
    throw new Error('Секрет сервера не настроен.');
  return Buffer.from(
    hkdfSync(
      'sha256',
      config.adminSessionSecret,
      'passport-ai-settings',
      'v1',
      32,
    ),
  );
}
export function readSettings(config: Config): AISettings | null {
  const path = filename(config);
  if (!existsSync(path)) return null;
  try {
    const x: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!x || typeof x !== 'object') throw new Error();
    const data = x as Record<string, unknown>;
    if (
      data.version !== 1 ||
      typeof data.iv !== 'string' ||
      typeof data.tag !== 'string' ||
      typeof data.ciphertext !== 'string'
    )
      throw new Error();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(config),
      Buffer.from(data.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(data.ciphertext, 'base64')),
      decipher.final(),
    ]);
    const settings = JSON.parse(plaintext.toString('utf8')) as AISettings;
    if (
      !settings ||
      typeof settings.apiKey !== 'string' ||
      !settings.apiKey ||
      typeof settings.textModel !== 'string' ||
      typeof settings.imageModel !== 'string'
    )
      throw new Error();
    settings.baseUrl = baseUrl(settings.baseUrl);
    return settings;
  } catch {
    throw new Error(
      'Не удалось прочитать настройки ИИ. Введите API-ключ заново.',
    );
  }
}
export function saveSettings(config: Config, settings: AISettings) {
  const path = filename(config),
    parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', encryptionKey(config), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(settings), 'utf8'),
    cipher.final(),
  ]);
  const payload = JSON.stringify({
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
  });
  const temp = path + '.' + randomBytes(12).toString('hex') + '.tmp';
  try {
    writeFileSync(temp, payload, { mode: 0o600, flag: 'wx' });
    renameSync(temp, path);
    chmodSync(path, 0o600);
  } finally {
    try {
      unlinkSync(temp);
    } catch {
      /* renamed or never created */
    }
  }
}
