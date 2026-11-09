import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  cleanupPreviewSchema,
  storageLevel,
  storageReportSchema,
  storageSize,
  type CleanupPreview,
  type StorageReport,
} from '@/lib/storage';
import { articleJson, articleRequest } from '../articles/api';
import { draftImageIds, newArticleDraftKey } from '../articles/local-draft';
import StorageUsage from './StorageUsage';
import StorageCleanup from './StorageCleanup';
import '@/styles/admin-storage.css';

const readDraft = () => {
  try {
    return draftImageIds(localStorage.getItem(newArticleDraftKey));
  } catch {
    throw new Error(
      'Не удалось проверить локальный черновик. Сохраните статью перед очисткой.',
    );
  }
};
function storageRequest(path: string, options: RequestInit = {}) {
  const timeout = AbortSignal.timeout(15000);
  return articleRequest<unknown>(path, {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout,
  });
}
const removedSchema = z.object({
  ok: z.literal(true),
  removed: z.object({
    count: z.number().int().positive(),
    bytes: z.number().int().nonnegative(),
  }),
});
export default function StoragePanel() {
  const [report, setReport] = useState<StorageReport>();
  const [preview, setPreview] = useState<CleanupPreview>();
  const [protectedIds, setProtectedIds] = useState(new Set<string>());
  const [selected, setSelected] = useState(new Set<string>());
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const previewButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  async function loadReport(signal?: AbortSignal) {
    const value = await storageRequest('/api/admin/storage', {
      signal,
    });
    setReport(storageReportSchema.parse(value));
  }
  useEffect(() => {
    const controller = new AbortController();
    loadReport(controller.signal).catch(() => {
      if (!controller.signal.aborted)
        setError('Не удалось загрузить хранилище. Обновите данные.');
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!pending && returnFocus.current) {
      previewButton.current?.focus();
      returnFocus.current = false;
    }
  }, [pending]);
  async function action(work: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError('');
    setStatus('');
    try {
      await work();
    } catch (error) {
      setError(
        error instanceof DOMException &&
          ['TimeoutError', 'AbortError'].includes(error.name)
          ? 'Сервер не подтвердил операцию. Обновите данные и предпросмотр перед повтором.'
          : error instanceof Error && !(error instanceof z.ZodError)
            ? error.message
            : 'Не удалось выполнить действие. Обновите данные.',
      );
    } finally {
      setPending(false);
    }
  }
  async function showPreview() {
    setPreview(undefined);
    setSelected(new Set());
    setConfirmed(false);
    setProtectedIds(readDraft());
    const result = await storageRequest('/api/admin/storage/cleanup');
    setPreview(cleanupPreviewSchema.parse(result));
    await loadReport();
  }
  async function remove() {
    if (!preview || !confirmed || !selected.size) return;
    const draft = readDraft();
    if ([...selected].some((id) => draft.has(id))) {
      setProtectedIds(draft);
      setSelected(new Set());
      setConfirmed(false);
      throw new Error(
        'Локальный черновик изменился. Его изображения защищены; выберите файлы заново.',
      );
    }
    const images = preview.images
      .filter((image) => selected.has(image.id))
      .map(({ id, sha256 }) => ({ id, sha256 }));
    // A lost response must require a fresh preview, never a wider retry.
    returnFocus.current = true;
    setPreview(undefined);
    setSelected(new Set());
    setConfirmed(false);
    const result = removedSchema.parse(
      await storageRequest(
        '/api/admin/storage/cleanup',
        articleJson('POST', { confirm: true, images }),
      ),
    );
    if (result.removed.count !== images.length)
      throw new Error('Не удалось подтвердить результат. Обновите данные.');
    setStatus(
      `Удалено изображений: ${result.removed.count}. Освобождено в квоте: ${storageSize(result.removed.bytes)}.`,
    );
    await loadReport();
  }
  const warning =
    report &&
    Object.values(report).some((usage) => storageLevel(usage) !== 'ok');
  return (
    <aside className="cms-storage" aria-label="Хранилище файлов">
      <details>
        <summary>
          Хранилище файлов{' '}
          <span aria-live="polite">
            {report
              ? `${storageSize(report.attachments.bytes)} вложений · ${storageSize(report.images.bytes)} изображений${warning ? ' · Мало свободного места' : ''}`
              : error
                ? 'Не удалось загрузить данные'
                : 'Загрузка…'}
          </span>
        </summary>
        <div className="cms-storage-content" aria-busy={pending}>
          {report && (
            <div className="cms-storage-usages">
              <StorageUsage
                title="Вложения заявок"
                usage={report.attachments}
              />
              <StorageUsage title="Изображения статей" usage={report.images} />
            </div>
          )}
          <p>
            Показан объём файлов в пределах квот. Размер базы, служебных файлов
            и свободное место на диске учитываются отдельно.
          </p>
          <div className="cms-storage-actions">
            <button
              className="cms-leads-button"
              type="button"
              disabled={pending}
              onClick={() => action(() => loadReport())}
            >
              Обновить данные
            </button>
            <button
              className="cms-leads-button"
              type="button"
              disabled={pending}
              onClick={() => action(showPreview)}
              ref={previewButton}
            >
              Посмотреть изображения для очистки
            </button>
          </div>
          <p>
            Сохранённые статьи, черновики и удалённые статьи защищают свои
            изображения. Для очистки доступны только файлы старше семи дней без
            таких связей. Сначала сохраните несохранённые правки во всех
            вкладках и браузерах: сервер их не видит. Вложения заявок здесь не
            удаляются.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {status && <p role="status">{status}</p>}
          {pending && <p role="status">Выполняется…</p>}
          {preview && (
            <StorageCleanup
              preview={preview}
              selected={selected}
              protectedIds={protectedIds}
              confirmed={confirmed}
              pending={pending}
              onSelect={(id) => {
                setConfirmed(false);
                setSelected((previous) => {
                  const next = new Set(previous);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onConfirm={setConfirmed}
              onRemove={() => action(remove)}
            />
          )}
        </div>
      </details>
    </aside>
  );
}
