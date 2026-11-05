import type { ApiContext } from './context';
import { adminAuthenticated, jsonError } from './security';
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
  return Response.json(
    { leads: context.store.listLeads() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
