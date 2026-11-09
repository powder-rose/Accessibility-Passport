import type {
  ArticleForm,
  ArticleRecord,
  ArticleImage,
} from '@/features/articles/model';
import {
  adminJson,
  adminRequest,
  AdminRequestError,
  adminRequestTimeout,
  type AdminRequestPolicy,
} from '@/lib/admin-request';

export { adminJson as articleJson } from '@/lib/admin-request';

export async function articleRequest<T>(
  path: string,
  options: RequestInit = {},
  policy?: AdminRequestPolicy,
): Promise<T> {
  try {
    return await adminRequest<T>(path, options, policy);
  } catch (error) {
    if (error instanceof AdminRequestError && error.status === 401)
      throw new AdminRequestError(
        'Сессия истекла. Войдите в админку в другой вкладке и повторите сохранение.',
        error.kind,
        error.status,
      );
    throw error;
  }
}
export function saveArticle(
  form: ArticleForm,
  requestId: string,
  article?: ArticleRecord,
) {
  return articleRequest<{ article: ArticleRecord; ok: true }>(
    article ? '/api/admin/articles/' + article.id : '/api/admin/articles',
    adminJson(
      article ? 'PUT' : 'POST',
      article ? { form, revision: article.revision } : { form, requestId },
    ),
  );
}
export function uploadImage(file: File) {
  const body = new FormData();
  body.set('image', file);
  return articleRequest<ArticleImage>(
    '/api/admin/article-images',
    { method: 'POST', body },
    { timeoutMs: adminRequestTimeout.image },
  );
}
export function imageSelectionError(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    !/\.(?:jpe?g|png|webp)$/i.test(file.name)
  )
    return 'Разрешены только JPG, PNG и WEBP.';
  if (!file.size || file.size > 5 * 1024 * 1024)
    return 'Размер изображения должен быть от 1 байта до 5 МБ.';
  return '';
}
