export type AiTarget =
  | 'title'
  | 'slug'
  | 'image'
  | 'imageAlt'
  | 'content'
  | 'category'
  | 'seoTitle'
  | 'seoDescription';

export type AiMetadataTarget = Exclude<AiTarget, 'image' | 'content'>;

/** Selecting one field must never transfer the other AI suggestions. */
export function selectAiField(
  target: AiMetadataTarget,
  values: Record<AiMetadataTarget, string>,
): Partial<Record<AiMetadataTarget, string>> {
  return { [target]: values[target] };
}

export const aiTargetLabels: Record<AiTarget, string> = {
  title: 'заголовок',
  slug: 'URL статьи',
  image: 'главное изображение',
  imageAlt: 'alt главного изображения',
  content: 'текст статьи',
  category: 'категорию статьи',
  seoTitle: 'SEO Title',
  seoDescription: 'SEO Description',
};
