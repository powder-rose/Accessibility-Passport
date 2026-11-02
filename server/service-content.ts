import initial from '../src/content/survey.json';
import type { SiteContent } from '../src/lib/content-types';
import type { ServicePageContent } from '../src/lib/service-page-types';
import { resolvePriceTokens } from '../src/lib/resolve-content';
const source: ServicePageContent = initial;
export function getSurveyContent(content: SiteContent) {
  return resolvePriceTokens(source, content.services);
}
