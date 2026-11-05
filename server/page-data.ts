import { routes, serviceForPath } from '../src/lib/routes';
import { getServiceContent } from './service-content';
import documents from '../src/content/legal.json';
import type { SiteContent } from '../src/lib/content-types';
import type { PageData } from '../src/page-data';
import type { ArticleRepository } from './articles/repository';

export function createPageData(
  url: URL,
  content: SiteContent,
  articles?: ArticleRepository,
): { data: PageData; status: number; redirect?: string } {
  const slug = url.pathname.replace(/^\/|\/$/g, '');
  const documentService = serviceForPath(url.pathname);
  if (url.pathname === routes.home || documentService) {
    const servicePage = documentService
      ? getServiceContent(documentService, content)
      : undefined;
    const object = url.searchParams.get('object_type') || undefined;
    const selectedService = url.searchParams.get('service') || undefined;
    const objectType = (servicePage?.quiz || content.quiz).questions
      .find((q) => q.id === 'objectType')
      ?.options.some((o) => o.id === object)
      ? object
      : undefined;
    const service =
      content.services.some((s) => s.id === selectedService) ||
      selectedService === 'update'
        ? selectedService
        : documentService;
    return documentService
      ? {
          data: {
            route: documentService,
            content,
            servicePage,
            objectType,
            service,
          },
          status: 200,
        }
      : { data: { route: 'home', content, objectType, service }, status: 200 };
  }
  if (
    slug === 'admin' ||
    /^admin\/articles(?:\/(?:new|preview|edit\/[a-f0-9-]{36}))?$/.test(slug)
  )
    return {
      data: { route: 'admin', content, adminPath: url.pathname },
      status: 200,
    };
  if (url.pathname === '/blog/')
    return {
      data: { route: 'blog', content, articles: articles?.summaries() || [] },
      status: 200,
    };
  const articleSlug = url.pathname.match(
    /^\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/,
  )?.[1];
  const article = articleSlug ? articles?.bySlug(articleSlug) : undefined;
  if (article)
    return {
      data: {
        route: 'article',
        content,
        article,
        articles: articles?.summaries() || [],
      },
      status: 200,
      ...(article.slug !== articleSlug
        ? { redirect: '/blog/' + article.slug + '/' }
        : {}),
    };
  if (Object.hasOwn(documents, slug)) {
    return {
      data: {
        route: 'legal',
        content,
        document: documents[slug as keyof typeof documents],
      },
      status: 200,
    };
  }
  return { data: { route: 'not-found', content }, status: 404 };
}
export function canonicalPath(pathname: string): string | undefined {
  if (pathname === '/index.html') return '/';
  const slug = pathname.slice(1);
  if (
    serviceForPath(pathname + '/') ||
    slug === 'admin' ||
    slug === 'blog' ||
    /^blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    /^admin\/articles(?:\/(?:new|preview|edit\/[a-f0-9-]{36}))?$/.test(slug) ||
    Object.hasOwn(documents, slug)
  )
    return pathname + '/';
  return undefined;
}
