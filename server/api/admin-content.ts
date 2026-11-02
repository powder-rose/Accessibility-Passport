import { contentSchema } from '../../src/lib/content-schema';
import type { ApiContext } from './context';
import { adminAuthenticated, sameOrigin, jsonError } from './security';

export async function GET(request: Request, context: ApiContext) {
  if (!(await adminAuthenticated(request, context))) return jsonError('Войдите в CMS.', 401);
  return Response.json(context.store.getContentRecord(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
export async function PUT(request: Request, context: ApiContext) {
  if (!sameOrigin(request) || !(await adminAuthenticated(request, context)))
    return jsonError('Нет доступа.', 403);
  try {
    const raw = await request.text();
    if (raw.length > 160000) return jsonError('Слишком большой документ.', 413);
    const { content, revision } = JSON.parse(raw);
    if (!Number.isInteger(revision) || revision < 0) return jsonError('Неизвестная версия.');
    const parsed = contentSchema.safeParse(content);
    if (!parsed.success)
      return jsonError(
        parsed.error.issues
          .map((i) => i.path.join('.') + ': ' + i.message)
          .slice(0, 5)
          .join('\n'),
      );
    if (!context.store.saveContent(parsed.data, revision))
      return jsonError('Документ изменён в другой вкладке. Перезагрузите редактор.', 409);
    return Response.json(
      { ok: true, revision: revision + 1 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return jsonError('Не удалось сохранить изменения.', 503);
  }
}
