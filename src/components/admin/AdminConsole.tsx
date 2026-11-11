import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { SiteContent } from '@/lib/content-types';
import {
  adminJson,
  adminRequest,
  AdminRequestError,
} from '@/lib/admin-request';
import AdminLayout from './AdminLayout';
const ArticlesWorkspace = lazy(() => import('./articles/ArticlesWorkspace'));

import AdminLogin from './AdminLogin';
const LeadDashboard = lazy(() => import('./LeadDashboard'));

export default function AdminConsole({
  path = '/admin/',
  site,
}: {
  path?: string;
  site: SiteContent['site'];
}) {
  const [status, setStatus] = useState<'loading' | 'guest' | 'authenticated'>(
    'loading',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const loadSession = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await adminRequest<{ authenticated?: boolean }>(
        '/api/admin/session',
        { signal },
      );
      if (signal?.aborted) return;
      if (result?.authenticated !== true)
        throw new Error('Не удалось подтвердить сессию.');
      setStatus('authenticated');
    } catch (error) {
      if (signal?.aborted) return;
      if (
        error instanceof AdminRequestError &&
        (error.status === 401 || error.status === 403)
      ) {
        setStatus('guest');
        return;
      }
      throw error;
    }
  }, []);
  const sessionExpired = useCallback(() => {
    setError('Сессия завершена. Войдите снова.');
    setStatus('guest');
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadSession(controller.signal).catch((e) => {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Не удалось загрузить заявки.');
      setStatus('guest');
    });
    return () => controller.abort();
  }, [loadSession]);

  if (status === 'loading')
    return (
      <main className="cms-login">
        <p role="status">Загрузка…</p>
      </main>
    );
  if (status === 'guest')
    return (
      <AdminLogin
        error={error}
        onLogin={async (password) => {
          setError('');
          try {
            await adminRequest(
              '/api/admin/login',
              adminJson('POST', { password }),
            );
            await loadSession();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось войти.');
          }
        }}
      />
    );
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await adminRequest('/api/admin/login', { method: 'DELETE' });
      setStatus('guest');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось выйти.');
    } finally {
      setBusy(false);
    }
  }
  const workspace = (
    <Suspense fallback={<p role="status">Загрузка редактора…</p>}>
      <ArticlesWorkspace path={path} site={site} />
    </Suspense>
  );
  if (path === '/admin/articles/preview/') return workspace;
  return (
    <AdminLayout path={path} busy={busy} onLogout={logout}>
      {path.startsWith('/admin/articles') ? (
        <>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {workspace}
        </>
      ) : (
        <Suspense fallback={<p role="status">Загрузка заявок и статистики…</p>}>
          <LeadDashboard error={error} onSessionExpired={sessionExpired} />
        </Suspense>
      )}
    </AdminLayout>
  );
}
