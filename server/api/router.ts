import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type { Config } from '../config';
import type { Store } from '../db/store';
import type { ApiHandler } from './context';
import * as leads from './leads';
import * as login from './admin-login';
import * as adminLeads from './admin-leads';
import { jsonError } from './security';

const endpoints: Record<string, Record<string, ApiHandler>> = {
  '/api/leads': { POST: leads.POST },
  '/api/admin/login': { POST: login.POST, DELETE: login.DELETE },
  '/api/admin/leads': { GET: adminLeads.GET },
};
export function apiRouter(config: Config, store: Store) {
  return async (req: ExpressRequest, res: ExpressResponse) => {
    const origin = config.appOrigin || req.protocol + '://' + req.get('host');
    const url = new URL(req.originalUrl, origin);
    const path = url.pathname.replace(/\/$/, '');
    const endpoint = endpoints[path];
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
        if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) {
          res.status(415).json({ error: 'Ожидается JSON.' });
          return;
        }
        try {
          JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
        } catch {
          res.status(400).json({ error: 'Некорректный JSON.' });
          return;
        }
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const request = new Request(url, {
        method: req.method,
        headers,
        ...(req.method === 'POST' || req.method === 'PUT'
          ? { body: req.body.toString('utf8') as string }
          : {}),
      });
      response = await handler(request, {
        config,
        store,
        clientIp: req.ip || req.socket.remoteAddress || 'unknown',
      });
    }
    res.status(response.status);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.send(Buffer.from(await response.arrayBuffer()));
  };
}
