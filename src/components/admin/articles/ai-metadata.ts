import { articleSlug, type ArticleForm } from '@/features/articles/model';

/** Suggestions remain editable in the assistant until the user applies them. */
export type AiMetadata = {
  title?: string;
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  imageAlt?: string;
  category?: string;
  inlineImageAlts?: string[];
};

type MetadataField =
  'title' | 'slug' | 'seoTitle' | 'seoDescription' | 'imageAlt' | 'category';
const fields: { key: MetadataField; label: string; limit: number }[] = [
  { key: 'title', label: 'заголовок', limit: 240 },
  { key: 'slug', label: 'URL', limit: 160 },
  { key: 'seoTitle', label: 'SEO Title', limit: 240 },
  { key: 'seoDescription', label: 'SEO Description', limit: 500 },
  { key: 'imageAlt', label: 'alt обложки', limit: 500 },
  { key: 'category', label: 'категория статьи', limit: 80 },
];

export type AiMetadataPlan = {
  fields: Partial<Pick<ArticleForm, MetadataField>>;
  inline: { index: number; alt: string }[];
  overwrites: string[];
};

/** Prepare and validate the complete change before touching the article form. */
export function planAiMetadata(
  form: ArticleForm,
  suggestions: AiMetadata,
  existingInlineAlts: string[],
): AiMetadataPlan {
  if (
    !suggestions ||
    typeof suggestions !== 'object' ||
    Array.isArray(suggestions)
  )
    throw new Error('Проверьте предложенные данные статьи.');
  const plan: AiMetadataPlan = { fields: {}, inline: [], overwrites: [] };
  for (const { key, label, limit } of fields) {
    const raw = suggestions[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') throw new Error(`Проверьте поле «${label}».`);
    const value = raw.trim();
    if (!value) continue;
    if (value.length > limit)
      throw new Error(`Поле «${label}» длиннее ${limit} символов.`);
    if (key === 'slug' && articleSlug(value) !== value)
      throw new Error(
        'URL должен состоять из строчных латинских букв, цифр и дефисов, без дефисов по краям.',
      );
    if (form[key] === value) continue;
    plan.fields[key] = value;
    if (form[key].trim()) plan.overwrites.push(label);
  }
  const inline = suggestions.inlineImageAlts;
  if (inline !== undefined) {
    if (!Array.isArray(inline) || inline.length > 3)
      throw new Error('Проверьте описания изображений в тексте.');
    inline.forEach((raw, index) => {
      if (typeof raw !== 'string')
        throw new Error('Проверьте описание изображения в тексте.');
      const value = raw.trim();
      if (value.length > 500)
        throw new Error('Описание изображения длиннее 500 символов.');
      if (
        !value ||
        index >= existingInlineAlts.length ||
        existingInlineAlts[index] === value
      )
        return;
      plan.inline.push({ index, alt: value });
      if (existingInlineAlts[index].trim())
        plan.overwrites.push(`alt изображения ${index + 1}`);
    });
  }
  return plan;
}
