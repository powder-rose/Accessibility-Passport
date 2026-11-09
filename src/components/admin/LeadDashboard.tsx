import LeadList from './LeadList';
import AttachmentSettings from './AttachmentSettings';
import { useLeadPages } from './useLeadPages';

export default function LeadDashboard({
  error,
  onSessionExpired,
}: {
  error: string;
  onSessionExpired: () => void;
}) {
  const list = useLeadPages(onSessionExpired);
  return (
    <section>
      <h1 className="cms-section-title">Заявки</h1>
      <AttachmentSettings />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="cms-leads-toolbar">
        <p role="status" aria-live="polite">
          {list.loading
            ? 'Загрузка заявок…'
            : list.page
              ? `Всего заявок: ${list.page.total}`
              : 'Список не загружен.'}
        </p>
        <button
          className="cms-leads-button"
          type="button"
          disabled={list.loading}
          onClick={list.refresh}
        >
          Обновить список
        </button>
      </div>
      {list.error && (
        <div className="cms-leads-error">
          <p className="form-error" role="alert">
            {list.error}
          </p>
          <button
            className="cms-leads-button"
            type="button"
            disabled={list.loading}
            onClick={list.retry}
          >
            Повторить загрузку
          </button>
        </div>
      )}
      <div aria-busy={list.loading}>
        {list.page && <LeadList leads={list.page.leads} />}
      </div>
      {list.page && list.page.total > 0 && (
        <nav className="cms-leads-pagination" aria-label="Страницы заявок">
          <button
            className="cms-leads-button"
            type="button"
            disabled={list.loading || !list.previous}
            onClick={list.previous}
          >
            Назад
          </button>
          <p>Страница {list.pageNumber}</p>
          <button
            className="cms-leads-button"
            type="button"
            disabled={list.loading || !list.next}
            onClick={list.next}
          >
            Далее
          </button>
        </nav>
      )}
    </section>
  );
}
