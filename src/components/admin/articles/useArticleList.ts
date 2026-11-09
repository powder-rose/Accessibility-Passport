import { useEffect, useState } from 'react';
import {
  initialArticleQuery,
  articlePageSize,
  articleListParams,
  type ArticleListing,
  type AdminArticleSummary,
  type ArticleQuery,
} from '@/features/articles/listing';
import { articleRequest } from './api';

export function useArticleList() {
  const [query, setQuery] = useState(initialArticleQuery);
  const [search, setSearch] = useState('');
  const [version, setVersion] = useState(0);
  const [listing, setListing] = useState<ArticleListing<AdminArticleSummary>>({
    ...initialArticleQuery,
    articles: [],
    categories: [],
    total: 0,
    pages: 1,
    pageSize: articlePageSize.admin,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery((previous) =>
          previous.search === search.trim()
            ? previous
            : { ...previous, search: search.trim(), page: 1 },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const result = await articleRequest<
          ArticleListing<AdminArticleSummary>
        >('/api/admin/articles?' + articleListParams(query), {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setListing(result);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Не удалось загрузить статьи.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [query, version]);
  return {
    listing,
    loading,
    error,
    setError,
    search,
    setSearch,
    filter: query.status,
    setFilter: (status: ArticleQuery['status']) =>
      setQuery((previous) => ({ ...previous, status, page: 1 })),
    go: (page: number) => setQuery((previous) => ({ ...previous, page })),
    refresh: () => setVersion((value) => value + 1),
  };
}
