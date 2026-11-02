import { routes } from '../src/lib/routes';
import { getSurveyContent } from './service-content';
import documents from '../src/content/legal.json';
import type { SiteContent } from '../src/lib/content-types';
import type { PageData } from '../src/page-data';

export function createPageData(url: URL, content: SiteContent): { data: PageData; status: number } {
  const slug = url.pathname.replace(/^\/|\/$/g, '');
  if (url.pathname === routes.home || url.pathname === routes.survey) {
    const object = url.searchParams.get('object_type') || undefined;
    const selectedService = url.searchParams.get('service') || undefined;
    const objectType = content.quiz.questions
      .find((q) => q.id === 'objectType')
      ?.options.some((o) => o.id === object)
      ? object
      : undefined;
    const service =
      content.services.some((s) => s.id === selectedService) || selectedService === 'update'
        ? selectedService
        : url.pathname === routes.survey
          ? 'survey'
          : undefined;
    return url.pathname === routes.survey
      ? {
          data: {
            route: 'survey',
            content,
            servicePage: getSurveyContent(content),
            objectType,
            service,
          },
          status: 200,
        }
      : { data: { route: 'home', content, objectType, service }, status: 200 };
  }
  if (slug === 'admin') return { data: { route: 'admin', content }, status: 200 };
  if (Object.hasOwn(documents, slug)) {
    return {
      data: { route: 'legal', content, document: documents[slug as keyof typeof documents] },
      status: 200,
    };
  }
  return { data: { route: 'not-found', content }, status: 404 };
}
export function canonicalPath(pathname: string): string | undefined {
  if (pathname === '/index.html') return '/';
  const slug = pathname.slice(1);
  if (pathname + '/' === routes.survey || slug === 'admin' || Object.hasOwn(documents, slug))
    return pathname + '/';
  return undefined;
}
