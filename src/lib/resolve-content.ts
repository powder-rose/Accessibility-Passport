import type { Service, SiteContent } from './content-types';
import { price } from './content-types';
export function resolvePriceTokens<T>(content: T, catalog: Service[]): T {
  const services = new Map(catalog.map((s) => [s.id, s]));
  const survey = services.get('survey')!;
  const questionnaire = services.get('questionnaire')!;
  const related =
    survey.price === questionnaire.price
      ? `Акт обследования и анкета также стоят по ${price(survey)} каждый.`
      : `Акт обследования — ${price(survey)}, анкета — ${price(questionnaire)}.`;
  const documents = ['passport', 'survey', 'questionnaire'].map((id) => services.get(id)!);
  const documentPrices =
    new Set(documents.map((service) => service.price)).size === 1
      ? 'Каждый из трёх документов также можно заказать отдельно по ' + price(documents[0]) + '.'
      : documents.map((service) => service.title + ' — ' + price(service) + '.').join(' ');
  function resolve(value: unknown): unknown {
    if (typeof value === 'string')
      return value
        .replace(/\{\{price:([a-z]+)\}\}/g, (match, id) =>
          services.has(id) ? price(services.get(id)!) : match,
        )
        .replace('{{relatedDocumentPrices}}', related)
        .replace('{{documentServicePrices}}', documentPrices);
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
    return value;
  }
  return resolve(content) as T;
}

export function resolveContent(content: SiteContent): SiteContent {
  return resolvePriceTokens(content, content.services);
}
