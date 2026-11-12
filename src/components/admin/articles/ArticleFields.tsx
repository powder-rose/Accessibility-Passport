import type { ArticleForm } from '@/features/articles/model';
import { articleSlug } from '@/features/articles/model';
import ArticleCover from './ArticleCover';
import RichTextEditor from '../editor/RichTextEditor';
import { aiTargetLabels, type AiTarget } from './ai-target';

type Change = <K extends keyof ArticleForm>(
  field: K,
  value: ArticleForm[K],
) => void;
export default function ArticleFields({
  form,
  onChange,
  categories,
  editing,
  disabled,
  onOpenAssistant,
}: {
  form: ArticleForm;
  onChange: Change;
  categories: string[];
  editing: boolean;
  disabled: boolean;
  onOpenAssistant: (target: AiTarget) => void;
}) {
  const aiButton = (target: AiTarget) => (
    <button
      className="article-ai-field-button"
      type="button"
      disabled={disabled}
      aria-label={`Взять ${aiTargetLabels[target]} из ИИ-помощника`}
      onClick={() => onOpenAssistant(target)}
    >
      ✦ Взять из ИИ-помощника
    </button>
  );
  return (
    <>
      <section className="article-admin-card">
        <h2>Основная информация</h2>
        <label>
          Заголовок
          <input
            value={form.title}
            maxLength={240}
            disabled={disabled}
            onChange={(event) => onChange('title', event.target.value)}
          />
        </label>
        {aiButton('title')}
        <label>
          URL статьи
          <div className="article-slug">
            <span>/blog/</span>
            <input
              value={form.slug}
              placeholder={articleSlug(form.title) || 'url-stati'}
              maxLength={180}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              onChange={(event) =>
                onChange('slug', articleSlug(event.target.value))
              }
            />
            <span>/</span>
          </div>
          <small>
            {editing
              ? 'Если адрес изменить, старый URL сохранится для 301-редиректа.'
              : 'Можно оставить пустым — адрес автоматически сформируется из заголовка.'}
          </small>
        </label>
        {aiButton('slug')}
        <ArticleCover
          image={form.image}
          alt={form.imageAlt}
          onChange={(image) => onChange('image', image)}
          disabled={disabled}
        />
        {aiButton('image')}
        <label>
          Alt изображения
          <input
            value={form.imageAlt}
            maxLength={500}
            disabled={disabled}
            onChange={(event) => onChange('imageAlt', event.target.value)}
          />
        </label>
        {aiButton('imageAlt')}
        <div className="article-text-field">
          <span>Текст статьи</span>
          <RichTextEditor
            value={form.content}
            onChange={(html) => onChange('content', html)}
            disabled={disabled}
          />
        </div>
        {aiButton('content')}
        <label>
          Категория статьи
          <input
            value={form.category}
            maxLength={80}
            list="article-categories"
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => onChange('category', event.target.value)}
          />
          <small>
            Выберите готовую категорию или впишите новую самостоятельно.
          </small>
        </label>
        {aiButton('category')}
        <datalist id="article-categories">
          {categories.map((category) => (
            <option value={category} key={category} />
          ))}
        </datalist>
        <label>
          Статус
          <select
            value={form.status}
            disabled={disabled}
            onChange={(event) =>
              onChange('status', event.target.value as ArticleForm['status'])
            }
          >
            <option value="draft">Черновик</option>
            <option value="published">Опубликовано</option>
          </select>
        </label>
      </section>
      <section className="article-admin-card">
        <h2>SEO</h2>
        <p>
          Для черновика поля можно оставить пустыми. Для публикации обязательны
          SEO Title и SEO Description.
        </p>
        <label>
          SEO Title
          <input
            value={form.seoTitle}
            maxLength={240}
            disabled={disabled}
            onChange={(event) => onChange('seoTitle', event.target.value)}
          />
        </label>
        {aiButton('seoTitle')}
        <label>
          SEO Description
          <textarea
            value={form.seoDescription}
            rows={4}
            maxLength={500}
            disabled={disabled}
            onChange={(event) => onChange('seoDescription', event.target.value)}
          />
        </label>
        {aiButton('seoDescription')}
      </section>
    </>
  );
}
