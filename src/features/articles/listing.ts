import type { ArticleSummary } from './model';

export const articlePageSize = { public: 12, admin: 25 } as const;
export interface ArticleQuery {
  page: number;
  category: string;
  search: string;
  status: 'all' | 'draft' | 'published';
}
export const initialArticleQuery: ArticleQuery = {
  page: 1,
  category: '',
  search: '',
  status: 'all',
};
export type AdminArticleSummary = ArticleSummary & { revision: number };
export interface ArticleListing<T = ArticleSummary> extends ArticleQuery {
  articles: T[];
  categories: string[];
  total: number;
  pages: number;
  pageSize: number;
}
export function articleListParams(query: ArticleQuery) {
  const params = new URLSearchParams();
  if (query.page > 1) params.set('page', String(query.page));
  if (query.category) params.set('category', query.category);
  if (query.search) params.set('q', query.search);
  if (query.status !== 'all') params.set('status', query.status);
  return params;
}
export function blogPath(
  query: Pick<ArticleQuery, 'page' | 'category' | 'search'>,
) {
  const params = articleListParams({ ...query, status: 'all' }).toString();
  return '/blog/' + (params ? '?' + params : '');
}
