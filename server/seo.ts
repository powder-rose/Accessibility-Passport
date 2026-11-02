import type { PageData } from '../src/page-data';
import { routes } from '../src/lib/routes';
import type { Service, Section, SiteContent } from '../src/lib/content-types';

export function escapeHtml(value: string) {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => replacements[character]);
}
export function scriptJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
export function structuredData(
  content: SiteContent,
  options: { services?: Service[]; faq?: Section; breadcrumb?: string; path?: string } = {},
) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': content.site.domain + '/#organization',
        name: content.site.brand,
        legalName: content.site.company,
        taxID: content.site.inn,
        telephone: content.site.phone,
        url: content.site.domain,
      },
      ...(options.services || content.services).map((service) => ({
        '@type': 'Service',
        ...(options.path ? { url: new URL(options.path, content.site.domain).href } : {}),
        name: service.title,
        description: service.description,
        provider: { '@id': content.site.domain + '/#organization' },
        areaServed: 'RU',
        offers: {
          '@type': service.from ? 'AggregateOffer' : 'Offer',
          ...(service.from ? { lowPrice: service.price } : { price: service.price }),
          priceCurrency: 'RUB',
        },
      })),
      ...(options.breadcrumb
        ? [
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: 'Главная',
                  item: content.site.domain + '/',
                },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: options.breadcrumb,
                  item: new URL(options.path!, content.site.domain).href,
                },
              ],
            },
          ]
        : []),
      {
        '@type': 'FAQPage',
        mainEntity: (options.faq || content.sections['16']).items?.map((item) => ({
          '@type': 'Question',
          name: item.title,
          acceptedAnswer: { '@type': 'Answer', text: item.text },
        })),
      },
    ],
  };
}
export function buildHead(data: PageData, pathname: string) {
  const { content, route } = data;
  const commercial = route === 'home' || route === 'survey';
  const seo = route === 'survey' ? data.servicePage!.seo : content.seo;
  const canonicalUrl =
    route === 'survey'
      ? new URL(data.servicePage!.path, content.site.domain).href
      : content.seo.canonical;
  const schemaOptions =
    route === 'survey'
      ? {
          services: content.services.filter((service) => service.id === 'survey'),
          faq: data.servicePage!.sections['16'],
          breadcrumb: data.servicePage!.breadcrumb,
          path: data.servicePage!.path,
        }
      : undefined;
  const title = commercial
    ? seo.title
    : route === 'legal'
      ? data.document!.title
      : route === 'admin'
        ? 'Заявки — БОЙКОВГРУПП'
        : 'Страница не найдена';
  const robots = commercial ? 'index, follow' : 'noindex, nofollow';
  const head = [
    '<title>' + escapeHtml(title) + '</title>',
    '<meta name="robots" content="' + robots + '">',
  ];
  if (commercial || route === 'legal') {
    const canonical = commercial ? canonicalUrl : new URL(pathname, content.site.domain).href;
    head.push('<link rel="canonical" href="' + escapeHtml(canonical) + '">');
  }
  if (commercial) {
    const description = escapeHtml(seo.description);
    const escapedTitle = escapeHtml(title);
    const canonical = escapeHtml(canonicalUrl);
    const image = escapeHtml(new URL('/images/og-accessibility.webp', content.site.domain).href);
    head.push(
      '<meta name="description" content="' + description + '">',
      '<meta property="og:title" content="' + escapedTitle + '">',
      '<meta property="og:description" content="' + description + '">',
      '<meta property="og:url" content="' + canonical + '">',
      '<meta property="og:locale" content="ru_RU">',
      '<meta property="og:type" content="website">',
      '<meta property="og:image" content="' + image + '">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:title" content="' + escapedTitle + '">',
      '<meta name="twitter:description" content="' + description + '">',
      '<meta name="twitter:image" content="' + image + '">',
      '<script type="application/ld+json">' +
        scriptJson(structuredData(content, schemaOptions)) +
        '</script>',
    );
  }
  return head.join('\n');
}
export function robotsText(content: SiteContent) {
  const rules = 'Allow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /*?*';
  return (
    'User-agent: *\n' +
    rules +
    '\n\nSitemap: ' +
    new URL('/sitemap.xml', content.site.domain).href +
    '\n'
  );
}
export function sitemapXml(content: SiteContent) {
  const entries = Object.values(routes)
    .map(
      (path) =>
        '<url><loc>' +
        escapeHtml(new URL(path, content.site.domain).href) +
        '</loc><changefreq>monthly</changefreq><priority>' +
        (path === routes.home ? '1.0' : '0.8') +
        '</priority></url>',
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    entries +
    '</urlset>'
  );
}
