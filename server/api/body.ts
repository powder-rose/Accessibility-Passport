import express, { type RequestHandler } from 'express';
import type { Config } from '../config';
import type { Store } from '../db/store';
import type { Diagnostics } from '../diagnostics';
import { rateLimit, adminAuthenticated } from './security';

export function apiBody(
  config: Config,
  store: Store,
  diagnostics: Diagnostics,
): RequestHandler {
  const jsonBody = express.raw({
    type: () => true,
    limit: '512kb',
    inflate: false,
  });
  const articleBody = express.raw({
    type: () => true,
    limit: '1mb',
    inflate: false,
  });
  const statisticsBody = express.raw({
    type: () => true,
    limit: '2kb',
    inflate: false,
  });
  return async (req, res, next) => {
    const path = req.originalUrl.split('?')[0].replace(/\/$/, '');
    const articleImage = path === '/api/admin/article-images';
    const isUpload =
      req.method === 'POST' &&
      (path === '/api/leads' || articleImage) &&
      req.get('content-type')?.toLowerCase().startsWith('multipart/form-data;');
    if (!isUpload) {
      (path === '/api/analytics/pageview'
        ? statisticsBody
        : path.startsWith('/api/admin/articles')
          ? articleBody
          : jsonBody)(req, res, next);
      return;
    }
    const origin = config.appOrigin || req.protocol + '://' + req.get('host');
    if (req.get('origin') !== origin) {
      res.status(403).json({ error: 'Недопустимый источник запроса.' });
      return;
    }
    if (
      articleImage &&
      !(await adminAuthenticated(
        new Request(origin + path, {
          headers: { Cookie: req.get('cookie') || '' },
        }),
        { config, store, diagnostics, clientIp: req.ip || 'unknown' },
      ))
    ) {
      res.status(401).json({ error: 'Нет доступа.' });
      return;
    }
    const allowed = await rateLimit(
      {
        config,
        store,
        diagnostics,
        clientIp: req.ip || req.socket.remoteAddress || 'unknown',
      },
      articleImage ? 'article-image' : 'upload',
      20,
      600,
    );
    if (!allowed) {
      res
        .status(429)
        .json({ error: 'Слишком много запросов. Попробуйте позже.' });
      return;
    }
    const limit =
      (articleImage
        ? 5 * 1024 * 1024
        : store.getAttachmentLimits().maxTotalBytes) +
      64 * 1024;
    if (Number(req.get('content-length') || 0) > limit) {
      res.status(413).json({ error: 'Слишком большой запрос.' });
      return;
    }
    express.raw({ type: () => true, limit, inflate: false })(req, res, next);
  };
}
