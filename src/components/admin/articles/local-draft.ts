import { articleFormSchema, articleImagePath } from '@/features/articles/model';

export const newArticleDraftKey = 'osi-admin-new-article-draft';
export function draftImageIds(raw: string | null): Set<string> {
  if (raw === null) return new Set();
  const value: unknown = JSON.parse(raw);
  const form = articleFormSchema.safeParse(
    value && typeof value === 'object' && 'form' in value
      ? value.form
      : undefined,
  );
  if (!form.success)
    throw new Error(
      'Сначала сохраните или разберите локальный черновик статьи.',
    );
  return new Set(
    [
      ...(form.data.content + ' ' + form.data.image).matchAll(
        /\/media\/articles\/[a-z0-9-]{1,160}\.webp/g,
      ),
    ].flatMap((match) => {
      const parsed = articleImagePath.exec(match[0]);
      return parsed ? [parsed[1]] : [];
    }),
  );
}
