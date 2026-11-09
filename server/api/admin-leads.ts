import type { ApiContext } from './context';
import { adminAuthenticated, jsonError } from './security';
import { parseLeadQuery, type LeadQuery } from '../db/lead-pagination';
export async function SESSION(request: Request, context: ApiContext) {
  if (!(await adminAuthenticated(request, context)))
    return jsonError('Нет доступа.', 401);
  return Response.json(
    { authenticated: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function GET(request: Request, context: ApiContext) {
  if (!(await adminAuthenticated(request, context)))
    return jsonError('Нет доступа.', 401);
  let query: LeadQuery;
  try {
    query = parseLeadQuery(new URL(request.url));
  } catch {
    return jsonError('Некорректные параметры списка заявок.', 400);
  }
  return Response.json(context.store.listLeadPage(query), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
