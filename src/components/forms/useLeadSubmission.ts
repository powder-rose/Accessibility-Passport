import { useRef, useState } from 'react';
import { attribution } from '@/lib/analytics';
import { createRequestId } from '@/lib/request-id';
export function useLeadSubmission() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const startedAt = useRef(Date.now());
  const request = useRef({ signature: '', id: '' });
  const lock = useRef(false);
  async function submit(payload: Record<string, unknown>) {
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
      const signature = JSON.stringify(data);
      if (request.current.signature !== signature)
        request.current = { signature, id: createRequestId() };
      const result = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, requestId: request.current.id }),
      });
      const body = (await result.json()) as { error?: string; ok?: boolean };
      if (!result.ok || body.ok !== true)
        throw new Error(body.error || 'Не удалось отправить заявку. Повторите попытку.');
      setSuccess(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить заявку. Повторите попытку.');
      return false;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return { submit, pending, error, success };
}
