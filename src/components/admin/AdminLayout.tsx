import { lazy, Suspense, type ReactNode } from 'react';
const StoragePanel = lazy(() => import('./storage/StoragePanel'));
export default function AdminLayout({
  children,
  path,
  busy,
  onLogout,
}: {
  children: ReactNode;
  path: string;
  busy: boolean;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="cms">
      <header className="cms-header">
        <a href="/" className="brand">
          БОЙКОВГРУПП<span>Администрирование</span>
        </a>
        <nav className="cms-navigation" aria-label="Разделы админки">
          <a
            href="/admin/"
            aria-current={
              !path.startsWith('/admin/articles') ? 'page' : undefined
            }
          >
            Заявки
          </a>
          <a
            href="/admin/articles/"
            aria-current={
              path.startsWith('/admin/articles') ? 'page' : undefined
            }
          >
            Статьи
          </a>
        </nav>
        <a href="/" target="_blank" rel="noopener noreferrer">
          Открыть сайт ↗
        </a>
        <button type="button" disabled={busy} onClick={onLogout}>
          Выйти
        </button>
      </header>
      <Suspense fallback={<p role="status">Загрузка хранилища…</p>}>
        <StoragePanel />
      </Suspense>
      <main className="cms-content">{children}</main>
    </div>
  );
}
