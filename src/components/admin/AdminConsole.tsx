import { useCallback, useEffect, useState } from 'react';
import AdminLogin from './AdminLogin';
import LeadDashboard from './LeadDashboard';
import type { LeadRecord } from './types';

export default function AdminConsole() {
  const [status, setStatus] = useState<'loading' | 'guest' | 'authenticated'>('loading');
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const loadLeads = useCallback(async () => {
    const response = await fetch('/api/admin/leads');
    if (response.status === 401 || response.status === 403) {
      setStatus('guest');
      return;
    }
    const result = (await response.json()) as { error?: string; leads: LeadRecord[] };
    if (!response.ok) throw new Error(result.error || 'Не удалось загрузить заявки.');
    setLeads(result.leads);
    setStatus('authenticated');
  }, []);
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
            if (!response.ok) throw new Error(result.error || 'Не удалось войти.');
            await loadLeads();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось войти.');
          }
        }}
      />
    );
  return (
    <LeadDashboard
      leads={leads}
      error={error}
      busy={busy}
      onLogout={async () => {
        setBusy(true);
        setError('');
        try {
          const response = await fetch('/api/admin/login', { method: 'DELETE' });
          if (!response.ok) throw new Error('Не удалось выйти.');
          setLeads([]);
          setStatus('guest');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Не удалось выйти.');
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
