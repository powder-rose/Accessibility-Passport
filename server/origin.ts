import type { Config } from './config';
import type { SiteContent } from '../src/lib/content-types';

type OriginSetting = 'APP_ORIGIN' | 'site.domain';

export function normalizeOrigin(value: string, setting: OriginSetting): string {
  try {
    const input = value.trim();
    if (!/^https?:\/\/[^/?#\\\s]+\/?$/i.test(input) || input.includes('@'))
      throw new Error();
    const url = new URL(input);
    if (url.username || url.password) throw new Error();
    return url.origin;
  } catch {
    throw new Error(
      setting +
        ' must be an HTTP(S) origin without credentials, a path, query or fragment.',
    );
  }
}

export function isLoopbackOrigin(origin: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
}

export function validateDomainConfiguration(
  config: Pick<Config, 'production' | 'appOrigin'>,
  content: Pick<SiteContent, 'site' | 'seo'>,
): void {
  const domain = normalizeOrigin(content.site.domain, 'site.domain');
  if (
    !domain.startsWith('https://') ||
    isLoopbackOrigin(domain) ||
    content.site.domain !== domain
  )
    throw new Error(
      'site.domain must be a normalized public HTTPS origin without a trailing slash.',
    );
  if (content.seo.canonical !== domain + '/')
    throw new Error('seo.canonical must equal site.domain followed by /.');
  if (!config.appOrigin) return;
  const appOrigin = normalizeOrigin(config.appOrigin, 'APP_ORIGIN');
  if (config.appOrigin !== appOrigin)
    throw new Error(
      'APP_ORIGIN must be normalized before application startup.',
    );
  if (config.production && !isLoopbackOrigin(appOrigin) && appOrigin !== domain)
    throw new Error(
      'Public production APP_ORIGIN must match site.domain and seo.canonical.',
    );
}
