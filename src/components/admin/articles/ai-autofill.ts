import type { ArticleForm } from '@/features/articles/model';
import { planAiMetadata, type AiMetadata } from './ai-metadata';
import { aiTargetLabels, type AiMetadataTarget } from './ai-target';

export function planAiAutofill(
  form: ArticleForm,
  metadata: AiMetadata,
  content: string,
  currentContentHasValue: boolean,
  generatedContentHasValue: boolean,
) {
  // Validate all suggestions before applying any of them.
  const validated = planAiMetadata(form, metadata, []);
  const fields: AiMetadataTarget[] = [
    'title',
    'slug',
    'category',
    'seoTitle',
    'seoDescription',
    'imageAlt',
  ];
  const changes: Partial<ArticleForm> = {};
  const applied: string[] = [];
  const preserved: string[] = [];
  const review: string[] = [];
  const appliedMetadata: string[] = [];
  for (const key of fields) {
    const value = metadata[key]?.trim();
    if (!value) {
      if (key === 'category') review.push('категория: модель не предложила');
      continue;
    }
    if (key === 'imageAlt' && !form.image) {
      review.push('alt обложки: после добавления изображения');
      continue;
    }
    if (form[key].trim()) {
      if (form[key].trim() === value) appliedMetadata.push(key);
      else preserved.push(aiTargetLabels[key]);
      continue;
    }
    if (validated.fields[key] !== undefined) {
      changes[key] = validated.fields[key];
      applied.push(aiTargetLabels[key]);
      appliedMetadata.push(key);
    }
  }
  let textApplied = false;
  if (currentContentHasValue) preserved.push('текст статьи');
  else if (generatedContentHasValue && content.length <= 300000) {
    changes.content = content;
    applied.push('текст статьи');
    textApplied = true;
  } else review.push('текст статьи');
  return { changes, applied, preserved, review, appliedMetadata, textApplied };
}
