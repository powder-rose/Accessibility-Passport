import express, { type ErrorRequestHandler } from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ViteDevServer } from 'vite';
import type { Config } from './config';
import { Store } from './db/store';
import { getSiteContent } from './content';
import { apiRouter } from './api/router';
import { apiBody } from './api/body';
import { canonicalPath, createPageData } from './page-data';
import { buildHead, robotsText, scriptJson, sitemapXml } from './seo';
import { healthHandler } from './health';
import { configureAdmin } from './auth/service';
import { Diagnostics } from './diagnostics';

export async function createApplication(config: Config) {
  const root = process.cwd();
  const app = express();
  const store = new Store(config.databasePath);
  const diagnostics = new Diagnostics();
  configureAdmin(config, store);
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });
  app.all(/^\/healthz\/?$/, healthHandler(store));
  app.use(
    '/api',
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      next();
    },
    apiBody(config, store, diagnostics),
    apiRouter(config, store, diagnostics),
  );
  app.use('/media/articles', apiRouter(config, store, diagnostics));

  app.get('/robots.txt', (_req, res) =>
    res
      .type('text/plain')
      .set('Cache-Control', 'no-cache')
      .send(robotsText(getSiteContent())),
  );
  app.get('/sitemap.xml', (_req, res) =>
    res
      .type('application/xml')
      .set('Cache-Control', 'no-cache')
      .send(
        sitemapXml(getSiteContent(), store.articles.queries.publishedSlugs()),
      ),
  );
  app.use((req, res, next) => {
    const target = canonicalPath(req.path);
    if ((req.method === 'GET' || req.method === 'HEAD') && target) {
      const query = req.originalUrl.includes('?')
        ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
        : '';
      res.redirect(308, target + query);
      return;
    }
    next();
  });
  let vite: ViteDevServer | undefined;
  if (!config.production) {
    const { createServer } = await import('vite');
    vite = await createServer({
      server: {
        middlewareMode: true,
        allowedHosts: ['localhost', '127.0.0.1', 'terminal.local'],
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      '/assets',
      express.static(resolve(root, 'dist/client/assets'), {
        immutable: true,
        maxAge: '1y',
        index: false,
        redirect: false,
      }),
    );
    app.use(
      express.static(resolve(root, 'dist/client'), {
        index: false,
        redirect: false,
        maxAge: '1d',
        dotfiles: 'deny',
      }),
    );
  }
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res
        .status(405)
        .set('Allow', 'GET, HEAD')
        .send('Метод не поддерживается.');
      return;
    }
    if (config.production && /^\/(?:assets|images|fonts)\//.test(req.path)) {
      res
        .status(404)
        .type('text/plain')
        .set('X-Robots-Tag', 'noindex')
        .send('Файл не найден.');
      return;
    }
    try {
      const url = new URL(
        req.originalUrl,
        config.appOrigin || req.protocol + '://' + req.get('host'),
      );
      const { data, status, redirect } = createPageData(
        url,
        getSiteContent(),
        store.articles,
      );
      if (redirect) {
        res.redirect(301, redirect + url.search);
        return;
      }
      const renderer = vite
        ? await vite.ssrLoadModule('/src/entry-server.tsx')
        : await import('../src/entry-server');
      let template = readFileSync(
        resolve(
          root,
          config.production ? 'dist/client/index.html' : 'index.html',
        ),
        'utf8',
      );
      if (vite)
        template = await vite.transformIndexHtml(req.originalUrl, template);
      const html = template
        .replace('<!--app-head-->', () => buildHead(data, url.pathname))
        .replace('<!--app-html-->', () => renderer.render(data))
        .replace('<!--app-data-->', () => scriptJson(data));
      res
        .status(status)
        .type('html')
        .set('Cache-Control', 'no-cache')
        .send(html);
    } catch (error) {
      vite?.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
  const handleError: ErrorRequestHandler = (
    error: unknown,
    req,
    res,
    _next,
  ) => {
    const code =
      error && typeof error === 'object'
        ? (error as { status?: unknown }).status
        : undefined;
    const status =
      typeof code === 'number' && [400, 413, 415].includes(code) ? code : 503;
    if (status === 503)
      res.set(
        'X-Incident-ID',
        diagnostics.failure(
          req.method === 'POST' &&
            /^\/api\/leads\/?(?:\?|$)/.test(req.originalUrl)
            ? 'lead_submission'
            : 'http_request',
          error,
        ),
      );
    res
      .status(status)
      .set('Cache-Control', 'no-store')
      .set('X-Robots-Tag', 'noindex');
    if (req.originalUrl.startsWith('/api/'))
      res.json({
        error:
          status === 413
            ? 'Слишком большой запрос.'
            : status === 415
              ? 'Сжатые запросы не поддерживаются.'
              : status === 400
                ? 'Некорректный запрос.'
                : 'Сервис временно недоступен.',
      });
    else
      res
        .type('html')
        .send(
          '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Сервис временно недоступен</title><h1>Сервис временно недоступен</h1></html>',
        );
  };
  app.use(handleError);
  return {
    app,
    store,
    diagnostics,
    async close() {
      await vite?.close();
      store.close();
    },
  };
}
