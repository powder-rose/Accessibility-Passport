import {
  initialArticleQuery,
  type ArticleQuery,
} from '../../src/features/articles/listing';

export class ArticleQueryError extends Error {}
export function parseArticleQuery(url: URL, admin = false): ArticleQuery {
  const input = url.searchParams;
  for (const key of ['page', 'category', 'q', ...(admin ? ['status'] : [])])
    if (input.getAll(key).length > 1)
      throw new ArticleQueryError('Некорректные параметры списка статей.');
  const page = input.get('page') || '1';
  const category = (input.get('category') || '').trim().replace(/\s+/g, ' ');
  const search = (input.get('q') || '').trim();
  const status = admin ? input.get('status') || 'all' : 'published';
  if (
    !/^[1-9]\d{0,5}$/.test(page) ||
    category.length > 80 ||
    search.length > 100 ||
    !['all', 'draft', 'published'].includes(status)
  )
    throw new ArticleQueryError('Некорректные параметры списка статей.');
  return {
    ...initialArticleQuery,
    page: Number(page),
    category,
    search,
    status: status as ArticleQuery['status'],
  };
}
