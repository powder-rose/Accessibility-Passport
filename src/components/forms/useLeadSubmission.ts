import { useRef, useState } from 'react';
import { attribution } from '@/lib/analytics';
import { createRequestId } from '@/lib/request-id';
import type { SelectedAttachment } from '@/lib/attachments';
export function useLeadSubmission() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const startedAt = useRef(Date.now());
  const request = useRef({ signature: '', id: '' });
  const lock = useRef(false);
  async function submit(
    payload: Record<string, unknown>,
    attachments: SelectedAttachment[] = [],
  ) {
    if (lock.current) return false;
    lock.current = true;
    setPending(true);
    setError('');
    try {
      const data = {
        ...payload,
        pageUrl: location.href.split('#')[0],
        utm: attribution(),
        startedAt: startedAt.current,
      };
      const signature = JSON.stringify({
        data,
        files: attachments.map(({ file, kind, key }) => ({
          kind,
          key,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
        })),
      });
      if (request.current.signature !== signature)
        request.current = { signature, id: createRequestId() };
      const json = JSON.stringify({ ...data, requestId: request.current.id });
      const form = new FormData();
      if (attachments.length) {
        form.set('data', json);
        attachments.forEach(({ file, kind }) =>
          form.append(`attachment:${kind}`, file),
        );
      }
      const result = await fetch('/api/leads', {
        method: 'POST',
        ...(attachments.length
          ? {}
          : { headers: { 'Content-Type': 'application/json' } }),
        body: attachments.length ? form : json,
      });
      const body = (await result.json()) as { error?: string; ok?: boolean };
      if (!result.ok || body.ok !== true)
        throw new Error(
          body.error || 'Не удалось отправить заявку. Повторите попытку.',
        );
      setSuccess(true);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Не удалось отправить заявку. Повторите попытку.',
      );
      return false;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return { submit, pending, error, success };
}
