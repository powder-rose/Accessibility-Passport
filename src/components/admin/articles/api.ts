import type {
  ArticleForm,
  ArticleRecord,
  ArticleImage,
} from '@/features/articles/model';

export async function articleRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, options);
  let body: T & { error?: string };
  try {
    body = (await response.json()) as T & { error?: string };
  } catch {
    throw new Error('Не удалось прочитать ответ сервера. Повторите попытку.');
  }
  if (!response.ok) {
    if (response.status === 401)
      throw new Error(
        'Сессия истекла. Войдите в админку в другой вкладке и повторите сохранение.',
      );
    throw new Error(body.error || 'Не удалось выполнить действие.');
  }
  return body;
}
export const articleJson = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
export function saveArticle(
  form: ArticleForm,
  requestId: string,
  article?: ArticleRecord,
) {
  return articleRequest<{ article: ArticleRecord; ok: true }>(
    article ? '/api/admin/articles/' + article.id : '/api/admin/articles',
    articleJson(
      article ? 'PUT' : 'POST',
      article ? { form, revision: article.revision } : { form, requestId },
    ),
  );
}
export function uploadImage(file: File) {
  const body = new FormData();
  body.set('image', file);
  return articleRequest<ArticleImage>('/api/admin/article-images', {
    method: 'POST',
    body,
  });
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
