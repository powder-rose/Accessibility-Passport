import type { ApiContext } from './context';
import { sameOrigin, rateLimit, jsonError, sessionCookie } from './security';
import {
  authenticatePassword,
  createAdminSession,
  revokeAdminSession,
} from '../auth/service';
import { PasswordBusyError } from '../../scripts/lib/admin-password.mjs';

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
    const value: unknown = JSON.parse(raw);
    const password =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>).password
        : undefined;
    if (
      typeof password !== 'string' ||
      !password ||
      Buffer.byteLength(password) > 4096
    )
      return jsonError('Неверный пароль.', 401);
    const credential = await authenticatePassword(
      password,
      config,
      context.store,
    );
    if (!credential) return jsonError('Неверный пароль.', 401);
    const token = createAdminSession(config, context.store, credential);
    return Response.json(
      { ok: true },
      {
        headers: {
          'Set-Cookie': sessionCookie(request, token, 28800),
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (error instanceof PasswordBusyError)
      return Response.json(
        { error: 'Вход временно занят. Повторите через несколько секунд.' },
        {
          status: 429,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' },
        },
      );
    return jsonError('Не удалось войти.', 503);
  }
}
export async function DELETE(request: Request, context: ApiContext) {
  if (!sameOrigin(request)) return jsonError('Недопустимый источник.', 403);
  revokeAdminSession(request, context.config, context.store);
  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': sessionCookie(request, '', 0),
        'Cache-Control': 'no-store',
      },
    },
  );
}
