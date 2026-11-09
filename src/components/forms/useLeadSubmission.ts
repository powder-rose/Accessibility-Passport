import { useEffect, useRef, useState } from 'react';
import { attribution } from '@/lib/analytics';
import { createRequestId } from '@/lib/request-id';
import type { SelectedAttachment } from '@/lib/attachments';
import {
  LeadSubmissionError,
  leadSubmissionMessages,
  sendLeadRequest,
} from '@/lib/lead-submission';
export function useLeadSubmission() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const startedAt = useRef(Date.now());
  const request = useRef({ signature: '', id: '' });
  const lock = useRef(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function submit(
    payload: Record<string, unknown>,
    attachments: SelectedAttachment[] = [],
  ) {
    if (lock.current) return false;
    lock.current = true;
    const operation = new AbortController();
    active.current = operation;
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
      await sendLeadRequest({
        body: attachments.length ? form : json,
        requestId: request.current.id,
        signal: operation.signal,
      });
      if (operation.signal.aborted) return false;
      setSuccess(true);
      return true;
    } catch (error) {
      if (!operation.signal.aborted)
        setError(
          error instanceof LeadSubmissionError
            ? error.message
            : leadSubmissionMessages.confirmation,
        );
      return false;
    } finally {
      lock.current = false;
      if (active.current === operation) active.current = null;
      if (!operation.signal.aborted) setPending(false);
    }
  }
  return { submit, pending, error, success };
}
