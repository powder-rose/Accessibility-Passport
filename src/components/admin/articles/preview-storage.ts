import { createRequestId } from '@/lib/request-id';
import { articleFormSchema, type ArticleForm } from '@/features/articles/model';
const prefix = 'osi-article-preview:';
const maxAge = 86400000;
export function storeArticlePreview(form: ArticleForm) {
  const snapshots: { key: string; savedAt: number }[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null') as {
        savedAt: number;
      } | null;
      snapshots.push({
        key,
        savedAt: typeof value?.savedAt === 'number' ? value.savedAt : 0,
      });
    } catch {
      snapshots.push({ key, savedAt: 0 });
    }
  }
  snapshots
    .sort((a, b) => b.savedAt - a.savedAt)
    .forEach((snapshot, index) => {
      if (index >= 4 || Date.now() - snapshot.savedAt > maxAge)
        localStorage.removeItem(snapshot.key);
    });
  const token = createRequestId();
  localStorage.setItem(
    prefix + token,
    JSON.stringify({ form, savedAt: Date.now() }),
  );
  return token;
}
export function readArticlePreview(token: string) {
  if (!/^[a-f0-9-]{36}$/.test(token))
    throw new Error('Предпросмотр не найден. Откройте его из редактора.');
  const raw = JSON.parse(localStorage.getItem(prefix + token) || 'null') as {
    form: unknown;
    savedAt: number;
  } | null;
  if (
    !raw ||
    typeof raw.savedAt !== 'number' ||
    Date.now() - raw.savedAt > maxAge
  )
    throw new Error('Предпросмотр устарел. Откройте его из редактора.');
  return articleFormSchema.parse(raw.form);
}
