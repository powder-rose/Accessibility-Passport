import { z } from 'zod';
import type { ApiContext, ApiHandler } from '../api/context';
import {
  adminAuthenticated,
  jsonError,
  rateLimit,
  sameOrigin,
} from '../api/security';
import { sanitizeArticleContent } from '../articles/html';
import { baseUrl, readSettings, saveSettings } from './settings';
import {
  importSharedChat,
  pinnedSharedChatTransport,
  type ShareTransport,
} from './shared-chat';
import {
  callGateway,
  imageResult,
  parseReference,
  pinnedTransport,
  type Transport,
} from './gateway';
import { AiStorageConflict, type AiMaterialKey } from './materials-repository';
import {
  findJob,
  finishJob,
  jobDigest,
  listJobs,
  publicJob,
  publicJobWithResult,
  reserveJob,
} from './image-jobs';

const key = z
  .string()
  .max(4096)
  .refine((v) => !/[\r\n]/.test(v));
const model = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:/-]+$/);
const configSchema = z
  .object({
    baseUrl: z.string().max(512),
    apiKey: key,
    textModel: model,
    imageModel: model,
  })
  .strict();
const textSchema = z
  .object({
    prompt: z.string().trim().min(1).max(120000),
    system: z.string().max(24000).optional(),
    structured: z.boolean().optional(),
  })
  .strict();
const generatedArticleSchema = z
  .object({
    clusterTopic: z.string().trim().min(1).max(500),
    title: z.string().trim().min(1).max(240),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    seoTitle: z.string().trim().min(1).max(240),
    seoDescription: z.string().trim().min(1).max(500),
    // Category is optional: a malformed suggestion must not discard a paid article.
    category: z
      .unknown()
      .optional()
      .transform((value) => {
        if (typeof value !== 'string') return '';
        const category = value.trim();
        return category.length <= 80 ? category : '';
      }),
    imageAlt: z.string().trim().min(1).max(500),
    inlineImageAlts: z.array(z.string().trim().min(1).max(500)).length(3),
    articleHtml: z.string().trim().min(1).max(300000),
  })
  .strict();
const imageSchema = z
  .object({
    requestId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(120000),
    referenceDataUrls: z.array(z.string().min(1)).max(2).optional(),
  })
  .strict();
let busy = false;
function outputHtml(text: string) {
  const html = text
    .replace(/^\s*```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/, '');
  return sanitizeArticleContent(html).replace(/<img\b[^>]*>/gi, '');
}
function structuredArticle(raw: string) {
  const text = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      'Модель вернула некорректный формат статьи. Данные не применены; запрос автоматически не повторяется.',
    );
  }
  const parsed = generatedArticleSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      'Модель вернула некорректные поля статьи или SEO. Данные не применены; запрос автоматически не повторяется.',
    );
  const { articleHtml, ...metadata } = parsed.data;
  const safeHtml = outputHtml(articleHtml);
  if (!safeHtml.replace(/<[^>]*>|&nbsp;|&#160;/gi, '').trim())
    throw new Error(
      'В ответе модели нет пригодного текста статьи. Данные не применены.',
    );
  return { text: articleHtml, safeHtml, metadata };
}
export function createAiEndpoints(
  transport: Transport = pinnedTransport,
  shareTransport: ShareTransport = pinnedSharedChatTransport,
): Record<string, Record<string, ApiHandler>> {
  async function protectedRequest(
    request: Request,
    context: ApiContext,
    operation: () => Promise<Response> | Response,
  ) {
    if (!(await adminAuthenticated(request, context)))
      return jsonError('Нет доступа.', 401);
    if (request.method !== 'GET' && !sameOrigin(request))
      return jsonError('Недопустимый источник запроса.', 403);
    try {
      return await operation();
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Ошибка ИИ-помощника.',
        error instanceof AiStorageConflict ? 409 : 400,
      );
    }
  }
  const status: ApiHandler = (request, context) =>
    protectedRequest(request, context, () => {
      try {
        const settings = readSettings(context.config);
        return Response.json(
          settings
            ? {
                configured: true,
                baseUrl: settings.baseUrl,
                textModel: settings.textModel,
                imageModel: settings.imageModel,
              }
            : { configured: false },
        );
      } catch {
        return Response.json({ configured: false, requiresKey: true });
      }
    });
  const shareImport: ApiHandler = (request, context) =>
    protectedRequest(request, context, async () => {
      if (!(await rateLimit(context, 'ai-share-import', 30, 600)))
        return jsonError('Слишком много запросов. Попробуйте позже.', 429);
      const input = z
        .object({ url: z.string().max(200) })
        .strict()
        .safeParse(await request.json());
      if (!input.success)
        return jsonError('Укажите публичную ссылку на чат ChatGPT.');
      return Response.json(
        await importSharedChat(input.data.url, shareTransport),
      );
    });
  const configure: ApiHandler = (request, context) =>
    protectedRequest(request, context, async () => {
      if (!(await rateLimit(context, 'ai-config', 30, 600)))
        return jsonError('Слишком много попыток. Попробуйте позже.', 429);
      const parsed = configSchema.safeParse(await request.json());
      if (!parsed.success) return jsonError('Проверьте параметры подключения.');
      let previous = null;
      try {
        previous = readSettings(context.config);
      } catch {
        if (!parsed.data.apiKey.trim())
          throw new Error('Введите API-ключ заново.');
      }
      const apiKey = parsed.data.apiKey.trim() || previous?.apiKey;
      if (!apiKey) throw new Error('Введите API-ключ.');
      const settings = {
        ...parsed.data,
        apiKey,
        baseUrl: baseUrl(parsed.data.baseUrl),
      };
      saveSettings(context.config, settings);
      return Response.json({
        configured: true,
        baseUrl: settings.baseUrl,
        textModel: settings.textModel,
        imageModel: settings.imageModel,
      });
    });
  const generate =
    (kind: 'text'): ApiHandler =>
    (request, context) =>
      protectedRequest(request, context, async () => {
        const settings = readSettings(context.config);
        if (!settings) throw new Error('Сначала подключите шлюз.');
        const value = await request.json();
        const parsed = textSchema.safeParse(value);
        if (!parsed.success)
          throw new Error('Проверьте запрос и вложенные изображения.');
        const payload = parsed.data as {
          prompt: string;
          system?: string;
          structured?: boolean;
          referenceDataUrls?: string[];
        };
        const refs = (payload.referenceDataUrls || []).map(parseReference);
        if (busy)
          return jsonError('Дождитесь завершения предыдущего запроса.', 409);
        if (!(await rateLimit(context, 'ai-generation', 20, 600)))
          return jsonError('Слишком много запросов. Попробуйте позже.', 429);
        // Recheck after the async rate-limit operation to avoid a concurrent race.
        if (busy)
          return jsonError('Дождитесь завершения предыдущего запроса.', 409);
        busy = true;
        try {
          const result = await callGateway(
            settings,
            kind,
            payload.prompt,
            payload.system || '',
            refs,
            transport,
          );
          const data = result as {
            choices?: Array<{ message?: { content?: unknown } }>;
            usage?: Record<string, unknown>;
          };
          const text = data?.choices?.[0]?.message?.content;
          if (typeof text !== 'string' || !text.trim() || text.length > 300000)
            throw new Error('Шлюз не вернул текст в поддерживаемом формате.');
          const usage: Record<string, number> = {};
          for (const field of [
            'prompt_tokens',
            'completion_tokens',
            'total_tokens',
            'input_tokens',
            'output_tokens',
          ]) {
            const n = data?.usage?.[field];
            if (typeof n === 'number' && Number.isFinite(n) && n >= 0)
              usage[field] = n;
          }
          return Response.json({
            ...(payload.structured
              ? structuredArticle(text)
              : { text, safeHtml: outputHtml(text) }),
            ...(Object.keys(usage).length ? { usage } : {}),
          });
        } finally {
          busy = false;
        }
      });
  const createImage: ApiHandler = (request, context) =>
    protectedRequest(request, context, async () => {
      const parsed = imageSchema.safeParse(await request.json());
      if (!parsed.success)
        return jsonError('Проверьте запрос и вложенные изображения.');
      const { prompt, referenceDataUrls = [] } = parsed.data;
      const requestId = parsed.data.requestId.toLowerCase();
      const digest = jobDigest(prompt, referenceDataUrls),
        existing = findJob(context.config, requestId);
      if (existing) {
        if (existing.digest !== digest)
          return jsonError(
            'Этот номер уже использован для другого запроса.',
            409,
          );
        return Response.json(publicJob(existing), { status: 202 });
      }
      const settings = readSettings(context.config);
      if (!settings) throw new Error('Сначала подключите шлюз.');
      const refs = referenceDataUrls.map(parseReference);
      if (busy) {
        const previous = findJob(context.config, requestId);
        if (previous && previous.digest === digest)
          return Response.json(publicJob(previous), { status: 202 });
        return jsonError('Дождитесь завершения предыдущего запроса.', 409);
      }
      if (!(await rateLimit(context, 'ai-generation', 20, 600)))
        return jsonError('Слишком много запросов. Попробуйте позже.', 429);
      if (busy) {
        const previous = findJob(context.config, requestId);
        if (previous && previous.digest === digest)
          return Response.json(publicJob(previous), { status: 202 });
        return jsonError('Дождитесь завершения предыдущего запроса.', 409);
      }
      const job = reserveJob(context.config, requestId, digest);
      if (!job) {
        const previous = findJob(context.config, requestId);
        if (!previous || previous.digest !== digest)
          return jsonError(
            'Этот номер уже использован для другого запроса.',
            409,
          );
        return Response.json(publicJob(previous), { status: 202 });
      }
      busy = true;
      void (async () => {
        try {
          const result = await callGateway(
            settings,
            'image',
            prompt,
            '',
            refs,
            transport,
          );
          finishJob(context.config, requestId, {
            dataUrl: await imageResult(result),
          });
        } catch (error) {
          try {
            finishJob(context.config, requestId, {
              error:
                error instanceof Error &&
                error.message.startsWith('Не удалось подготовить WebP.')
                  ? error.message
                  : 'Результат запроса не подтверждён. Проверьте историю сервиса и расходы перед повтором.',
            });
          } catch {
            /* the durable running record will be reported as unknown */
          }
        } finally {
          busy = false;
        }
      })();
      return Response.json(publicJob(job), { status: 202 });
    });
  const jobsList: ApiHandler = (request, context) =>
    protectedRequest(request, context, () =>
      Response.json({
        jobs: listJobs(context.config).slice(0, 50).map(publicJob),
      }),
    );
  const jobRead: ApiHandler = (request, context) =>
    protectedRequest(request, context, () => {
      const id = (
        new URL(request.url).pathname.split('/').at(-1) || ''
      ).toLowerCase();
      const job = findJob(context.config, id);
      return job
        ? Response.json(publicJobWithResult(context.config, job))
        : jsonError('Задача не найдена.', 404);
    });
  const revisionSchema = z.union([
    z.number().int().positive().safe(),
    z.null(),
  ]);
  const materialsSchema = z
    .object({
      revision: revisionSchema,
      value: z.record(z.string(), z.unknown()),
    })
    .strict();
  const photoSchema = z
    .object({ revision: revisionSchema, dataUrl: z.string().nullable() })
    .strict();
  const readMaterial =
    (key: AiMaterialKey): ApiHandler =>
    (request, context) =>
      protectedRequest(request, context, () => {
        const record = context.store.aiMaterials.get(key);
        if (key === 'materials')
          return Response.json({
            revision: record?.revision || null,
            value: record ? JSON.parse(record.value as string) : null,
          });
        const dataUrl = record
          ? `data:${record.mime};base64,${Buffer.from(record.value as Uint8Array).toString('base64')}`
          : null;
        return Response.json({ revision: record?.revision || null, dataUrl });
      });
  const writeMaterial =
    (key: AiMaterialKey): ApiHandler =>
    (request, context) =>
      protectedRequest(request, context, async () => {
        if (!(await rateLimit(context, 'ai-materials', 300, 600)))
          return jsonError('Слишком много сохранений. Попробуйте позже.', 429);
        const body = await request.json();
        if (key === 'materials') {
          const parsed = materialsSchema.safeParse(body);
          if (!parsed.success) return jsonError('Проверьте материалы.');
          const record = context.store.aiMaterials.put(
            key,
            JSON.stringify(parsed.data.value),
            parsed.data.revision,
          );
          return Response.json({ revision: record.revision });
        }
        const parsed = photoSchema.safeParse(body);
        if (!parsed.success) return jsonError('Проверьте фотографию.');
        if (parsed.data.dataUrl === null) {
          if (parsed.data.revision === null) {
            if (context.store.aiMaterials.get(key))
              throw new AiStorageConflict();
          } else context.store.aiMaterials.delete(key, parsed.data.revision);
          return Response.json({ revision: null });
        }
        const ref = parseReference(parsed.data.dataUrl);
        const record = context.store.aiMaterials.put(
          key,
          ref.bytes,
          parsed.data.revision,
          ref.mime,
        );
        return Response.json({ revision: record.revision });
      });
  return {
    '/api/admin/ai/status': { GET: status },
    '/api/admin/ai/share-import': { POST: shareImport },
    '/api/admin/ai/config': { POST: configure },
    '/api/admin/ai/text': { POST: generate('text') },
    '/api/admin/ai/image': { POST: createImage },
    '/api/admin/ai/image-jobs': { GET: jobsList },
    '/api/admin/ai/image-jobs/*': { GET: jobRead },
    ...Object.fromEntries(
      (['materials', 'photo1', 'photo2'] as const).map((key) => [
        `/api/admin/ai/${key}`,
        { GET: readMaterial(key), POST: writeMaterial(key) },
      ]),
    ),
  };
}
export const aiEndpoints = createAiEndpoints();
