import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { SiteContent } from '@/lib/content-types';
import AdminLayout from './AdminLayout';
const ArticlesWorkspace = lazy(() => import('./articles/ArticlesWorkspace'));

import AdminLogin from './AdminLogin';
import LeadDashboard from './LeadDashboard';
import type { LeadRecord } from './types';

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
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const loadLeads = useCallback(async () => {
    const response = await fetch(
      path.startsWith('/admin/articles')
        ? '/api/admin/session'
        : '/api/admin/leads',
    );
    if (response.status === 401 || response.status === 403) {
      setStatus('guest');
      return;
    }
    const result = (await response.json()) as {
      error?: string;
      leads?: LeadRecord[];
    };
    if (!response.ok)
      throw new Error(result.error || 'Не удалось загрузить заявки.');
    setLeads(result.leads || []);
    setStatus('authenticated');
  }, [path]);
  useEffect(() => {
    loadLeads().catch((e) => {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить заявки.');
      setStatus('guest');
    });
  }, [loadLeads]);

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
            const response = await fetch('/api/admin/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password }),
            });
            const result = (await response.json()) as { error?: string };
            if (!response.ok)
              throw new Error(result.error || 'Не удалось войти.');
            await loadLeads();
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
      const response = await fetch('/api/admin/login', { method: 'DELETE' });
      if (!response.ok) throw new Error('Не удалось выйти.');
      setLeads([]);
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
        workspace
      ) : (
        <LeadDashboard leads={leads} error={error} />
      )}
    </AdminLayout>
  );
}
