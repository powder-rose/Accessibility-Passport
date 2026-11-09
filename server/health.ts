import type { RequestHandler } from 'express';
import type { Store } from './db/store';

export function healthHandler(store: Store): RequestHandler {
  return (request, response) => {
    response
      .set('Cache-Control', 'no-store')
      .set('X-Robots-Tag', 'noindex, nofollow');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.status(405).set('Allow', 'GET, HEAD').json({ ok: false });
      return;
    }
    const ok = store.isAvailable();
    response.status(ok ? 200 : 503).json({ ok });
  };
}
