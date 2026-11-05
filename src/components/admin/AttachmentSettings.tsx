import { useEffect, useState } from 'react';
import {
  attachmentLimitsSchema,
  MiB,
  type AttachmentLimits,
} from '@/lib/attachments';

export default function AttachmentSettings() {
  const [limits, setLimits] = useState<AttachmentLimits>();
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/attachment-settings', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Не удалось загрузить настройки вложений.');
        setLimits(attachmentLimitsSchema.parse(await response.json()));
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setStatus(
            error instanceof Error ? error.message : 'Ошибка загрузки.',
          );
      });
    return () => controller.abort();
  }, []);
  return (
    <details className="cms-attachment-settings">
      <summary>Лимиты вложений</summary>
      {limits && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setStatus('');
            const data = new FormData(event.currentTarget);
            try {
              const response = await fetch('/api/admin/attachment-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  maxFiles: Number(data.get('count')),
                  maxFileBytes: Number(data.get('file')) * MiB,
                  maxTotalBytes: Number(data.get('total')) * MiB,
                }),
              });
              const body = (await response.json()) as { error?: string };
              if (!response.ok)
                throw new Error(
                  body.error || 'Не удалось сохранить настройки.',
                );
              setLimits(attachmentLimitsSchema.parse(body));
              setStatus('Настройки сохранены.');
            } catch (error) {
              setStatus(
                error instanceof Error
                  ? error.message
                  : 'Не удалось сохранить настройки.',
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            Количество файлов (1–10)
            <input
              name="count"
              type="number"
              min={1}
              max={10}
              step={1}
              required
              defaultValue={limits.maxFiles}
            />
          </label>
          <label>
            Один файл, МБ (1–10)
            <input
              name="file"
              type="number"
              min={1}
              max={10}
              step={1}
              required
              defaultValue={limits.maxFileBytes / MiB}
            />
          </label>
          <label>
            Все файлы, МБ (1–30)
            <input
              name="total"
              type="number"
              min={1}
              max={30}
              step={1}
              required
              defaultValue={limits.maxTotalBytes / MiB}
            />
          </label>
          <button type="submit" disabled={pending}>
            {pending ? 'Сохранение…' : 'Сохранить лимиты'}
          </button>
        </form>
      )}
      {status && <p role="status">{status}</p>}
    </details>
  );
}
