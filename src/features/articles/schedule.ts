import type { ArticleForm } from './model';

const moscowOffset = 3 * 60 * 60 * 1000;

export function scheduleInput(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Date(Date.parse(value) + moscowOffset).toISOString().slice(0, 16);
}

export function scheduleTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value + ':00+03:00');
  if (!Number.isFinite(date.getTime())) return null;
  const timestamp = date.toISOString();
  return scheduleInput(timestamp) === value ? timestamp : null;
}

export function scheduledDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow',
      }).format(new Date(value)) + ' МСК'
    : '';
}

export function scheduleError(form: ArticleForm, now = Date.now()) {
  if (form.status !== 'scheduled') return '';
  if (!form.scheduledAt || !Number.isFinite(Date.parse(form.scheduledAt)))
    return 'Выберите дату и время публикации.';
  if (Date.parse(form.scheduledAt) <= now)
    return 'Выберите время публикации в будущем.';
  return '';
}

export function articleSaveLabel(
  status: ArticleForm['status'],
  savedStatus?: ArticleForm['status'],
) {
  if (status === 'scheduled')
    return savedStatus === 'scheduled'
      ? 'Сохранить расписание'
      : 'Запланировать';
  if (status === 'published')
    return savedStatus === 'published'
      ? 'Сохранить изменения'
      : 'Опубликовать сейчас';
  return 'Сохранить черновик';
}
