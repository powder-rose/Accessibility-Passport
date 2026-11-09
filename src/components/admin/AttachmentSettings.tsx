import { useEffect, useState } from 'react';
import {
  attachmentLimitsSchema,
  MiB,
  type AttachmentLimits,
} from '@/lib/attachments';
import { adminJson, adminRequest } from '@/lib/admin-request';

export default function AttachmentSettings() {
  const [limits, setLimits] = useState<AttachmentLimits>();
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    adminRequest<unknown>('/api/admin/attachment-settings', {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted)
          setLimits(attachmentLimitsSchema.parse(result));
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
              const body = await adminRequest<unknown>(
                '/api/admin/attachment-settings',
                adminJson('PUT', {
                  maxFiles: Number(data.get('count')),
                  maxFileBytes: Number(data.get('file')) * MiB,
                  maxTotalBytes: Number(data.get('total')) * MiB,
                }),
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
