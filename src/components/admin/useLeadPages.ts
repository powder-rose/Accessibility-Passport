import { useCallback, useEffect, useRef, useState } from 'react';
import type { LeadPage } from '@/lib/leads';

export function useLeadPages(onSessionExpired: () => void) {
  const [page, setPage] = useState<LeadPage | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  const requestedHistory = useRef<(string | null)[]>([null]);

  const load = useCallback(
    async (history: (string | null)[]) => {
      requestedHistory.current = history;
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ limit: '25' });
        const cursor = history.at(-1);
        if (cursor) params.set('cursor', cursor);
        const response = await fetch('/api/admin/leads?' + params, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setPage(null);
          onSessionExpired();
          return;
        }
        const result = (await response.json()) as LeadPage & { error?: string };
        if (!response.ok)
          throw new Error(result.error || 'Не удалось загрузить заявки.');
        if (controller.signal.aborted) return;
        setPage(result);
        setCursors(history);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Не удалось загрузить заявки.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [onSessionExpired],
  );

  useEffect(() => {
    void load([null]);
    return () => activeRequest.current?.abort();
  }, [load]);

  return {
    page,
    loading,
    error,
    pageNumber: cursors.length,
    previous:
      cursors.length > 1 ? () => void load(cursors.slice(0, -1)) : undefined,
    next: page?.nextCursor
      ? () => void load([...cursors, page.nextCursor])
      : undefined,
    refresh: () => void load([null]),
    retry: () => void load(requestedHistory.current),
  };
}
