import type { PageData } from '../src/page-data';
import type { SiteContent } from '../src/lib/content-types';

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
export function structuredData(content: SiteContent) {
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
      ...content.services.map((service) => ({
        '@type': 'Service',
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
      {
        '@type': 'FAQPage',
        mainEntity: content.sections['16'].items?.map((item) => ({
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
  const title =
    route === 'home'
      ? content.seo.title
      : route === 'legal'
        ? data.document!.title
        : route === 'admin'
          ? 'Заявки — БОЙКОВГРУПП'
          : 'Страница не найдена';
  const robots = route === 'home' ? 'index, follow' : 'noindex, nofollow';
  const head = [
    '<title>' + escapeHtml(title) + '</title>',
    '<meta name="robots" content="' + robots + '">',
  ];
  if (route === 'home' || route === 'legal') {
    const canonical =
      route === 'home' ? content.seo.canonical : new URL(pathname, content.site.domain).href;
    head.push('<link rel="canonical" href="' + escapeHtml(canonical) + '">');
  }
  if (route === 'home') {
    const description = escapeHtml(content.seo.description);
    const escapedTitle = escapeHtml(title);
    const canonical = escapeHtml(content.seo.canonical);
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
      '<script type="application/ld+json">' + scriptJson(structuredData(content)) + '</script>',
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
  const location = escapeHtml(new URL('/', content.site.domain).href);
  return (
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' +
    location +
    '</loc><changefreq>monthly</changefreq><priority>1.0</priority></url></urlset>'
  );
}
