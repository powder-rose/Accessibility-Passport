import { z } from 'zod';
import {
  articleFormSchema,
  articleSlug,
} from '../../src/features/articles/model';
import type { ApiContext, ApiHandler } from '../api/context';
import {
  adminAuthenticated,
  jsonError,
  sameOrigin,
  rateLimit,
} from '../api/security';
import { ArticleError } from './repository';
import { uploadArticleImage } from './images';
import { articleImageResponse } from './image-response';
import { parseArticleQuery, ArticleQueryError } from './list-query';

const uuid = z.string().uuid();
const createSchema = z.object({ form: articleFormSchema, requestId: uuid });
const updateSchema = z.object({
  form: articleFormSchema,
  revision: z.number().int().positive(),
});
async function protectedRequest(
  request: Request,
  context: ApiContext,
  handler: () => Promise<Response> | Response,
) {
  if (!(await adminAuthenticated(request, context)))
    return jsonError('Нет доступа.', 401);
  if (!['GET', 'HEAD'].includes(request.method) && !sameOrigin(request))
    return jsonError('Недопустимый источник запроса.', 403);
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ArticleQueryError)
      return jsonError(error.message, 400);
    if (error instanceof ArticleError)
      return jsonError(error.message, error.status);
    throw error;
  }
}
const list: ApiHandler = (request, context) =>
  protectedRequest(request, context, () =>
    Response.json(
      context.store.articles.queries.adminPage(
        parseArticleQuery(new URL(request.url), true),
      ),
    ),
  );
const create: ApiHandler = (request, context) =>
  protectedRequest(request, context, async () => {
    const input = createSchema.safeParse(await request.json());
    if (!input.success) return jsonError('Проверьте поля статьи.');
    if (!(await rateLimit(context, 'article-save', 120, 600)))
      return jsonError('Слишком много сохранений. Попробуйте позже.', 429);
    return Response.json({
      article: context.store.articles.save(input.data.form, {
        requestId: input.data.requestId,
      }),
      ok: true,
    });
  });
const read: ApiHandler = (request, context) =>
  protectedRequest(request, context, () => {
    const id = new URL(request.url).pathname.split('/').at(-1)!;
    const article = context.store.articles.get(id);
    return article
      ? Response.json({ article })
      : jsonError('Статья не найдена.', 404);
  });
const update: ApiHandler = (request, context) =>
  protectedRequest(request, context, async () => {
    const id = new URL(request.url).pathname.split('/').at(-1)!;
    const input = updateSchema.safeParse(await request.json());
    if (!input.success) return jsonError('Проверьте поля статьи.');
    if (!(await rateLimit(context, 'article-save', 120, 600)))
      return jsonError('Слишком много сохранений. Попробуйте позже.', 429);
    return Response.json({
      article: context.store.articles.save(input.data.form, {
        id,
        revision: input.data.revision,
      }),
      ok: true,
    });
  });
const remove: ApiHandler = (request, context) =>
  protectedRequest(request, context, () => {
    const url = new URL(request.url);
    const id = url.pathname.split('/').at(-1)!;
    const revision = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(url.searchParams.get('revision'));
    if (!revision.success) return jsonError('Не указана версия статьи.');
    context.store.articles.remove(id, revision.data);
    return Response.json({ ok: true });
  });
const preview: ApiHandler = (request, context) =>
  protectedRequest(request, context, async () => {
    const parsed = articleFormSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError('Проверьте поля статьи.');
    const form = context.store.articles.prepare({
      ...parsed.data,
      status: 'draft',
    });
    return Response.json({
      article: {
        ...form,
        slug: articleSlug(form.slug || form.title),
        id: 'preview',
        revision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: null,
      },
    });
  });
const upload: ApiHandler = (request, context) =>
  protectedRequest(request, context, () =>
    uploadArticleImage(request, context),
  );
export function articleEndpoint(
  path: string,
): Record<string, ApiHandler> | undefined {
  if (path === '/api/admin/articles') return { GET: list, POST: create };
  if (path === '/api/admin/articles/preview') return { POST: preview };
  if (path === '/api/admin/article-images') return { POST: upload };
  if (/^\/api\/admin\/articles\/[a-f0-9-]{36}$/.test(path))
    return { GET: read, PUT: update, DELETE: remove };
  if (/^\/media\/articles\/[a-f0-9-]{36}\.webp$/.test(path))
    return { GET: articleImageResponse, HEAD: articleImageResponse };
  return undefined;
}
