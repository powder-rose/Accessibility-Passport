import { z } from 'zod';
import { serviceFromAnswers } from '../../src/lib/service-intent';
import { routes } from '../../src/lib/routes';
import { getSiteContent } from '../content';
import { classify } from '../../src/lib/classify';
import { sha256, equal } from '../../src/lib/crypto';
import { sameOrigin, rateLimit, jsonError } from './security';
import type { ApiContext } from './context';
const leadSchema = z.object({
  requestId: z.string().uuid(),
  source: z.enum(['express', 'contact']),
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .max(25)
    .refine((x) => {
      const n = x.replace(/\D/g, '').length;
      return n >= 10 && n <= 15;
    }),
  email: z.union([z.literal(''), z.string().email().max(200)]),
  consent: z.literal(true),
  website: z.literal(''),
  startedAt: z.number().positive(),
  pageUrl: z.string().url().max(2000),
  utm: z
    .record(z.string().max(300))
    .refine((x) =>
      Object.keys(x).every((k) =>
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].includes(k),
      ),
    ),
  service: z.string().max(100).optional(),
  objectType: z.string().max(100).optional(),
  comment: z.string().max(3000).optional(),
  answers: z.record(z.array(z.string().max(100)).max(20)).optional(),
});
export async function POST(request: Request, context: ApiContext) {
  if (!sameOrigin(request)) return jsonError('Недопустимый источник запроса.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return jsonError('Ожидается JSON.', 415);
  try {
    const raw = await request.text();
    if (raw.length > 18000) return jsonError('Слишком большой запрос.', 413);
    const parsed = leadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return jsonError('Проверьте имя, телефон и согласие на обработку данных.');
    const data = parsed.data;
    if (Date.now() - data.startedAt < 1500)
      return jsonError('Повторите отправку через несколько секунд.', 429);
    if (new URL(data.pageUrl).origin !== new URL(request.url).origin)
      return jsonError('Недопустимый адрес страницы.', 400);
    const hash = await sha256(JSON.stringify(data));
    const existing = context.store.findLeadHash(data.requestId);
    if (existing)
      return equal(existing, hash)
        ? Response.json({ ok: true, id: data.requestId })
        : jsonError('Данные заявки изменились. Повторите отправку.', 409);
    if (!(await rateLimit(context, 'lead', 8, 600)))
      return jsonError('Слишком много запросов. Попробуйте позже.', 429);
    const content = getSiteContent();
    const answers = data.answers || {};
    if (
      data.service &&
      !content.services.some((s) => s.id === data.service) &&
      data.service !== 'update'
    )
      return jsonError('Неизвестная услуга.');
    if (
      data.objectType &&
      !content.quiz.questions
        .find((q) => q.id === 'objectType')
        ?.options.some((o) => o.id === data.objectType)
    )
      return jsonError('Неизвестный тип объекта.');
    if (data.source === 'express') {
      if (!content.quiz.enabled) return jsonError('Проверка временно недоступна.', 409);
      if (Object.keys(answers).some((k) => !content.quiz.questions.some((q) => q.id === k)))
        return jsonError('Состав вопросов изменился. Обновите страницу.', 409);
      for (const q of content.quiz.questions) {
        const a = answers[q.id] || [];
        if (
          (q.required && !a.length) ||
          (!q.multiple && a.length > 1) ||
          new Set(a).size !== a.length ||
          a.some((v) => !q.options.some((o) => o.id === v))
        )
          return jsonError('Ответьте на обязательные вопросы проверки.');
      }
    }
    const resolved = content.quiz.questions.map((q) => ({
      id: q.id,
      question: q.title,
      answers: (answers[q.id] || []).map((id) => ({
        id,
        label: q.options.find((o) => o.id === id)?.label || id,
      })),
    }));
    const selectedService =
      data.source === 'express' ? serviceFromAnswers(answers.documentation) : data.service;
    const sourcePage = new URL(data.pageUrl).pathname;
    const classification = data.source === 'express' ? classify(answers) : null;
    const createdAt = new Date().toISOString();
    const payload = {
      ...data,
      service: selectedService,
      sourcePage,
      initialService: sourcePage === routes.survey ? 'survey' : undefined,
      createdAt,
      sourceLabel: data.source === 'express' ? 'Экспресс-проверка ОСИ' : 'Форма обращения',
      classification,
      questions: resolved,
      serviceTitle:
        content.services.find((s) => s.id === selectedService)?.title ||
        (selectedService === 'update' ? 'Актуализация паспорта доступности' : ''),
      objectTypeLabel:
        content.quiz.questions
          .find((q) => q.id === 'objectType')
          ?.options.find((o) => o.id === (data.objectType || answers.objectType?.[0]))?.label || '',
      consentDocuments: { privacy: '/privacy/', personalData: '/personal-data/' },
    };
    context.store.insertLead(data.requestId, hash, payload, createdAt, data.source);
    const saved = context.store.findLeadHash(data.requestId);
    if (!saved || !equal(saved, hash))
      return jsonError('Не удалось сохранить заявку. Повторите попытку.', 409);
    return Response.json(
      { ok: true, id: data.requestId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return jsonError(
      'Не удалось отправить заявку. Ответы сохранены в форме — повторите попытку.',
      503,
    );
  }
}
