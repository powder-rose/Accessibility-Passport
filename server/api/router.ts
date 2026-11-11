import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import type { Config } from '../config';
import type { Store } from '../db/store';
import type { Diagnostics } from '../diagnostics';
import type { ApiHandler } from './context';
import * as leads from './leads';
import * as login from './admin-login';
import * as adminLeads from './admin-leads';
import { jsonError } from './security';
import * as attachments from './attachments';
import { articleEndpoint } from '../articles/api';
import * as storage from './storage';
import * as statistics from './statistics';

const endpoints: Record<string, Record<string, ApiHandler>> = {
  '/api/leads': { POST: leads.POST },
  '/api/analytics/pageview': { POST: statistics.pageview },
  '/api/admin/statistics': { GET: statistics.report },
  '/api/admin/login': { POST: login.POST, DELETE: login.DELETE },
  '/api/admin/leads': { GET: adminLeads.GET },
  '/api/admin/session': { GET: adminLeads.SESSION },
  '/api/admin/storage': { GET: storage.report },
  '/api/admin/storage/cleanup': { GET: storage.preview, POST: storage.cleanup },
  '/api/attachment-limits': { GET: attachments.limits },
  '/api/admin/attachment-settings': {
    GET: attachments.settings,
    PUT: attachments.settings,
  },
};
export function apiRouter(
  config: Config,
  store: Store,
  diagnostics: Diagnostics,
) {
  return async (req: ExpressRequest, res: ExpressResponse) => {
    const origin = config.appOrigin || req.protocol + '://' + req.get('host');
    const url = new URL(req.originalUrl, origin);
    const path = url.pathname.replace(/\/$/, '');
    const endpoint = /^\/api\/admin\/attachments\/[a-f0-9-]{36}$/.test(path)
      ? { GET: attachments.download }
      : endpoints[path] || articleEndpoint(path);
    let response: Response;
    const handler = endpoint?.[req.method];
    if (!endpoint) response = jsonError('Страница не найдена.', 404);
    else if (!handler)
      response = new Response(null, {
        status: 405,
        headers: { Allow: Object.keys(endpoint).join(', ') },
      });
    else {
      if (req.method === 'POST' || req.method === 'PUT') {
        const multipart =
          ['/api/leads', '/api/admin/article-images'].includes(path) &&
          req
            .get('content-type')
            ?.toLowerCase()
            .startsWith('multipart/form-data;');
        if (
          !multipart &&
          !req.get('content-type')?.toLowerCase().startsWith('application/json')
        ) {
          res.status(415).json({ error: 'Ожидается JSON.' });
          return;
        }
        try {
          if (!multipart) {
            JSON.parse(
              Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '',
            );
          }
        } catch {
          res.status(400).json({ error: 'Некорректный JSON.' });
          return;
        }
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const request = new Request(url, {
        method: req.method,
        headers,
        ...(req.method === 'POST' || req.method === 'PUT'
          ? { body: new Uint8Array(req.body as Buffer) }
          : {}),
      });
      response = await handler(request, {
        config,
        store,
        diagnostics,
        clientIp: req.ip || req.socket.remoteAddress || 'unknown',
      });
    }
    res.status(response.status);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    // Preserve bodyless HEAD metadata instead of replacing its length by 0.
    if (req.method === 'HEAD' && response.body === null) res.send();
    else res.send(Buffer.from(await response.arrayBuffer()));
  };
}
