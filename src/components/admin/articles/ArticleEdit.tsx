import { useEffect, useState } from 'react';
import { useArticleForm } from './useArticleForm';
import { articleRequest } from './api';
import { storeArticlePreview } from './preview-storage';
import ArticleFields from './ArticleFields';
import AIAssistant from '../ai/AIAssistant';
import { aiContentHasValue, cleanAiContent, insertAiImage } from './ai-content';
import { imageSelectionError, uploadImage } from './api';
import { planAiMetadata, type AiMetadata } from './ai-metadata';
import type { AiTarget } from './ai-target';
import type { TextResult } from '../ai/result';
import type { AssistantMetadata } from '../ai/metadata';
import { planAiAutofill } from './ai-autofill';

async function prepareAiCover(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40_000_000
    )
      throw new Error('Изображение слишком большое для обложки.');
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось подготовить обложку.');
    const scale = Math.max(
      canvas.width / image.naturalWidth,
      canvas.height / image.naturalHeight,
    );
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(
      image,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.9),
    );
    if (!blob) throw new Error('Не удалось подготовить обложку.');
    return new File([blob], 'ai-cover.webp', { type: 'image/webp' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ArticleEdit({ id }: { id?: string }) {
  const editor = useArticleForm(id);
  const [categories, setCategories] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState<AiTarget>();
  const [aiResult, setAiResult] = useState<TextResult>();
  const [aiMetadata, setAiMetadata] = useState<AssistantMetadata>();
  const [aiResultApplied, setAiResultApplied] = useState(false);
  const [aiAppliedMetadata, setAiAppliedMetadata] = useState<string[]>([]);
  const [aiApplying, setAiApplying] = useState(false);
  function openAssistant(target?: AiTarget) {
    setAiTarget(target);
    setAiOpen(true);
  }
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        aiResult &&
        (!aiResultApplied ||
          aiAppliedMetadata.length < (aiMetadata?.category?.trim() ? 6 : 5))
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [aiResult, aiResultApplied, aiAppliedMetadata, aiMetadata]);
  useEffect(() => {
    const controller = new AbortController();
    articleRequest<{ categories: string[] }>('/api/admin/articles', {
      signal: controller.signal,
    })
      .then((result) => setCategories(result.categories))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  function preview() {
    setPreviewError('');
    try {
      const token = storeArticlePreview(editor.form);
      const popup = window.open(
        '/admin/articles/preview/#' + token,
        '_blank',
        'noopener',
      );
      if (popup) popup.opener = null;
    } catch {
      setPreviewError(
        'Не удалось подготовить предпросмотр. Проверьте доступность хранилища браузера.',
      );
    }
  }
  async function applyAiText(html: string, title?: string) {
    const clean = cleanAiContent(html);
    if (!aiContentHasValue(clean))
      throw new Error('В ответе нет текста статьи.');
    if (clean.length > 300000)
      throw new Error('Текст слишком большой для статьи.');
    if (title && title.trim().length > 240)
      throw new Error('Заголовок длиннее 240 символов.');
    if (
      aiContentHasValue(editor.form.content) &&
      !window.confirm('Заменить текущий текст статьи сгенерированным?')
    )
      throw new Error('Замена текста отменена.');
    editor.change('content', clean);
    if (!editor.form.title.trim() && title?.trim())
      editor.change('title', title.trim());
  }
  function autofillAiResult(result: TextResult) {
    const current = editor.currentForm.current;
    const clean = cleanAiContent(result.safeHtml);
    const plan = planAiAutofill(
      current,
      result.metadata,
      clean,
      aiContentHasValue(current.content),
      aiContentHasValue(clean),
    );
    for (const key of [
      'title',
      'slug',
      'category',
      'seoTitle',
      'seoDescription',
      'imageAlt',
      'content',
    ] as const) {
      const value = plan.changes[key];
      if (value !== undefined) editor.change(key, value);
    }
    return plan;
  }
  async function applyAiMetadata(metadata: AiMetadata) {
    // Parse the current editor HTML inertly and preserve all other nodes/attributes.
    const template = document.createElement('template');
    template.innerHTML = editor.form.content;
    const images = Array.from(template.content.querySelectorAll('img'));
    const plan = planAiMetadata(
      editor.form,
      metadata,
      images.map((image) => image.getAttribute('alt') || ''),
    );
    if (!Object.keys(plan.fields).length && !plan.inline.length)
      throw new Error('Нет новых данных для применения к этой статье.');
    if (
      plan.overwrites.length &&
      !window.confirm(
        `Заменить уже заполненные поля: ${plan.overwrites.join(', ')}? Проверьте alt по самим изображениям.`,
      )
    )
      throw new Error('Применение данных отменено.');
    if (plan.fields.title !== undefined)
      editor.change('title', plan.fields.title);
    if (plan.fields.slug !== undefined) editor.change('slug', plan.fields.slug);
    if (plan.fields.seoTitle !== undefined)
      editor.change('seoTitle', plan.fields.seoTitle);
    if (plan.fields.seoDescription !== undefined)
      editor.change('seoDescription', plan.fields.seoDescription);
    if (plan.fields.imageAlt !== undefined)
      editor.change('imageAlt', plan.fields.imageAlt);
    if (plan.fields.category !== undefined)
      editor.change('category', plan.fields.category);
    if (plan.inline.length) {
      for (const update of plan.inline)
        images[update.index].setAttribute('alt', update.alt);
      const output = document.createElement('div');
      output.append(template.content);
      editor.change('content', output.innerHTML);
    }
  }
  async function applyAiImage(
    file: File,
    slot: 'cover' | 'inline',
    alt: string,
    seoName: string,
  ) {
    const problem = imageSelectionError(file);
    if (problem) throw new Error(problem);
    const description = alt.trim();
    if (!description || description.length > 500)
      throw new Error('Укажите описание изображения до 500 символов.');
    if (
      slot === 'cover' &&
      (editor.form.image ||
        (editor.form.imageAlt.trim() &&
          editor.form.imageAlt.trim() !== description)) &&
      !window.confirm('Заменить существующую обложку и её описание (alt)?')
    )
      throw new Error('Замена обложки отменена.');
    if (slot === 'inline')
      insertAiImage(
        editor.form.content,
        '/media/articles/00000000-0000-0000-0000-000000000000.webp',
        description,
      );
    setAiApplying(true);
    try {
      const prepared = slot === 'cover' ? await prepareAiCover(file) : file;
      const uploaded = await uploadImage(
        prepared,
        seoName.trim() || description,
      );
      if (slot === 'cover') {
        editor.change('image', uploaded.url);
        editor.change('imageAlt', description);
      } else
        editor.change(
          'content',
          insertAiImage(editor.form.content, uploaded.url, description),
        );
    } finally {
      setAiApplying(false);
    }
  }
  if (editor.loading) return <p role="status">Загрузка статьи…</p>;
  if (id && !editor.record)
    return (
      <div>
        <a className="text-link" href="/admin/articles/">
          ← Назад к статьям
        </a>
        <p className="form-error" role="alert">
          {editor.error || 'Статья не найдена.'}
        </p>
      </div>
    );
  return (
    <div className="article-admin-editor">
      <a className="article-admin-back" href="/admin/articles/">
        ← Назад к статьям
      </a>
      <div className="article-admin-heading">
        <div>
          <p className="eyebrow">Блог Николая Бойкова</p>
          <h1>{id ? 'Редактирование статьи' : 'Новая статья'}</h1>
        </div>
        {!id && <p role="status">{editor.draftStatus}</p>}
      </div>
      {editor.record?.status === 'published' && (
        <aside className="article-published-notice">
          <div>
            <strong>Статья опубликована на сайте</strong>
            <p>
              Изменения после сохранения автоматически появятся в публичной
              версии.
            </p>
          </div>
          <a
            href={'/blog/' + editor.record.slug + '/'}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть статью ↗
          </a>
        </aside>
      )}
      <div className="article-admin-workspace">
        <div>
          <ArticleFields
            form={editor.form}
            onChange={editor.change}
            categories={categories}
            editing={!!id}
            disabled={editor.pending || aiApplying}
            onOpenAssistant={openAssistant}
          />
        </div>
        <aside
          className="article-admin-actions"
          aria-label="Действия со статьёй"
        >
          <h2>Действия</h2>
          <button
            type="button"
            disabled={editor.pending || aiApplying}
            onClick={() => openAssistant()}
          >
            ✦ ИИ-помощник
          </button>
          <button
            type="button"
            disabled={editor.pending || aiApplying}
            onClick={preview}
          >
            Предпросмотр статьи
          </button>
          <button
            type="button"
            disabled={editor.pending || aiApplying}
            onClick={editor.save}
          >
            {editor.pending ? 'Сохранение…' : 'Сохранить'}
          </button>
          {editor.record?.status === 'published' && (
            <a
              href={'/blog/' + editor.record.slug + '/'}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть на сайте ↗
            </a>
          )}
          {(editor.error || previewError) && (
            <p className="form-error" role="alert">
              {editor.error || previewError}
            </p>
          )}
        </aside>
      </div>
      {aiOpen && (
        <AIAssistant
          target={aiTarget}
          result={aiResult}
          setResult={setAiResult}
          metadata={aiMetadata}
          setMetadata={setAiMetadata}
          resultApplied={aiResultApplied}
          setResultApplied={setAiResultApplied}
          appliedMetadata={aiAppliedMetadata}
          setAppliedMetadata={setAiAppliedMetadata}
          articleTitle={editor.form.title}
          articleContent={editor.form.content}
          onApplyText={applyAiText}
          onAutofill={autofillAiResult}
          onApplyMetadata={applyAiMetadata}
          onApplyImage={applyAiImage}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  );
}
