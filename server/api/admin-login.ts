import { sha256, equal, sign } from '../../src/lib/crypto';
import type { ApiContext } from './context';
import { sameOrigin, rateLimit, jsonError, sessionCookie } from './security';

export async function POST(request: Request, context: ApiContext) {
  if (!sameOrigin(request)) return jsonError('Недопустимый источник.', 403);
  const { config } = context;
  if (!config.adminPasswordHash || !config.adminSessionSecret)
    return jsonError('Доступ к CMS ещё не настроен.', 503);
  try {
    if (!(await rateLimit(context, 'admin-login', 8, 900)))
      return jsonError('Попробуйте позже.', 429);
    const raw = await request.text();
    if (raw.length > 1000) return jsonError('Слишком большой запрос.', 413);
    const { password } = JSON.parse(raw);
    if (typeof password !== 'string' || !equal(await sha256(password), config.adminPasswordHash))
      return jsonError('Неверный пароль.', 401);
    const expires = String(Date.now() + 8 * 60 * 60 * 1000);
    const token = expires + '.' + (await sign(expires, config.adminSessionSecret));
    return Response.json(
      { ok: true },
      {
        headers: {
          'Set-Cookie': sessionCookie(request, token, 28800),
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch {
    return jsonError('Не удалось войти.', 503);
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return jsonError('Недопустимый источник.', 403);
  return Response.json(
    { ok: true },
    { headers: { 'Set-Cookie': sessionCookie(request, '', 0), 'Cache-Control': 'no-store' } },
  );
}
