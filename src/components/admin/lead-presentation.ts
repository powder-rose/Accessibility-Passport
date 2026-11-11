import type { LeadRecord } from '@/lib/leads';
import type { AttachmentMetadata } from '@/lib/attachments';

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

function localPage(value: unknown) {
  const path = text(value);
  return /^\/(?!\/)[^\\\s?#]*$/.test(path) ? path : '';
}

export function leadDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Дата не указана'
    : new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Moscow',
      }).format(date) + ' МСК';
}

export function presentLead(lead: LeadRecord) {
  const payload = lead.payload;
  const questions: { question: string; answers: string[] }[] = [];
  if (Array.isArray(payload.questions))
    for (const item of payload.questions) {
      if (!item || typeof item !== 'object') continue;
      const question = text(item.question);
      const answers = Array.isArray(item.answers)
        ? item.answers.flatMap((answer: unknown) => {
            const label =
              answer && typeof answer === 'object' && 'label' in answer
                ? text(answer.label)
                : text(answer);
            return label ? [label] : [];
          })
        : [];
      if (question && answers.length) questions.push({ question, answers });
    }
  const files: Pick<AttachmentMetadata, 'id' | 'name' | 'size'>[] =
    Array.isArray(payload.attachments)
      ? payload.attachments.filter(
          (file): file is Pick<AttachmentMetadata, 'id' | 'name' | 'size'> =>
            !!file &&
            typeof file === 'object' &&
            typeof file.id === 'string' &&
            /^[a-f0-9-]{36}$/.test(file.id) &&
            typeof file.name === 'string' &&
            typeof file.size === 'number' &&
            Number.isFinite(file.size) &&
            file.size > 0,
        )
      : [];
  const classification = payload.classification;
  const result =
    classification &&
    typeof classification === 'object' &&
    'type' in classification
      ? text(classification.type)
      : '';
  const campaign = payload.utm;
  const campaignFields =
    campaign && typeof campaign === 'object'
      ? [
          ['utm_source', 'Источник'],
          ['utm_medium', 'Канал'],
          ['utm_campaign', 'Кампания'],
          ['utm_term', 'Ключевая фраза'],
          ['utm_content', 'Объявление'],
        ].flatMap(([key, label]) => {
          const value = text((campaign as Record<string, unknown>)[key]);
          return value ? [{ label, value }] : [];
        })
      : [];
  return {
    name: text(payload.name) || 'Без имени',
    phone: text(payload.phone),
    email: text(payload.email),
    source:
      text(payload.sourceLabel) ||
      (payload.source === 'express'
        ? 'Экспресс-проверка ОСИ'
        : 'Форма обращения'),
    service: text(payload.serviceTitle),
    object: text(payload.objectTypeLabel),
    comment: text(payload.comment),
    page: localPage(payload.sourcePage),
    passportDate: text(payload.passportDevelopedAt),
    result,
    questions,
    files,
    campaignFields,
  };
}
