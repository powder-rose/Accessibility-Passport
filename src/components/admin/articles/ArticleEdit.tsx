import { useEffect, useState } from 'react';
import { useArticleForm } from './useArticleForm';
import { articleRequest } from './api';
import { storeArticlePreview } from './preview-storage';
import ArticleFields from './ArticleFields';
import ArticlePublication from './ArticlePublication';
import { articleSaveLabel, scheduledDate } from '@/features/articles/schedule';

export default function ArticleEdit({ id }: { id?: string }) {
  const editor = useArticleForm(id);
  const [categories, setCategories] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState('');
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
      {editor.record?.status === 'scheduled' && (
        <aside className="article-scheduled-notice">
          <strong>
            Публикация запланирована на{' '}
            {scheduledDate(editor.record.scheduledAt)}
          </strong>
          <p>
            До этого времени статья доступна только в админке. Измените дату
            ниже или отмените расписание.
          </p>
        </aside>
      )}
      <div className="article-admin-workspace">
        <div>
          <ArticleFields
            form={editor.form}
            onChange={editor.change}
            categories={categories}
            editing={!!id}
            disabled={editor.pending}
          />
        </div>
        <aside
          className="article-admin-actions"
          aria-label="Действия со статьёй"
        >
          <ArticlePublication
            form={editor.form}
            savedStatus={editor.record?.status}
            disabled={editor.pending}
            onChange={editor.change}
          />
          <button type="button" disabled={editor.pending} onClick={preview}>
            Предпросмотр статьи
          </button>
          <button
            type="button"
            disabled={editor.pending}
            onClick={() => editor.save()}
          >
            {editor.pending
              ? 'Сохранение…'
              : articleSaveLabel(editor.form.status, editor.record?.status)}
          </button>
          {editor.record?.status === 'scheduled' && (
            <button
              type="button"
              disabled={editor.pending}
              onClick={() =>
                editor.save({ status: 'draft', scheduledAt: null })
              }
            >
              Отменить расписание
            </button>
          )}
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
    </div>
  );
}
