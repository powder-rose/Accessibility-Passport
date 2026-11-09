import { sha256 } from '../../src/lib/crypto';
import type { ApiContext } from './context';
import { isAdminAuthenticated } from '../auth/service';

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !!origin && origin === new URL(request.url).origin;
}
export async function rateLimit(
  context: ApiContext,
  bucket: string,
  limit: number,
  seconds: number,
) {
  const now = Math.floor(Date.now() / 1000);
  const key = await sha256(
    bucket + ':' + context.clientIp + ':' + Math.floor(now / seconds),
  );
  return context.store.consumeRateLimit(key, limit, now + seconds, now);
}
export async function adminAuthenticated(
  request: Request,
  { config, store }: ApiContext,
) {
  return isAdminAuthenticated(request, config, store);
}
export function sessionCookie(request: Request, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return (
    'osi_admin=' +
    value +
    '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' +
    maxAge +
    secure
  );
}
export function jsonError(message: string, status = 400) {
  return Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
