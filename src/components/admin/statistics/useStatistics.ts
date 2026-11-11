import { useEffect, useState } from 'react';
import type {
  AdminStatistics,
  StatisticsDays,
} from '@/features/statistics/model';
import { adminRequest, AdminRequestError } from '@/lib/admin-request';

export function useStatistics(onSessionExpired: () => void) {
  const [days, setDays] = useState<StatisticsDays>(30);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<AdminStatistics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    adminRequest<AdminStatistics>('/api/admin/statistics?days=' + days, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (
          error instanceof AdminRequestError &&
          (error.status === 401 || error.status === 403)
        ) {
          onSessionExpired();
          return;
        }
        setError(
          error instanceof Error
            ? error.message
            : 'Не удалось загрузить статистику.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, revision, onSessionExpired]);
  return {
    days,
    setDays,
    data,
    loading,
    error,
    refresh: () => setRevision((value) => value + 1),
  };
}
