import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { Config } from '../config';

export type ImageJobStatus = 'running' | 'succeeded' | 'unknown' | 'expired';
export interface ImageJob {
  id: string;
  status: ImageJobStatus;
  createdAt: string;
  updatedAt: string;
  digest: string;
  error?: string;
}
const validId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resultAge = 24 * 60 * 60 * 1000,
  idAge = 30 * 24 * 60 * 60 * 1000;
const active = new Set<string>(),
  initialized = new Set<string>();
function folder(config: Config) {
  return join(dirname(config.databasePath), 'ai-image-jobs');
}
function path(config: Config, id: string) {
  if (!validId.test(id)) throw new Error('Неверный номер задачи.');
  return join(folder(config), id + '.json');
}
function resultPath(config: Config, id: string) {
  if (!validId.test(id)) throw new Error('Неверный номер задачи.');
  return join(folder(config), id + '.result');
}
function atomicWrite(filename: string, job: ImageJob) {
  const tmp = filename + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(tmp, JSON.stringify(job), { mode: 0o600, flag: 'wx' });
    renameSync(tmp, filename);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* already renamed */
    }
  }
}
function read(filename: string): ImageJob | null {
  if (!existsSync(filename)) return null;
  const job = JSON.parse(readFileSync(filename, 'utf8')) as ImageJob;
  if (
    !job ||
    !validId.test(job.id) ||
    !job.digest ||
    !job.createdAt ||
    !job.updatedAt ||
    !['running', 'succeeded', 'unknown', 'expired'].includes(job.status)
  )
    throw new Error('Не удалось прочитать состояние задачи.');
  return job;
}
function files(dir: string) {
  return readdirSync(dir).filter(
    (name) =>
      validId.test(name.replace(/\.json$/, '')) && name.endsWith('.json'),
  );
}
export function initJobs(config: Config) {
  const dir = folder(config);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (initialized.has(dir)) return;
  for (const name of files(dir)) {
    const file = join(dir, name),
      job = read(file);
    if (!job) continue;
    if (job.status === 'running' && !active.has(file)) {
      job.status = 'unknown';
      job.updatedAt = new Date().toISOString();
      job.error =
        'Сервер перезапустился до получения ответа. Результат неизвестен; проверьте историю сервиса перед повтором.';
      atomicWrite(file, job);
    }
  }
  initialized.add(dir);
}
function clean(config: Config) {
  initJobs(config);
  const dir = folder(config),
    now = Date.now();
  for (const name of files(dir)) {
    const file = join(dir, name),
      job = read(file);
    if (!job) continue;
    if (job.status === 'running' && !active.has(file)) {
      job.status = 'unknown';
      job.updatedAt = new Date().toISOString();
      job.error =
        'Ответ не был сохранён. Результат неизвестен; проверьте историю сервиса перед повтором.';
      atomicWrite(file, job);
    }
    if (
      job.status === 'succeeded' &&
      now - Date.parse(job.updatedAt) > resultAge
    ) {
      const result = resultPath(config, job.id);
      if (existsSync(result)) unlinkSync(result);
      job.status = 'expired';
      job.updatedAt = new Date().toISOString();
      atomicWrite(file, job);
    }
    if (job.status !== 'running' && now - Date.parse(job.createdAt) > idAge) {
      const result = resultPath(config, job.id);
      if (existsSync(result)) unlinkSync(result);
      unlinkSync(file);
      continue;
    }
  }
}
export function jobDigest(prompt: string, referenceDataUrls: string[]) {
  return createHash('sha256')
    .update(JSON.stringify({ prompt, referenceDataUrls }))
    .digest('hex');
}
export function findJob(config: Config, id: string) {
  initJobs(config);
  const filename = path(config, id),
    job = read(filename);
  if (!job) return null;
  if (job.status === 'running' && !active.has(filename)) {
    job.status = 'unknown';
    job.updatedAt = new Date().toISOString();
    job.error =
      'Ответ не был сохранён. Результат неизвестен; проверьте историю сервиса перед повтором.';
    atomicWrite(filename, job);
  }
  if (
    job.status === 'succeeded' &&
    Date.now() - Date.parse(job.updatedAt) > resultAge
  ) {
    const result = resultPath(config, id);
    if (existsSync(result)) unlinkSync(result);
    job.status = 'expired';
    job.updatedAt = new Date().toISOString();
    atomicWrite(filename, job);
  }
  return job;
}
export function listJobs(config: Config) {
  clean(config);
  return files(folder(config))
    .map((name) => read(join(folder(config), name)))
    .filter((v): v is ImageJob => !!v)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function reserveJob(config: Config, id: string, digest: string) {
  const jobs = listJobs(config);
  if (jobs.length >= 1000)
    throw new Error('Достигнут предел истории задач. Попробуйте позже.');
  if (jobs.filter((j) => j.status === 'succeeded').length >= 20)
    throw new Error(
      'Хранилище готовых изображений заполнено. Попробуйте позже.',
    );
  const filename = path(config, id),
    now = new Date().toISOString();
  const job: ImageJob = {
    id,
    digest,
    status: 'running',
    createdAt: now,
    updatedAt: now,
  };
  try {
    writeFileSync(filename, JSON.stringify(job), { flag: 'wx', mode: 0o600 });
    active.add(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null;
    throw error;
  }
  return job;
}
export function finishJob(
  config: Config,
  id: string,
  result: { dataUrl: string } | { error: string },
) {
  const filename = path(config, id);
  try {
    const job = read(filename);
    if (!job) return;
    job.updatedAt = new Date().toISOString();
    if ('dataUrl' in result && result.dataUrl.length <= 16 * 1024 * 1024) {
      const target = resultPath(config, id),
        tmp = target + '.' + randomUUID() + '.tmp';
      try {
        writeFileSync(tmp, result.dataUrl, { mode: 0o600, flag: 'wx' });
        renameSync(tmp, target);
      } finally {
        try {
          unlinkSync(tmp);
        } catch {
          /* already renamed */
        }
      }
      job.status = 'succeeded';
    } else {
      job.status = 'unknown';
      job.error =
        'error' in result
          ? result.error
          : 'Полученный файл слишком большой. Результат и списание проверьте в сервисе.';
    }
    atomicWrite(filename, job);
  } finally {
    active.delete(filename);
  }
}
export function publicJob(job: ImageJob) {
  const { digest: _digest, ...rest } = job;
  return rest;
}
export function publicJobWithResult(config: Config, job: ImageJob) {
  if (job.status !== 'succeeded') return publicJob(job);
  const result = resultPath(config, job.id);
  if (!existsSync(result))
    return {
      ...publicJob(job),
      status: 'unknown',
      error:
        'Файл результата недоступен. Проверьте историю сервиса перед повтором.',
    };
  return { ...publicJob(job), dataUrl: readFileSync(result, 'utf8') };
}
