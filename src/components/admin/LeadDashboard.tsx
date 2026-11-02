import LeadList from './LeadList';
import type { LeadRecord } from './types';

interface Props {
  leads: LeadRecord[];
  error: string;
  busy: boolean;
  onLogout: () => Promise<void>;
}
export default function LeadDashboard({ leads, error, busy, onLogout }: Props) {
  return (
    <main className="cms">
      <header className="cms-header">
        <a href="/" className="brand">
          БОЙКОВГРУПП<span>Заявки</span>
        </a>
        <a href="/" target="_blank" rel="noopener">
          Открыть страницу ↗
        </a>
        <button type="button" disabled={busy} onClick={onLogout}>
          Выйти
        </button>
      </header>
      <section className="cms-content">
        <h1>Заявки</h1>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <LeadList leads={leads} />
      </section>
    </main>
  );
}
