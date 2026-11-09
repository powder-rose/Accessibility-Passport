import type { ApiHandler } from '../api/context';
import { adminAuthenticated, jsonError } from '../api/security';

function notModified(request: Request, etag: string, published: boolean) {
  const condition = request.headers.get('if-none-match');
  // Preserve the existing public exact-match response, including reloads.
  if (published && condition === etag) return true;
  // Other validators used to be evaluated by Express after loading the body.
  if (
    /(?:^|,)\s*no-cache\s*(?:,|$)/.test(
      request.headers.get('cache-control') || '',
    )
  )
    return false;
  return (
    condition === '*' ||
    Boolean(
      condition?.split(',').some((value) => {
        const tag = value.trim();
        return tag === etag || tag === 'W/' + etag;
      }),
    )
  );
}

export const articleImageResponse: ApiHandler = async (request, context) => {
  const id = new URL(request.url).pathname.split('/').at(-1)!.slice(0, -5);
  const articles = context.store.articles;
  const metadata = articles.imageMetadata(id);
  if (!metadata) return jsonError('Изображение не найдено.', 404);
  const published = Boolean(metadata.published);
  if (!published && !(await adminAuthenticated(request, context)))
    return jsonError('Изображение не найдено.', 404);
  const headers = {
    'Content-Type': 'image/webp',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': published
      ? 'public, max-age=0, must-revalidate'
      : 'private, no-store',
    ETag: '"' + metadata.sha256 + '"',
  };
  if (notModified(request, headers.ETag, published))
    return new Response(null, { status: 304, headers });
  if (request.method === 'HEAD')
    return new Response(null, {
      headers: { ...headers, 'Content-Length': String(metadata.size) },
    });
  const file = articles.image(id);
  if (!file) return jsonError('Изображение не найдено.', 404);
  return new Response(new Uint8Array(file.bytes), { headers });
};
