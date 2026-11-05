import sanitizeHtml from 'sanitize-html';
import { articleImagePath } from '../../src/features/articles/model';

import { safeArticleLink } from '../../src/features/articles/links';

export function sanitizeArticleContent(content: string) {
  const clean = sanitizeHtml(content, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      's',
      'code',
      'pre',
      'h2',
      'h3',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
      'img',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'colgroup',
      'col',
      'hr',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      ol: ['start'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
      col: ['span'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => ({
        tagName: 'a',
        attribs: {
          ...(safeArticleLink(attributes.href || '')
            ? { href: attributes.href }
            : {}),
          ...(attributes.title ? { title: attributes.title } : {}),
          ...(attributes.target === '_blank'
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : {}),
        },
      }),
      img: (_tag, attributes) => ({
        tagName: 'img',
        attribs: {
          ...(articleImagePath.test(attributes.src || '')
            ? { src: attributes.src }
            : {}),
          alt: attributes.alt || '',
          ...Object.fromEntries(
            ['width', 'height']
              .filter(
                (key) =>
                  /^\d{1,4}$/.test(attributes[key] || '') &&
                  Number(attributes[key]) > 0,
              )
              .map((key) => [key, attributes[key]]),
          ),
          loading: 'lazy',
          decoding: 'async',
        },
      }),
      h1: 'h2',
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
    disallowedTagsMode: 'discard',
    nestingLimit: 30,
  });
  return clean
    .replace(/<table>/g, '<div class="article-table-scroll"><table>')
    .replace(/<\/table>/g, '</table></div>');
}
export function imageReferences(content: string, image: string) {
  const references = new Set<string>();
  if (image) references.add(image.slice('/media/articles/'.length, -5));
  for (const match of content.matchAll(
    /<img\b[^>]*src="(\/media\/articles\/([a-f0-9-]{36})\.webp)"/g,
  ))
    references.add(match[2]);
  return [...references];
}
export function articleText(content: string) {
  return sanitizeHtml(content, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(?:nbsp|amp|lt|gt|quot|#\d+);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
