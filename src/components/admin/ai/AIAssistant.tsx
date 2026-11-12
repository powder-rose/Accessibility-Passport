import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { articleRequest, articleJson } from '../articles/api';
import { AdminRequestError } from '@/lib/admin-request';
import { articleSlug } from '@/features/articles/model';
import { extractSourceDocument } from './source-documents';
import { prepareReference } from './prepare-reference';
import { buildPrompt, GENERATION_SYSTEM } from './prompt';
import { useAssistantDraft } from './useAssistantDraft';
import {
  canApplyImage,
  listImageJobs,
  readImageJob,
  startImageJob,
  type ImageJob,
} from './image-request';
import type { AssistantDraft, SourceDocument } from './draft-store';
import type { AssistantMetadata } from './metadata';
import './assistant.css';

type Status = {
  configured: boolean;
  baseUrl?: string;
  textModel?: string;
  imageModel?: string;
};
type TextResult = {
  text: string;
  safeHtml: string;
  metadata: AssistantMetadata;
  usage?: Record<string, number>;
};
type ShareImport = {
  title: string;
  text: string;
  messageCount: number;
  omittedParts: number;
};
type Props = {
  articleTitle: string;
  articleContent: string;
  onApplyText: (html: string, title?: string) => Promise<void>;
  onApplyMetadata: (metadata: AssistantMetadata) => Promise<void>;
  onApplyImage: (
    file: File,
    slot: 'cover' | 'inline',
    alt: string,
    seoName: string,
  ) => Promise<void>;
  onClose: () => void;
};
const IMAGE_LIMIT = 5 * 1024 * 1024;
function readPhoto(file: File): Promise<string> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    !file.size ||
    file.size > IMAGE_LIMIT
  )
    return Promise.reject(
      new Error('Выберите фото JPG, PNG или WEBP размером до 5 МБ.'),
    );
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Не удалось прочитать фото.'));
    reader.onerror = () => reject(new Error('Не удалось прочитать фото.'));
    reader.readAsDataURL(file);
  });
}
function imageFile(dataUrl: string): File {
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match)
    throw new Error('Сервис вернул изображение в неподдерживаемом формате.');
  const raw = atob(match[2]);
  if (!raw.length || raw.length > IMAGE_LIMIT)
    throw new Error(
      'Изображение превышает 5 МБ. Его нельзя добавить в редактор.',
    );
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  return new File(
    [bytes],
    `ai-image.${match[1] === 'jpeg' ? 'jpg' : match[1]}`,
    { type: `image/${match[1]}` },
  );
}
export default function AIAssistant({
  articleTitle,
  articleContent,
  onApplyText,
  onApplyMetadata,
  onApplyImage,
  onClose,
}: Props) {
  const {
    draft,
    current,
    status: saveStatus,
    error: saveError,
    flush,
    update,
    hasConflict,
    overwriteAfterConflict,
  } = useAssistantDraft();
  const dialog = useRef<HTMLDialogElement>(null);
  const exampleInput = useRef<HTMLInputElement>(null);
  const sourceInput = useRef<HTMLInputElement>(null);
  const [connection, setConnection] = useState<Status>();
  const [baseUrl, setBaseUrl] = useState('https://ai.d1n0tf.ru/v1');
  const [apiKey, setApiKey] = useState('');
  const [textModel, setTextModel] = useState('gpt-6.1-terra');
  const [imageModel, setImageModel] = useState('gpt-image-2');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [includeCurrent, setIncludeCurrent] = useState(false);
  const [result, setResult] = useState<TextResult>();
  const [metadata, setMetadata] = useState<AssistantMetadata>();
  const [resultApplied, setResultApplied] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [inlineAltIndex, setInlineAltIndex] = useState(0);
  const [seoNameOverride, setSeoNameOverride] = useState<string | null>(null);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [image, setImage] = useState('');
  const [imageJob, setImageJob] = useState<ImageJob>();
  const [jobsLoading, setJobsLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [slot, setSlot] = useState<'cover' | 'inline'>('cover');
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    const controller = new AbortController();
    articleRequest<Status>('/api/admin/ai/status', {
      signal: controller.signal,
    })
      .then((value) => {
        setConnection(value);
        if (value.baseUrl) setBaseUrl(value.baseUrl);
        if (value.textModel) setTextModel(value.textModel);
        if (value.imageModel) setImageModel(value.imageModel);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Не удалось проверить подключение.',
          );
      });
    return () => {
      controller.abort();
      if (node?.open) node.close();
    };
  }, []);
  const loadJobs = useCallback(async (signal: AbortSignal) => {
    let saved = '';
    try {
      saved = localStorage.getItem('article-ai:image-job') || '';
    } catch {
      /* server history remains available */
    }
    try {
      const { jobs } = await listImageJobs(signal);
      const previous = jobs.find((job) => job.id === saved);
      if (saved && !previous) setImageJob({ id: saved, status: 'unknown' });
      else {
        const latest =
          jobs.find((job) => job.status === 'running') || previous || jobs[0];
        if (latest) setImageJob(await readImageJob(latest.id, signal));
      }
      if (!signal.aborted) setHistoryError(false);
    } catch {
      if (!signal.aborted) {
        if (saved) setImageJob({ id: saved, status: 'unknown' });
        setHistoryError(true);
        setError(
          'Не удалось проверить историю изображений. Повторите проверку перед новой генерацией.',
        );
      }
    } finally {
      if (!signal.aborted) setJobsLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void loadJobs(controller.signal);
    return () => controller.abort();
  }, [loadJobs]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (result && !resultApplied) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [result, resultApplied]);
  useEffect(() => {
    if (!imageJob) return;
    if (imageJob.status === 'succeeded' && imageJob.dataUrl) {
      try {
        imageFile(imageJob.dataUrl);
        setImage(imageJob.dataUrl);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Не удалось открыть изображение.',
        );
      }
      return;
    }
    if (imageJob.status !== 'running') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      readImageJob(imageJob.id, controller.signal)
        .then(setImageJob)
        .catch(() => {
          if (!controller.signal.aborted)
            setImageJob({ id: imageJob.id, status: 'unknown' });
        });
    }, 5000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [imageJob]);
  async function run(name: string, operation: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось выполнить действие.',
      );
    } finally {
      setBusy('');
    }
  }
  function patch<K extends keyof AssistantDraft>(
    field: K,
    value: AssistantDraft[K],
  ) {
    const candidate = { ...current.current, [field]: value };
    const { photos: _photos, ...materials } = candidate;
    if (JSON.stringify(materials).length > 1_000_000) {
      setError(
        'Общий объём материалов превышает 1 миллион символов. Уберите лишние документы.',
      );
      return;
    }
    setError('');
    update({ [field]: value });
  }
  function downloadRecovery() {
    const file = new Blob(
      [
        JSON.stringify({
          format: 'article-ai-recovery',
          version: 1,
          value: current.current,
        }),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ai-materials-recovery.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const blocked = Boolean(busy) || saveStatus === 'loading';
  const suggestedFileName = articleSlug(
    [metadata?.title || articleTitle || draft.topic, imageAlt]
      .filter(Boolean)
      .join(' '),
  )
    .slice(0, 90)
    .replace(/-+$/, '');
  async function close() {
    if (
      result &&
      !resultApplied &&
      !window.confirm(
        'Полученный текст ещё не перенесён в редактор и будет потерян. Закрыть ИИ-помощник?',
      )
    )
      return;
    await run('close', async () => {
      await flush();
      onClose();
    });
  }
  async function saveConnection() {
    await run('connect', async () => {
      const configured = await articleRequest<Status>(
        '/api/admin/ai/config',
        articleJson('POST', { baseUrl, apiKey, textModel, imageModel }),
      );
      setApiKey('');
      setConnection(configured);
      setNotice(
        'Настройки подключения сохранены на сервере. Ключ не показывается обратно.',
      );
    });
  }
  async function addDocuments(
    event: ChangeEvent<HTMLInputElement>,
    kind: 'documents' | 'examples',
  ) {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (!files.length) return;
    await run('documents', async () => {
      const existing = current.current[kind];
      if (files.length + existing.length > 20)
        throw new Error('Можно сохранить не более 20 документов каждого вида.');
      const added: SourceDocument[] = [];
      const problems: string[] = [];
      let total = existing.reduce((sum, item) => sum + item.text.length, 0);
      for (const file of files) {
        try {
          const item = await extractSourceDocument(file);
          if (item.truncated)
            throw new Error(
              'Документ длиннее 500 000 символов. Разделите его на части.',
            );
          if (total + item.text.length > 1_000_000)
            throw new Error(
              'Общий размер текстов превышает 1 миллион символов.',
            );
          total += item.text.length;
          added.push({
            id: crypto.randomUUID(),
            name: item.name,
            text: item.text,
            emptyPages: item.emptyPages || 0,
          });
        } catch (reason) {
          problems.push(
            `${file.name}: ${reason instanceof Error ? reason.message : 'ошибка чтения.'}`,
          );
        }
      }
      if (added.length) {
        const candidate = {
          ...current.current,
          [kind]: [...existing, ...added],
        };
        const { photos: _photos, ...materials } = candidate;
        if (JSON.stringify(materials).length > 1_000_000)
          throw new Error(
            'Общий объём примеров, источников и заданий превышает 1 миллион символов. Уберите лишние документы: новые файлы не добавлены.',
          );
        update({ [kind]: [...existing, ...added] });
        await flush();
      }
      if (problems.length) throw new Error(problems.join(' · '));
      setNotice(
        `Добавлено документов: ${added.length}. Сохранён извлечённый текст, а не оригинал файла.`,
      );
    });
  }
  async function uploadPhoto(
    index: 0 | 1,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    await run('photo', async () => {
      const prepared = await prepareReference(file);
      const data = await readPhoto(prepared);
      const photos: [string, string] = [...current.current.photos];
      photos[index] = data;
      update({ photos });
      await flush();
      setNotice(
        file.size > IMAGE_LIMIT
          ? `Фото ${index + 1} сжато на компьютере и сохранено. Исходный файл не изменён.`
          : `Фото ${index + 1} сохранено.`,
      );
    });
  }
  async function generateText() {
    await run('text', async () => {
      await flush();
      const materials = current.current;
      if (
        materials.chatEnabled &&
        materials.chatContext.trim() &&
        materials.chatOmittedParts > 0 &&
        !window.confirm(
          'В чате обнаружены вложения или другие нетекстовые материалы, которые не удалось прочитать. Добавьте необходимые документы отдельно. Продолжить с доступным текстом?',
        )
      )
        return;
      const partial = materials.documents.filter(
        (document) => document.emptyPages > 0,
      );
      if (
        partial.length &&
        !window.confirm(
          `В этих документах есть страницы без текста: ${partial.map((document) => document.name).join(', ')}. Они не попадут в запрос. Продолжить?`,
        )
      )
        return;
      const prompt = buildPrompt(materials, articleContent, includeCurrent);
      const response = await articleRequest<TextResult>(
        '/api/admin/ai/text',
        articleJson('POST', {
          prompt,
          system: GENERATION_SYSTEM,
          structured: true,
        }),
        { timeoutMs: 240_000 },
      );
      if (
        !response.text?.trim() ||
        !response.safeHtml?.trim() ||
        !response.metadata
      )
        throw new Error('Сервис не вернул пригодный текст.');
      setResult(response);
      setMetadata(response.metadata);
      setImageAlt(
        slot === 'cover'
          ? response.metadata.imageAlt
          : response.metadata.inlineImageAlts[0] || '',
      );
      setInlineAltIndex(0);
      setResultApplied(false);
      setNotice(
        'Черновик получен. Проверьте нормы и факты перед применением. Стоимость смотрите в кабинете шлюза.',
      );
    });
  }
  async function importChat() {
    await run('chat', async () => {
      await flush();
      const url = current.current.chatUrl.trim();
      if (!url) throw new Error('Вставьте общую ссылку на чат ChatGPT.');
      const imported = await articleRequest<ShareImport>(
        '/api/admin/ai/share-import',
        articleJson('POST', { url }),
      );
      if (!imported.text?.trim())
        throw new Error('Текст чата не найден. Вставьте его вручную.');
      if (imported.text.length > 100_000)
        throw new Error(
          'Чат слишком длинный для одного запроса. Скопируйте нужные сообщения в поле ниже.',
        );
      if (
        current.current.chatContext.trim() &&
        current.current.chatContext !== imported.text &&
        !window.confirm('Заменить сохранённый текст чата загруженной версией?')
      )
        return;
      update({
        chatContext: imported.text,
        chatEnabled: true,
        chatOmittedParts:
          Number.isSafeInteger(imported.omittedParts) &&
          imported.omittedParts > 0
            ? imported.omittedParts
            : 0,
      });
      await flush();
      setNotice(
        `Загружено сообщений: ${imported.messageCount}. Проверьте текст чата перед генерацией.`,
      );
    });
  }
  async function generateImage() {
    await run('image', async () => {
      await flush();
      if (!imagePrompt.trim()) throw new Error('Опишите сюжет изображения.');
      const photos = current.current.photos.filter(Boolean);
      if (includePhotos && photos.length !== 2)
        throw new Error('Добавьте оба фото Николая или отключите их передачу.');
      if (
        imageJob?.status === 'unknown' &&
        !window.confirm(
          'Результат предыдущего запроса неизвестен, и он мог быть платным. Проверили историю расходов и хотите отправить новый запрос?',
        )
      )
        return;
      const requestId = crypto.randomUUID();
      setSeoNameOverride(null);
      setImage('');
      setImageJob(undefined);
      try {
        localStorage.setItem('article-ai:image-job', requestId);
      } catch {
        /* server history remains available */
      }
      try {
        const next = await startImageJob(
          requestId,
          imagePrompt,
          includePhotos ? photos : [],
        );
        setImageJob(next);
        setImage('');
        setNotice(
          'Генерация запущена. Можно закрыть окно или обновить страницу: результат сохранится на сайте на 24 часа.',
        );
      } catch (reason) {
        if (
          reason instanceof AdminRequestError &&
          reason.kind === 'http' &&
          reason.status &&
          reason.status < 500
        ) {
          try {
            localStorage.removeItem('article-ai:image-job');
          } catch {
            /* optional */
          }
          throw reason;
        }
        setImageJob({ id: requestId, status: 'unknown' });
        throw new Error(
          'Не удалось подтвердить запуск. Проверьте статус и историю расходов перед повтором.',
          { cause: reason },
        );
      }
    });
  }
  async function checkImageJob() {
    if (!imageJob) return;
    await run('check-image', async () => {
      const next = await readImageJob(imageJob.id);
      setImageJob(next);
      setNotice(
        next.status === 'running'
          ? 'Генерация ещё выполняется.'
          : 'Статус изображения обновлён.',
      );
    });
  }

  return (
    <dialog
      ref={dialog}
      className="article-ai"
      aria-labelledby="article-ai-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!blocked) void close();
      }}
    >
      <div className="article-ai-head">
        <div>
          <h2 id="article-ai-title">✦ ИИ-помощник</h2>
          <p>Подготовка статьи и иллюстраций</p>
        </div>
        <button
          type="button"
          aria-label="Закрыть ИИ-помощник"
          disabled={blocked}
          onClick={() => void close()}
        >
          ×
        </button>
      </div>
      <p className="article-ai-note">
        При генерации выбранный сервис получает текст задания, источники и, если
        включено, фотографии Николая. Запросы могут быть платными.
      </p>
      <p className="article-ai-note">
        Стиль, источники и фотографии сохраняются в защищённом хранилище сайта и
        доступны после входа в админку в другом браузере. Ключ сохраняется на
        сервере.
      </p>
      {saveError && (
        <div>
          <p className="form-error" role="alert">
            {saveError}
          </p>
          <button type="button" onClick={downloadRecovery}>
            Скачать аварийную копию материалов
          </button>
          {hasConflict && (
            <button
              type="button"
              disabled={blocked}
              onClick={() => {
                if (
                  window.confirm(
                    'Сохранить показанный черновик поверх текущих общих материалов и фотографий на сайте? Сначала можно скачать аварийную копию.',
                  )
                )
                  void run('reconcile', overwriteAfterConflict);
              }}
            >
              Сохранить мой вариант поверх общих данных
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <p role="status">
        {
          {
            loading: 'Загружаем материалы…',
            saved: 'Материалы сохранены на сайте',
            pending: 'Сохраняем материалы…',
            saving: 'Сохраняем материалы…',
            error: 'Ошибка сохранения — не закрывайте окно',
          }[saveStatus]
        }
      </p>
      <details open={!connection?.configured}>
        <summary>
          1 · Подключение {connection?.configured ? '— настроено' : ''}
        </summary>
        <label>
          Адрес API
          <input
            type="url"
            value={baseUrl}
            disabled={blocked}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>
        <label>
          API-ключ
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            disabled={blocked}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              connection?.configured
                ? 'Оставьте пустым, чтобы сохранить текущий'
                : 'Вставьте ключ'
            }
          />
        </label>
        <label>
          Модель текста
          <input
            value={textModel}
            maxLength={200}
            disabled={blocked}
            onChange={(event) => setTextModel(event.target.value)}
          />
        </label>
        <label>
          Модель изображений
          <input
            value={imageModel}
            maxLength={200}
            disabled={blocked}
            onChange={(event) => setImageModel(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={blocked || (!connection?.configured && !apiKey)}
          onClick={() => void saveConnection()}
        >
          Сохранить подключение
        </button>
      </details>
      <details>
        <summary>Контекст чата ChatGPT</summary>
        <p className="article-ai-note">
          Вставьте общую ссылку на чат и загрузите доступные сообщения. Ссылка
          личного чата обычно содержит снимок: после новых сообщений её нужно
          обновить в ChatGPT и загрузить заново. Замена ссылки сама по себе не
          обновляет текст. Любой, у кого есть ссылка, может увидеть
          опубликованный чат.
        </p>
        <label>
          Ссылка на общий чат ChatGPT
          <input
            type="url"
            value={draft.chatUrl}
            disabled={blocked}
            placeholder="https://chatgpt.com/share/…"
            onChange={(event) => patch('chatUrl', event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={blocked || !draft.chatUrl.trim()}
          onClick={() => void importChat()}
        >
          Загрузить текст чата
        </button>
        <p className="article-ai-note">
          Если общая ссылка недоступна для автоматического чтения, вставьте
          нужные сообщения вручную. Прикреплённые к чату документы и изображения
          автоматически не читаются: загрузите необходимые оригиналы отдельно.
          Перед генерацией проверьте текст: он будет отправлен выбранному
          сервису вместе с заданием.
        </p>
        {draft.chatOmittedParts > 0 && (
          <p className="form-error" role="alert">
            Не удалось прочитать нетекстовых вложений или частей:{' '}
            {draft.chatOmittedParts}. Добавьте необходимые документы отдельно.
          </p>
        )}
        <label>
          Текст и правила из чата
          <textarea
            rows={8}
            value={draft.chatContext}
            disabled={blocked}
            onChange={(event) => patch('chatContext', event.target.value)}
            placeholder="Здесь появятся сообщения из чата; их также можно вставить вручную."
          />
        </label>
        <label className="article-ai-check">
          <input
            type="checkbox"
            checked={draft.chatEnabled}
            disabled={blocked}
            onChange={(event) => patch('chatEnabled', event.target.checked)}
          />{' '}
          Учитывать этот чат при создании статьи
        </label>
      </details>
      <details open>
        <summary>2 · Стиль и материалы</summary>
        <label>
          Тема кластера и будущей статьи
          <textarea
            rows={2}
            maxLength={18000}
            value={draft.topic}
            disabled={blocked}
            onChange={(event) => patch('topic', event.target.value)}
          />
        </label>
        <label>
          Общий стиль и правила
          <textarea
            rows={5}
            maxLength={18000}
            value={draft.style}
            disabled={blocked}
            onChange={(event) => patch('style', event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={blocked}
          onClick={() => exampleInput.current?.click()}
        >
          Загрузить примеры статей
        </button>
        <input
          ref={exampleInput}
          hidden
          type="file"
          accept=".txt,.md,.markdown,.docx,.pdf"
          multiple
          onChange={(event) => void addDocuments(event, 'examples')}
        />
        <p className="article-ai-note">
          Из примеров автоматически подбираются фрагменты по теме — не более 12
          000 символов. Остальная часть хранится для следующих статей.
        </p>
        <DocumentList
          documents={draft.examples}
          disabled={blocked}
          onRemove={(id) =>
            patch(
              'examples',
              draft.examples.filter((item) => item.id !== id),
            )
          }
        />
        <label>
          Законы и другие источники
          <textarea
            rows={5}
            maxLength={18000}
            value={draft.sources}
            disabled={blocked}
            onChange={(event) => patch('sources', event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={blocked}
          onClick={() => sourceInput.current?.click()}
        >
          Загрузить законы и документы
        </button>
        <input
          ref={sourceInput}
          hidden
          type="file"
          accept=".txt,.md,.markdown,.docx,.pdf"
          multiple
          onChange={(event) => void addDocuments(event, 'documents')}
        />
        <p className="article-ai-note">
          TXT, MD, DOCX и PDF с текстом, до 15 МБ и 500 000 символов на файл.
          PDF-сканы требуют распознавания. Все выбранные источники передаются
          целиком, если помещаются в запрос.
        </p>
        <DocumentList
          documents={draft.documents}
          disabled={blocked}
          onRemove={(id) =>
            patch(
              'documents',
              draft.documents.filter((item) => item.id !== id),
            )
          }
        />
      </details>
      <details open>
        <summary>3 · Черновик статьи</summary>
        <label>
          Задание для модели
          <textarea
            rows={4}
            maxLength={18000}
            value={draft.instruction}
            disabled={blocked}
            onChange={(event) => patch('instruction', event.target.value)}
          />
        </label>
        <label className="article-ai-check">
          <input
            type="checkbox"
            checked={includeCurrent}
            disabled={blocked || !articleContent}
            onChange={(event) => setIncludeCurrent(event.target.checked)}
          />{' '}
          Передать также текст текущей статьи
        </label>
        <button
          type="button"
          disabled={blocked || !connection?.configured}
          onClick={() => void generateText()}
        >
          {busy === 'text' ? 'Генерируем…' : 'Сгенерировать статью'}
        </button>
        {result && (
          <>
            <div
              className="article-ai-preview"
              aria-label="Предпросмотр черновика"
              dangerouslySetInnerHTML={{ __html: result.safeHtml }}
            />
            <button
              type="button"
              disabled={blocked}
              onClick={() =>
                void run('apply', async () => {
                  await flush();
                  await onApplyText(result.safeHtml);
                  setResultApplied(true);
                  setNotice(
                    'Текст перенесён в редактор. Проверьте его перед сохранением.',
                  );
                })
              }
            >
              Перенести в редактор
            </button>
            {metadata && (
              <div className="article-ai-metadata">
                <h3>Заголовок, URL и SEO</h3>
                <p className="article-ai-note">
                  Проверьте и при необходимости измените предложения. Alt
                  составлен по описанию сюжета: сверьте его с готовой картинкой.
                </p>
                <label>
                  Тема кластера
                  <input
                    value={metadata.clusterTopic}
                    maxLength={500}
                    disabled={blocked}
                    onChange={(event) =>
                      setMetadata({
                        ...metadata,
                        clusterTopic: event.target.value,
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={blocked || !metadata.clusterTopic.trim()}
                  onClick={() =>
                    void run('apply-topic', async () => {
                      if (
                        current.current.topic.trim() &&
                        current.current.topic.trim() !==
                          metadata.clusterTopic.trim() &&
                        !window.confirm(
                          'Заменить сохранённую тему кластера предложенной?',
                        )
                      )
                        return;
                      patch('topic', metadata.clusterTopic.trim());
                      await flush();
                      setNotice('Тема кластера сохранена в материалах.');
                    })
                  }
                >
                  Сохранить тему кластера
                </button>
                {(
                  [
                    ['title', 'Заголовок статьи', 240],
                    ['slug', 'URL статьи /blog/', 160],
                    ['seoTitle', 'SEO Title', 240],
                    ['seoDescription', 'SEO Description', 500],
                    ['imageAlt', 'Alt обложки', 500],
                  ] as const
                ).map(([key, label, limit]) => (
                  <label key={key}>
                    {label}
                    <input
                      value={metadata[key]}
                      maxLength={limit}
                      disabled={blocked}
                      onChange={(event) =>
                        setMetadata({ ...metadata, [key]: event.target.value })
                      }
                    />
                  </label>
                ))}
                {[0, 1, 2].map((index) => (
                  <label key={index}>
                    Alt иллюстрации {index + 1}
                    <input
                      value={metadata.inlineImageAlts[index] || ''}
                      maxLength={500}
                      disabled={blocked}
                      onChange={(event) => {
                        const inlineImageAlts = [...metadata.inlineImageAlts];
                        inlineImageAlts[index] = event.target.value;
                        setMetadata({ ...metadata, inlineImageAlts });
                      }}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() =>
                    void run('apply-metadata', async () => {
                      await onApplyMetadata(metadata);
                      setNotice(
                        'Поля перенесены в редактор. Проверьте их перед сохранением.',
                      );
                    })
                  }
                >
                  Перенести заголовок и SEO в редактор
                </button>
              </div>
            )}
          </>
        )}
      </details>
      <details>
        <summary>4 · Фото Николая и изображение</summary>
        <p className="article-ai-note">
          Выберите до двух фото (JPG, PNG или WEBP, до 20 МБ каждое). Большие
          снимки сжимаются на вашем компьютере; исходные файлы не изменяются.
        </p>
        <div className="article-ai-photos">
          {([0, 1] as const).map((index) => (
            <div key={index}>
              <label>
                Фото {index + 1}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={blocked}
                  onChange={(event) => void uploadPhoto(index, event)}
                />
              </label>
              {draft.photos[index] && (
                <>
                  <img
                    src={draft.photos[index]}
                    alt={`Фото Николая ${index + 1}`}
                  />
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      const photos: [string, string] = [...draft.photos];
                      photos[index] = '';
                      patch('photos', photos);
                    }}
                  >
                    Убрать фото
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <label>
          Сюжет изображения
          <textarea
            rows={5}
            maxLength={18000}
            value={imagePrompt}
            disabled={blocked}
            onChange={(event) => setImagePrompt(event.target.value)}
            placeholder="Николай осматривает вход в здание…"
          />
        </label>
        <button
          type="button"
          disabled={blocked}
          onClick={() =>
            setImagePrompt(
              `Создай фотореалистичную иллюстрацию для статьи «${draft.topic || articleTitle}». Николай — главный участник сцены, сохрани его узнаваемые черты по обеим фотографиям. Изобрази ситуацию по теме статьи, без текста и логотипов.`,
            )
          }
        >
          Сформировать запрос по теме
        </button>
        <label className="article-ai-check">
          <input
            type="checkbox"
            checked={includePhotos}
            disabled={blocked}
            onChange={(event) => setIncludePhotos(event.target.checked)}
          />{' '}
          Отправить два фото Николая ({draft.photos.filter(Boolean).length} из
          2)
        </label>
        <button
          type="button"
          disabled={
            blocked ||
            jobsLoading ||
            historyError ||
            !connection?.configured ||
            imageJob?.status === 'running'
          }
          onClick={() => void generateImage()}
        >
          {busy === 'image' ? 'Генерируем…' : 'Сгенерировать изображение'}
        </button>
        {historyError && (
          <div className="form-error" role="alert">
            История запросов недоступна. Новая генерация отключена, чтобы
            избежать повторного платного запроса.{' '}
            <button
              type="button"
              disabled={blocked}
              onClick={() => {
                setJobsLoading(true);
                void loadJobs(new AbortController().signal);
              }}
            >
              Проверить ещё раз
            </button>
          </div>
        )}
        {imageJob && (
          <div className="article-ai-job" role="status">
            {imageJob.status === 'running' &&
              'Изображение создаётся. Можно закрыть окно: оно сохранится на сайте.'}
            {imageJob.status === 'succeeded' &&
              'Готовое изображение хранится на сайте 24 часа.'}
            {imageJob.status === 'failed' &&
              `Генерация завершилась ошибкой: ${imageJob.error || 'проверьте настройки сервиса.'}`}
            {imageJob.status === 'unknown' &&
              (imageJob.error ||
                'Результат неизвестен. Проверьте статус и расходы, прежде чем отправлять запрос повторно.')}
            {imageJob.status === 'expired' &&
              'Срок хранения изображения истёк.'}
            {imageJob.status !== 'succeeded' && (
              <button
                type="button"
                disabled={blocked}
                onClick={() => void checkImageJob()}
              >
                Проверить статус
              </button>
            )}
          </div>
        )}
        {canApplyImage(image, imageJob) && (
          <>
            <img
              className="article-ai-result"
              src={image}
              alt="Предпросмотр результата генерации"
            />
            <label>
              Куда добавить
              <select
                value={slot}
                disabled={blocked}
                onChange={(event) => {
                  const next =
                    event.target.value === 'inline' ? 'inline' : 'cover';
                  setSlot(next);
                  if (metadata)
                    setImageAlt(
                      next === 'cover'
                        ? metadata.imageAlt
                        : metadata.inlineImageAlts[inlineAltIndex] || '',
                    );
                }}
              >
                <option value="cover">Обложка</option>
                <option value="inline">В текст перед H2</option>
              </select>
            </label>
            <label>
              Описание изображения (alt)
              <input
                maxLength={500}
                value={imageAlt}
                disabled={blocked}
                onChange={(event) => setImageAlt(event.target.value)}
              />
            </label>
            <label>
              Имя файла для сайта (SEO)
              <input
                maxLength={120}
                value={seoNameOverride ?? suggestedFileName}
                disabled={blocked}
                onChange={(event) => setSeoNameOverride(event.target.value)}
              />
            </label>
            <p className="article-ai-note">
              Имя станет частью адреса изображения; сайт сохранит файл в WebP и
              при совпадении добавит порядковый номер.
            </p>
            <button
              type="button"
              disabled={
                blocked ||
                !imageAlt.trim() ||
                !(seoNameOverride ?? suggestedFileName).trim()
              }
              onClick={() =>
                void run('apply', async () => {
                  await onApplyImage(
                    imageFile(image),
                    slot,
                    imageAlt.trim(),
                    (seoNameOverride ?? suggestedFileName).trim(),
                  );
                  setSeoNameOverride(null);
                  if (slot === 'inline' && metadata) {
                    const next = Math.min(2, inlineAltIndex + 1);
                    setInlineAltIndex(next);
                    setImageAlt(metadata.inlineImageAlts[next] || '');
                  }
                  setNotice('Изображение перенесено в редактор.');
                })
              }
            >
              Добавить в статью
            </button>
          </>
        )}
      </details>
      {busy && (
        <p role="status">
          {busy === 'documents'
            ? 'Читаем документы…'
            : busy === 'text' || busy === 'image'
              ? 'Ожидаем ответ сервиса… Не повторяйте запрос, пока не проверите результат.'
              : 'Выполняем действие…'}
        </p>
      )}
    </dialog>
  );
}
function DocumentList({
  documents,
  onRemove,
  disabled,
}: {
  documents: SourceDocument[];
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  if (!documents.length) return null;
  return (
    <ul className="article-ai-documents">
      {documents.map((item) => (
        <li key={item.id}>
          <span>
            {item.name} · {item.text.length} символов{' '}
            {item.emptyPages > 0 && `· страниц без текста: ${item.emptyPages}`}
          </span>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Убрать ${item.name}`}
            onClick={() => onRemove(item.id)}
          >
            Убрать
          </button>
        </li>
      ))}
    </ul>
  );
}
