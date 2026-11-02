import type { SiteContent } from './content-types';
import { price } from './content-types';
export function resolveContent(content: SiteContent): SiteContent {
  const services = new Map(content.services.map((s) => [s.id, s]));
  const survey = services.get('survey')!;
  const questionnaire = services.get('questionnaire')!;
  const related =
    survey.price === questionnaire.price
      ? `Акт обследования и анкета также стоят по ${price(survey)} каждый.`
      : `Акт обследования — ${price(survey)}, анкета — ${price(questionnaire)}.`;
  function resolve(value: unknown): unknown {
    if (typeof value === 'string')
      return value
        .replace(/\{\{price:([a-z]+)\}\}/g, (match, id) =>
          services.has(id) ? price(services.get(id)!) : match,
        )
        .replace('{{relatedDocumentPrices}}', related);
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
    return value;
  }
  return resolve(content) as SiteContent;
}
