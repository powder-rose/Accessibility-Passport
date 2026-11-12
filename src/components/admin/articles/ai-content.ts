import { safeArticleLink } from '@/features/articles/links';
import { articleImagePath } from '@/features/articles/model';

// Treat even the server-cleaned model response as untrusted before TipTap sees it.
// A template keeps the parsed input inert; only explicitly constructed nodes leave it.
const allowed = new Set([
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
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'hr',
]);
const discard = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'img',
  'link',
  'meta',
  'form',
  'input',
]);

export function cleanAiContent(html: string): string {
  const source = document.createElement('template');
  source.innerHTML = html;
  const output = document.createElement('div');
  function copy(node: Node, parent: Node, inQuote = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent || ''));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.localName.toLowerCase();
    if (discard.has(tag)) return;
    const normalized = tag === 'h1' ? 'h2' : tag;
    if (!allowed.has(normalized)) {
      for (const child of Array.from(element.childNodes))
        copy(child, parent, inQuote);
      return;
    }
    const result = document.createElement(normalized);
    if (normalized === 'a') {
      const href = element.getAttribute('href') || '';
      if (safeArticleLink(href)) result.setAttribute('href', href);
    }
    if (normalized === 'td' || normalized === 'th') {
      for (const name of ['colspan', 'rowspan']) {
        const value = element.getAttribute(name) || '';
        if (/^[1-9]\d?$/.test(value)) result.setAttribute(name, value);
      }
    }
    if (normalized === 'ol') {
      const start = element.getAttribute('start') || '';
      if (/^[1-9]\d{0,4}$/.test(start)) result.setAttribute('start', start);
    }
    for (const child of Array.from(element.childNodes))
      copy(child, result, inQuote || normalized === 'blockquote');
    if (
      normalized === 'p' &&
      !inQuote &&
      /^важно\s*:/i.test(result.textContent?.trim() || '')
    ) {
      const quote = document.createElement('blockquote');
      quote.appendChild(result);
      parent.appendChild(quote);
    } else parent.appendChild(result);
  }
  for (const child of Array.from(source.content.childNodes))
    copy(child, output);
  return output.innerHTML;
}

export function aiContentHasValue(html: string): boolean {
  const template = document.createElement('template');
  template.innerHTML = html;
  return (
    !!template.content.textContent?.trim() ||
    !!template.content.querySelector('img,table,hr')
  );
}

// Locate distinct H2s near one quarter, one half and three quarters of the text.
// Existing images immediately preceding a heading reserve that position.
export function insertAiImage(
  content: string,
  url: string,
  alt: string,
): string {
  const template = document.createElement('template');
  template.innerHTML = content;
  const headings = Array.from(template.content.querySelectorAll('h2'));
  if (!headings.length)
    throw new Error('Добавьте в статью хотя бы один заголовок H2.');
  const positions = new Map<Element, number>();
  let words = 0;
  const walker = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).localName === 'h2'
    )
      positions.set(node as Element, words);
    if (node.nodeType === Node.TEXT_NODE)
      words += (node.textContent?.match(/\S+/g) || []).length;
  }
  const count = Math.min(3, headings.length);
  let states: { cost: number; indices: number[]; last: number }[] = [
    { cost: 0, indices: [], last: -1 },
  ];
  for (let k = 0; k < count; k++) {
    const next: typeof states = [];
    let cursor = 0,
      best: (typeof states)[number] | undefined;
    for (let i = k; i < headings.length - (count - k - 1); i++) {
      while (cursor < states.length && states[cursor].last < i) {
        const candidate = states[cursor++];
        if (!best || candidate.cost < best.cost) best = candidate;
      }
      if (best)
        next.push({
          cost:
            best.cost +
            Math.abs(
              (positions.get(headings[i]) || 0) / Math.max(words, 1) -
                (k + 1) / (count + 1),
            ),
          indices: [...best.indices, i],
          last: i,
        });
    }
    states = next;
  }
  const selected = states.reduce((a, b) => (a.cost <= b.cost ? a : b)).indices;
  const free = selected
    .map((index) => headings[index])
    .find((heading) => {
      const prev = heading.previousElementSibling;
      return !(
        prev?.tagName === 'IMG' ||
        (prev?.tagName === 'P' &&
          !!prev.querySelector('img') &&
          !prev.textContent?.trim())
      );
    });
  if (!free)
    throw new Error('Все подходящие места перед H2 уже заняты изображениями.');
  if (!articleImagePath.test(url))
    throw new Error('Сервер вернул неверный адрес изображения.');
  const img = document.createElement('img');
  img.src = url;
  img.setAttribute('src', url);
  img.alt = alt;
  free.before(img);
  const output = document.createElement('div');
  output.append(template.content);
  return output.innerHTML;
}
