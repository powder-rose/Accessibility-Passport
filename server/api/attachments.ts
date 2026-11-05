import { attachmentLimitsSchema } from '../../src/lib/attachments';
import type { ApiContext } from './context';
import { adminAuthenticated, sameOrigin, jsonError } from './security';

export async function limits(_request: Request, context: ApiContext) {
  return Response.json(context.store.getAttachmentLimits(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
export async function settings(request: Request, context: ApiContext) {
  if (!(await adminAuthenticated(request, context)))
    return jsonError('Нет доступа.', 401);
  if (request.method === 'GET') return limits(request, context);
  if (!sameOrigin(request))
    return jsonError('Недопустимый источник запроса.', 403);
  const parsed = attachmentLimitsSchema.safeParse(await request.json());
  if (!parsed.success)
    return jsonError('Проверьте количество и размеры файлов.');
  return Response.json(context.store.setAttachmentLimits(parsed.data), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
export async function download(request: Request, context: ApiContext) {
  if (!(await adminAuthenticated(request, context)))
    return jsonError('Нет доступа.', 401);
  const file = context.store.getAttachment(
    new URL(request.url).pathname.split('/').at(-1) || '',
  );
  if (!file) return jsonError('Файл не найден.', 404);
  const name = encodeURIComponent(file.name).replace(
    /['()*]/g,
    (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase(),
  );
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="document"; filename*=UTF-8''${name}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    },
  });
}
