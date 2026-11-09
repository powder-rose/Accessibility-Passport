export const leadSubmissionTimeout = {
  json: 30_000,
  attachments: 120_000,
} as const;

export const leadSubmissionMessages = {
  timeout:
    'Ответ сервера задерживается. Данные остались в форме. Повторите отправку.',
  confirmation:
    'Не удалось подтвердить сохранение заявки. Проверьте соединение и повторите отправку.',
} as const;

export class LeadSubmissionError extends Error {}

export async function sendLeadRequest({
  body,
  requestId,
  signal,
  timeoutMs = typeof body === 'string'
    ? leadSubmissionTimeout.json
    : leadSubmissionTimeout.attachments,
  fetcher = fetch,
}: {
  body: string | FormData;
  requestId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}): Promise<void> {
  const controller = new AbortController();
  let timedOut = false;
  let interrupt: (error: Error) => void = () => {};
  const interruption = new Promise<never>((_resolve, reject) => {
    interrupt = reject;
  });
  const cancel = () => {
    interrupt(new LeadSubmissionError(leadSubmissionMessages.confirmation));
    controller.abort();
  };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => {
    timedOut = true;
    interrupt(new LeadSubmissionError(leadSubmissionMessages.timeout));
    controller.abort();
  }, timeoutMs);
  try {
    await Promise.race([perform(), interruption]);
  } catch (error) {
    if (timedOut) throw new LeadSubmissionError(leadSubmissionMessages.timeout);
    if (error instanceof LeadSubmissionError) throw error;
    throw new LeadSubmissionError(leadSubmissionMessages.confirmation);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }

  async function perform() {
    if (controller.signal.aborted)
      throw new LeadSubmissionError(leadSubmissionMessages.confirmation);
    const response = await fetcher('/api/leads', {
      method: 'POST',
      redirect: 'error',
      ...(typeof body === 'string'
        ? { headers: { 'Content-Type': 'application/json' } }
        : {}),
      body,
      signal: controller.signal,
    });
    const value: unknown = await response.json();
    // Do not accept a response that arrived after cancellation/deadline.
    if (controller.signal.aborted)
      throw new LeadSubmissionError(leadSubmissionMessages.confirmation);
    const result =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
    if (!response.ok || result?.ok !== true || result.id !== requestId) {
      throw new LeadSubmissionError(
        !response.ok && typeof result?.error === 'string' && result.error
          ? result.error
          : leadSubmissionMessages.confirmation,
      );
    }
  }
}
