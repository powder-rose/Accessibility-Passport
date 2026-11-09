import { z } from 'zod';
import { serviceFromAnswers } from '../../src/lib/service-intent';
import { serviceForPath } from '../../src/lib/routes';
import { getSiteContent } from '../content';
import { classify } from '../../src/lib/classify';
import { sha256, equal } from '../../src/lib/crypto';
import { sameOrigin, rateLimit, jsonError } from './security';
import type { ApiContext } from './context';
import { getServiceContent } from '../service-content';
import { parseLeadRequest } from '../uploads/parse-lead';
import { UploadError } from '../uploads/errors';
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
    .record(z.string(), z.string().max(300))
    .refine((x) =>
      Object.keys(x).every((k) =>
        [
          'utm_source',
          'utm_medium',
          'utm_campaign',
          'utm_term',
          'utm_content',
        ].includes(k),
      ),
    ),
  service: z.string().max(100).optional(),
  objectType: z.string().max(100).optional(),
  comment: z.string().max(3000).optional(),
  passportDevelopedAt: z.string().trim().max(200).optional(),
  quizMode: z.literal('update').optional(),
  answers: z
    .record(z.string(), z.array(z.string().max(100)).max(20))
    .optional(),
});
export async function POST(request: Request, context: ApiContext) {
  if (!sameOrigin(request))
    return jsonError('Недопустимый источник запроса.', 403);
  try {
    const { input, attachments } = await parseLeadRequest(
      request,
      context.store.getAttachmentLimits(),
    );
    const parsed = leadSchema.safeParse(input);
    if (!parsed.success)
      return jsonError(
        'Проверьте имя, телефон и согласие на обработку данных.',
      );
    const data = parsed.data;
    if (Date.now() - data.startedAt < 1500)
      return jsonError('Повторите отправку через несколько секунд.', 429);
    if (new URL(data.pageUrl).origin !== new URL(request.url).origin)
      return jsonError('Недопустимый адрес страницы.', 400);
    const sourcePage = new URL(data.pageUrl).pathname;
    const updatePage = serviceForPath(sourcePage) === 'update';
    if (
      (attachments.length && (!updatePage || data.source !== 'contact')) ||
      (data.quizMode && (!updatePage || data.source !== 'express'))
    )
      return jsonError(
        'Вложения и вопросы актуализации доступны в соответствующей форме.',
      );
    const metadata = attachments.map(({ bytes: _bytes, ...file }) => file);
    const signature = attachments.map(
      ({ bytes: _bytes, id: _id, ...file }) => file,
    );
    const hash = await sha256(
      JSON.stringify(
        attachments.length ? { data, attachments: signature } : data,
      ),
    );
    const existing = context.store.findLeadHash(data.requestId);
    if (existing)
      return equal(existing, hash)
        ? Response.json({ ok: true, id: data.requestId })
        : jsonError('Данные заявки изменились. Повторите отправку.', 409);
    if (!(await rateLimit(context, 'lead', 8, 600)))
      return jsonError('Слишком много запросов. Попробуйте позже.', 429);
    const content = getSiteContent();
    const answers = data.answers || {};
    if (data.service && !content.services.some((s) => s.id === data.service))
      return jsonError('Неизвестная услуга.');
    if (
      data.objectType &&
      !content.quiz.questions
        .find((q) => q.id === 'objectType')
        ?.options.some((o) => o.id === data.objectType)
    )
      return jsonError('Неизвестный тип объекта.');
    const quiz =
      data.quizMode === 'update'
        ? getServiceContent('update', content).quiz!
        : content.quiz;
    if (data.source === 'express') {
      if (!quiz.enabled) return jsonError('Проверка временно недоступна.', 409);
      if (
        Object.keys(answers).some(
          (k) => !quiz.questions.some((q) => q.id === k),
        )
      )
        return jsonError('Состав вопросов изменился. Обновите страницу.', 409);
      for (const q of quiz.questions) {
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
    const resolved = quiz.questions.map((q) => ({
      id: q.id,
      question: q.title,
      answers: (answers[q.id] || []).map((id) => ({
        id,
        label: q.options.find((o) => o.id === id)?.label || id,
      })),
    }));
    const selectedService =
      data.source === 'express'
        ? data.quizMode === 'update'
          ? 'update'
          : serviceFromAnswers(answers.documentation)
        : data.service || (updatePage ? 'update' : undefined);
    const classification =
      data.source === 'express'
        ? data.quizMode === 'update'
          ? {
              type: 'Проверка действующей документации ОСИ.',
              clarification: true,
              context:
                'Состав работ определяется после анализа документов и изменений на объекте.',
              includesApprovalSupport: false,
            }
          : classify(answers)
        : null;
    const createdAt = new Date().toISOString();
    const payload = {
      ...data,
      service: selectedService,
      sourcePage,
      initialService: serviceForPath(sourcePage),
      createdAt,
      sourceLabel:
        data.source === 'express' ? 'Экспресс-проверка ОСИ' : 'Форма обращения',
      classification,
      questions: resolved,
      ...(metadata.length ? { attachments: metadata } : {}),
      serviceTitle:
        content.services.find((s) => s.id === selectedService)?.title ||
        (selectedService === 'update'
          ? 'Актуализация паспорта доступности'
          : ''),
      objectTypeLabel:
        content.quiz.questions
          .find((q) => q.id === 'objectType')
          ?.options.find(
            (o) => o.id === (data.objectType || answers.objectType?.[0]),
          )?.label || '',
      consentDocuments: {
        privacy: '/privacy/',
        personalData: '/personal-data/',
      },
    };
    context.store.insertLead(
      data.requestId,
      hash,
      payload,
      createdAt,
      data.source,
      attachments,
    );
    const saved = context.store.findLeadHash(data.requestId);
    if (!saved || !equal(saved, hash))
      return jsonError('Не удалось сохранить заявку. Повторите попытку.', 409);
    return Response.json(
      { ok: true, id: data.requestId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof UploadError && error.status < 500)
      return jsonError(error.message, error.status);
    const response =
      error instanceof UploadError
        ? jsonError(error.message, error.status)
        : jsonError(
            'Не удалось отправить заявку. Ответы сохранены в форме — повторите попытку.',
            503,
          );
    response.headers.set(
      'X-Incident-ID',
      context.diagnostics.failure('lead_submission', error),
    );
    return response;
  }
}
