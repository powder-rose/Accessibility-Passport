import { useEffect, useRef, useState } from 'react';
import {
  articleFormSchema,
  emptyArticle,
  type ArticleRecord,
  type ArticleForm,
} from '@/features/articles/model';
import { createRequestId } from '@/lib/request-id';
import { articleRequest, saveArticle } from './api';
import { newArticleDraftKey as key } from './local-draft';

function initialDraft(id?: string) {
  if (id || typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') {
      localStorage.removeItem(key);
      params.delete('fresh');
      history.replaceState(
        null,
        '',
        location.pathname +
          (params.size ? '?' + params.toString() : '') +
          location.hash,
      );
      return null;
    }
    const draft = JSON.parse(localStorage.getItem(key) || 'null') as {
      form?: unknown;
      requestId?: string;
    } | null;
    const form = articleFormSchema.safeParse(draft?.form);
    return form.success
      ? { form: form.data, requestId: draft?.requestId }
      : null;
  } catch {
    return null;
  }
}
export function useArticleForm(id?: string) {
  const [draft] = useState(() => initialDraft(id));
  const [form, setForm] = useState<ArticleForm>(draft?.form || emptyArticle());
  const currentForm = useRef(form);
  const requestId = useRef(
    draft?.requestId && /^[a-f0-9-]{36}$/.test(draft.requestId)
      ? draft.requestId
      : createRequestId(),
  );
  const [record, setRecord] = useState<ArticleRecord>();
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const unsaved = useRef(false);
  const saved = useRef(false);
  const locked = useRef(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    articleRequest<{ article: ArticleRecord }>('/api/admin/articles/' + id, {
      signal: controller.signal,
    })
      .then(({ article }) => {
        setRecord(article);
        const next = articleFormSchema.parse(article);
        currentForm.current = next;
        setForm(next);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Не удалось загрузить статью.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);
  useEffect(() => {
    if (id || saved.current) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            form,
            requestId: requestId.current,
            savedAt: new Date().toISOString(),
          }),
        );
        setDraftStatus('Черновик сохранён в браузере.');
      } catch {
        setDraftStatus(
          'Не удалось сохранить черновик в браузере. Сохраните его на сервере.',
        );
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form, id]);
  useEffect(() => {
    if (!dirty || !id) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (unsaved.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, id]);
  function change<K extends keyof ArticleForm>(
    field: K,
    value: ArticleForm[K],
  ) {
    unsaved.current = true;
    setDirty(true);
    currentForm.current = { ...currentForm.current, [field]: value };
    setForm(currentForm.current);
  }
  async function save() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError('');
    try {
      const result = await saveArticle(form, requestId.current, record);
      saved.current = true;
      unsaved.current = false;
      setDirty(false);
      if (!id) localStorage.removeItem(key);
      setRecord(result.article);
      const next = articleFormSchema.parse(result.article);
      currentForm.current = next;
      setForm(next);
      location.assign('/admin/articles/');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Не удалось сохранить статью.',
      );
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return {
    form,
    currentForm,
    record,
    loading,
    pending,
    error,
    draftStatus,
    change,
    save,
  };
}
