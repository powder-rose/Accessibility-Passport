import type { ArticleForm } from '@/features/articles/model';
import {
  scheduleInput,
  scheduleTimestamp,
  scheduledDate,
} from '@/features/articles/schedule';

export default function ArticlePublication({
  form,
  savedStatus,
  disabled,
  onChange,
}: {
  form: ArticleForm;
  savedStatus?: ArticleForm['status'];
  disabled: boolean;
  onChange: <K extends keyof ArticleForm>(
    field: K,
    value: ArticleForm[K],
  ) => void;
}) {
  return (
    <div className="article-publication">
      <h2>Публикация</h2>
      <label>
        Когда опубликовать
        <select
          value={form.status}
          disabled={disabled}
          onChange={(event) =>
            onChange('status', event.target.value as ArticleForm['status'])
          }
        >
          <option value="draft">
            {savedStatus === 'published' ? 'Снять с публикации' : 'Черновик'}
          </option>
          <option value="published">
            {savedStatus === 'published'
              ? 'Оставить опубликованной'
              : 'Опубликовать сейчас'}
          </option>
          {savedStatus !== 'published' && (
            <option value="scheduled">По расписанию</option>
          )}
        </select>
      </label>
      {form.status === 'scheduled' && (
        <>
          <label>
            Дата и время · МСК
            <input
              type="datetime-local"
              step={60}
              required
              value={scheduleInput(form.scheduledAt)}
              disabled={disabled}
              onInput={(event) =>
                onChange(
                  'scheduledAt',
                  scheduleTimestamp(event.currentTarget.value),
                )
              }
            />
          </label>
          <p className="article-publication__hint">
            Московское время (UTC+3). Статья появится автоматически, даже если
            админка закрыта.
          </p>
          {form.scheduledAt && (
            <p className="article-publication__date">
              {scheduledDate(form.scheduledAt)}
            </p>
          )}
          <p className="article-publication__hint">
            Нажмите кнопку ниже, чтобы сохранить расписание.
          </p>
        </>
      )}
    </div>
  );
}
