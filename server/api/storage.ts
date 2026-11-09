import { z } from 'zod';
import type { ApiHandler } from './context';
import {
  adminAuthenticated,
  jsonError,
  sameOrigin,
  rateLimit,
} from './security';
import { cleanupBatchSize, cleanupImageSchema } from '../../src/lib/storage';
import { StorageConflict } from '../storage/repository';

const cleanupSchema = z
  .object({
    confirm: z.literal(true),
    images: z.array(cleanupImageSchema.strict()).min(1).max(cleanupBatchSize),
  })
  .strict();

export const report: ApiHandler = async (request, context) => {
  if (!(await adminAuthenticated(request, context)))
    return jsonError('Нет доступа.', 401);
  return Response.json(context.store.storage.report());
};
export const preview: ApiHandler = async (request, context) => {
  if (!(await adminAuthenticated(request, context)))
    return jsonError('Нет доступа.', 401);
  return Response.json(context.store.storage.preview());
};
export const cleanup: ApiHandler = async (request, context) => {
  if (!(await adminAuthenticated(request, context)))
    return jsonError('Нет доступа.', 401);
  if (!sameOrigin(request))
    return jsonError('Недопустимый источник запроса.', 403);
  const input = cleanupSchema.safeParse(await request.json());
  if (!input.success)
    return jsonError('Проверьте выбор изображений и подтвердите удаление.');
  if (!(await rateLimit(context, 'storage-cleanup', 20, 600)))
    return jsonError('Слишком много запросов. Повторите позже.', 429);
  try {
    return Response.json({
      ok: true,
      removed: context.store.storage.cleanup(input.data.images),
    });
  } catch (error) {
    if (error instanceof StorageConflict) return jsonError(error.message, 409);
    throw error;
  }
};
