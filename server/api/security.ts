import { sha256, sign, equal } from '../../src/lib/crypto';
import type { ApiContext } from './context';

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
  { config }: ApiContext,
) {
  if (!config.adminSessionSecret) return false;
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('osi_admin='))
    ?.slice(10);
  if (!token) return false;
  const [expires, signature, extra] = token.split('.');
  if (
    extra ||
    !/^[0-9]+$/.test(expires || '') ||
    !/^[a-f0-9]{64}$/.test(signature || '') ||
    Number(expires) < Date.now() ||
    Number(expires) > Date.now() + 9 * 60 * 60 * 1000
  )
    return false;
  return equal(signature, await sign(expires, config.adminSessionSecret));
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
