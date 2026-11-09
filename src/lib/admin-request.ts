export const adminRequestTimeout = {
  json: 30_000,
  image: 120_000,
  storage: 15_000,
} as const;

export const adminRequestMessages = {
  timeout: 'Ответ сервера задерживается. Повторите загрузку.',
  network: 'Не удалось связаться с сервером. Проверьте соединение.',
  response: 'Не удалось прочитать ответ сервера. Повторите загрузку.',
  unconfirmed:
    'Сервер не подтвердил результат операции. Проверьте состояние перед повтором.',
  aborted: 'Запрос отменён.',
} as const;

type RequestFailure = 'timeout' | 'network' | 'response' | 'aborted' | 'http';
export class AdminRequestError extends Error {
  constructor(
    message: string,
    readonly kind: RequestFailure,
    readonly status?: number,
  ) {
    super(message);
  }
}
export interface AdminRequestPolicy {
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export const adminJson = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function adminRequest<T>(
  path: string,
  options: RequestInit = {},
  {
    timeoutMs = adminRequestTimeout.json,
    fetcher = fetch,
  }: AdminRequestPolicy = {},
): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000)
    throw new RangeError('Invalid administrator request deadline.');
  const controller = new AbortController();
  const read = ['GET', 'HEAD'].includes(
    (options.method || 'GET').toUpperCase(),
  );
  let responseStatus: number | undefined;
  let interruption: AdminRequestError | undefined;
  let interrupt: (error: AdminRequestError) => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    interrupt = reject;
  });
  const stop = (kind: 'timeout' | 'aborted') => {
    if (interruption) return;
    interruption = new AdminRequestError(
      kind === 'aborted'
        ? adminRequestMessages.aborted
        : read
          ? adminRequestMessages.timeout
          : adminRequestMessages.unconfirmed,
      kind,
      responseStatus,
    );
    interrupt(interruption);
    controller.abort();
  };
  const cancel = () => stop('aborted');
  const signal = options.signal;
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => stop('timeout'), timeoutMs);
  try {
    const result = await Promise.race([perform(), interrupted]);
    if (interruption) throw interruption;
    return result;
  } catch (error) {
    if (interruption) throw interruption;
    if (error instanceof AdminRequestError) throw error;
    throw new AdminRequestError(
      read ? adminRequestMessages.network : adminRequestMessages.unconfirmed,
      'network',
      responseStatus,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }

  async function perform(): Promise<T> {
    if (interruption) throw interruption;
    const response = await fetcher(path, {
      ...options,
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
    });
    responseStatus = response.status;
    if (interruption) throw interruption;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (interruption) throw interruption;
      throw new AdminRequestError(
        read ? adminRequestMessages.response : adminRequestMessages.unconfirmed,
        'response',
        response.status,
      );
    }
    if (interruption) throw interruption;
    if (!response.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? body.error
          : undefined;
      throw new AdminRequestError(
        typeof message === 'string' && message
          ? message
          : 'Не удалось выполнить действие.',
        'http',
        response.status,
      );
    }
    return body as T;
  }
}
