import { z } from 'zod';

export const articleImagePath = /^\/media\/articles\/[a-f0-9-]{36}\.webp$/;
export const articleFormSchema = z.object({
  title: z.string().trim().max(240),
  slug: z.string().trim().max(180),
  content: z.string().max(300000),
  image: z
    .string()
    .max(200)
    .refine((value) => !value || articleImagePath.test(value)),
  imageAlt: z.string().trim().max(500),
  category: z
    .string()
    .trim()
    .max(80)
    .transform((value) => value.replace(/\s+/g, ' ')),
  status: z.enum(['draft', 'published']),
  seoTitle: z.string().trim().max(240),
  seoDescription: z.string().trim().max(500),
});
export type ArticleForm = z.infer<typeof articleFormSchema>;
export interface ArticleRecord extends ArticleForm {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}
export type ArticleSummary = Omit<ArticleRecord, 'content' | 'revision'>;
export interface ArticleImage {
  url: string;
  width: number;
  height: number;
}
export const emptyArticle = (): ArticleForm => ({
  title: '',
  slug: '',
  content: '',
  image: '',
  imageAlt: '',
  category: '',
  status: 'draft',
  seoTitle: '',
  seoDescription: '',
});
const letters: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};
export function articleSlug(value: string) {
  return Array.from(value.trim().toLowerCase().normalize('NFKC'))
    .map((char) => letters[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
    .replace(/-+$/, '');
}
export function articleDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Moscow',
      }).format(new Date(value))
    : '';
}
export function articleSummary(article: ArticleRecord): ArticleSummary {
  const { content: _content, revision: _revision, ...summary } = article;
  return summary;
}
