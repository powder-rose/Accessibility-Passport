import { z } from 'zod';
const short = z.string().max(500);
const copy = z.string().max(8000);
const localLink = z
  .string()
  .max(300)
  .refine(
    (v) => !v || /^\/(?!\/)[\w\-/]*\/?(?:#[\w-]+)?$/.test(v),
    'Только внутренний опубликованный адрес',
  );
const item = z.object({
  title: short,
  text: copy.optional(),
  label: short.optional(),
  action: short.optional(),
  service: short.optional(),
  points: z.array(copy).max(20).optional(),
  image: z
    .string()
    .regex(/^\/images\/[a-z0-9-]+\.(webp|svg)$/)
    .optional(),
  objectType: short.optional(),
  url: localLink.optional(),
});
const section = z.object({
  eyebrow: short,
  title: short,
  description: copy.optional(),
  paragraphs: z.array(copy).max(15).optional(),
  items: z.array(item).max(30).optional(),
  benefits: z.array(copy).max(15).optional(),
  flow: z.array(short).max(10).optional(),
  note: copy.optional(),
  noteTitle: short.optional(),
  noteText: copy.optional(),
  quote: copy.optional(),
});
export const contentSchema = z.object({
  site: z.object({
    brand: short,
    direction: short,
    company: short,
    inn: z.string().regex(/^\d{10,12}$/),
    ogrn: z.string().regex(/^\d{13,15}$/),
    phone: short,
    email: z.union([z.literal(''), z.string().email()]),
    domain: z.string().url().startsWith('https://'),
    metrikaId: z.string().regex(/^\d*$/),
    heroImage: z.string().regex(/^\/images\/[a-z0-9-]+\.(webp|svg)$/),
    expertImage: z.string().regex(/^\/images\/[a-z0-9-]+\.(webp|svg)$/),
  }),
  seo: z.object({
    title: short,
    description: copy,
    canonical: z.string().url().startsWith('https://'),
  }),
  sections: z
    .record(section)
    .refine(
      (v) => Array.from({ length: 17 }, (_, i) => String(i + 1)).every((k) => !!v[k]),
      'Необходимы все 17 блоков',
    ),
  services: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z]+$/),
        label: short,
        title: short,
        description: copy,
        price: z.number().int().positive().max(10000000),
        from: z.boolean(),
        note: short,
        action: short,
      }),
    )
    .length(5)
    .refine(
      (v) =>
        ['passport', 'survey', 'questionnaire', 'support', 'full'].every((id) =>
          v.some((x) => x.id === id),
        ),
      'Сохраните идентификаторы услуг',
    ),
  quiz: z.object({
    enabled: z.boolean(),
    questions: z
      .array(
        z.object({
          id: z.string(),
          title: short,
          hint: short,
          required: z.boolean(),
          multiple: z.boolean(),
          options: z
            .array(z.object({ id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/), label: short }))
            .min(2)
            .max(20)
            .refine((v) => new Set(v.map((x) => x.id)).size === v.length),
        }),
      )
      .length(5)
      .refine(
        (v) =>
          ['objectType', 'purpose', 'existingPassport', 'documentation', 'materials'].every((id) =>
            v.some((x) => x.id === id),
          ),
        'Сохраните идентификаторы вопросов',
      ),
    successTitle: short,
    successText: copy,
  }),
});
