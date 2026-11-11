import { z } from 'zod';
import { statisticsPeriods } from '../../src/features/statistics/model';
import type { ApiContext } from './context';
import {
  adminAuthenticated,
  jsonError,
  rateLimit,
  sameOrigin,
} from './security';
import { createPageData } from '../page-data';
import { getSiteContent } from '../content';

const viewSchema = z
  .object({
    id: z.string().uuid(),
    token: z.string().uuid(),
    path: z
      .string()
      .max(300)
      .regex(/^\/(?!\/)[^?#\\\s]*$/),
    referrer: z
      .string()
      .max(253)
      .regex(/^[a-z0-9.-]+$/i)
      .optional(),
    campaign: z
      .string()
      .max(60)
      .regex(/^[a-z0-9_.-]+$/i)
      .optional(),
  })
  .strict();

export async function pageview(request: Request, context: ApiContext) {
  if (!sameOrigin(request))
    return jsonError('Недопустимый источник запроса.', 403);
  if (
    /bot|crawler|spider|slurp|headless|lighthouse|preview/i.test(
      request.headers.get('user-agent') || '',
    ) ||
    request.headers.get('dnt') === '1' ||
    request.headers.get('sec-gpc') === '1' ||
    (await adminAuthenticated(request, context))
  )
    return new Response(null, { status: 204 });

  const parsed = viewSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError('Некорректное событие просмотра.', 400);
  const view = parsed.data;
  const url = new URL(view.path, request.url);
  const page = createPageData(url, getSiteContent(), context.store.articles);
  if (page.status !== 200 || page.data.route === 'admin' || page.redirect)
    return new Response(null, { status: 204 });
  if (!(await rateLimit(context, 'pageview', 120, 60)))
    return jsonError('Слишком много запросов.', 429);

  const referrer = view.referrer?.toLowerCase().replace(/^www\./, '');
  const ownHost = new URL(request.url).hostname.replace(/^www\./, '');
  const source = view.campaign
    ? 'campaign:' + view.campaign.toLowerCase()
    : referrer && referrer !== ownHost
      ? referrer
      : 'direct';
  context.store.traffic.record({ ...view, path: url.pathname }, source);
  return new Response(null, { status: 204 });
}

export async function report(request: Request, context: ApiContext) {
  if (!(await adminAuthenticated(request, context)))
    return jsonError('Нет доступа.', 401);
  const params = new URL(request.url).searchParams;
  const days = statisticsPeriods.find(
    (value) => String(value) === (params.get('days') ?? '30'),
  );
  if (
    days === undefined ||
    params.getAll('days').length > 1 ||
    [...params.keys()].some((key) => key !== 'days')
  )
    return jsonError('Выберите период 7, 30 или 90 дней.', 400);
  return Response.json(context.store.statistics.report(days), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
