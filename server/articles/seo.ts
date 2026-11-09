import type { PageData } from '../../src/page-data';
import { escapeHtml, scriptJson } from '../html';
import { blogPath } from '../../src/features/articles/listing';
export function articleHead(data: PageData) {
  const { content, article, blog } = data;
  const articles = blog?.articles || [];
  const domain = content.site.domain;
  const path = article
    ? '/blog/' + article.slug + '/'
    : blog
      ? blogPath(blog)
      : '/blog/';
  const url = new URL(path, domain).href;
  const title =
    article?.seoTitle ||
    'Блог Николая Бойкова — БОЙКОВГРУПП' +
      (blog && blog.page > 1 ? ' — страница ' + blog.page : '');
  const description = article?.seoDescription || 'Блог Николая Бойкова';
  const image = new URL(
    article?.image || '/images/og-accessibility.webp',
    domain,
  ).href;
  const organization = {
    '@type': 'Organization',
    '@id': domain + '/#organization',
    name: content.site.brand,
    legalName: content.site.company,
    url: domain,
  };
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Главная',
            item: domain + '/',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Блог Николая Бойкова',
            item: domain + '/blog/',
          },
          ...(article
            ? [
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: article.title,
                  item: url,
                },
              ]
            : []),
        ],
      },
      article
        ? {
            '@type': 'BlogPosting',
            '@id': url + '#article',
            mainEntityOfPage: url,
            url,
            headline: article.title,
            description: article.seoDescription,
            image: [image],
            inLanguage: 'ru-RU',
            datePublished: article.publishedAt,
            dateModified: article.updatedAt,
            author: {
              '@type': 'Person',
              name: 'Николай Бойков',
              url: domain + '/#expert',
            },
            publisher: { '@id': domain + '/#organization' },
            articleSection: article.category || undefined,
          }
        : {
            '@type': 'Blog',
            name: 'Блог Николая Бойкова',
            url,
            blogPost: articles.map((item) => ({
              '@type': 'BlogPosting',
              headline: item.title,
              url: domain + '/blog/' + item.slug + '/',
            })),
          },
    ],
  };
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="robots" content="${article || (articles.length && !blog?.category && !blog?.search) ? 'index, follow' : 'noindex, follow'}">`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    ...Object.entries({
      'og:type': article ? 'article' : 'website',
      'og:title': title,
      'og:description': description,
      'og:url': url,
      'og:image': image,
      'og:locale': 'ru_RU',
    }).map(
      ([key, value]) =>
        `<meta property="${key}" content="${escapeHtml(value)}">`,
    ),
    '<meta name="twitter:card" content="summary_large_image">',
    '<script type="application/ld+json">' + scriptJson(schema) + '</script>',
  ].join('\n');
}
