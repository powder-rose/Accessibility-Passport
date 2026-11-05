import survey from '../src/content/survey.json';
import questionnaire from '../src/content/questionnaire.json';
import update from '../src/content/update.json';
import type { SiteContent } from '../src/lib/content-types';
import type { ServicePageContent } from '../src/lib/service-page-types';
import { resolvePriceTokens } from '../src/lib/resolve-content';
import type { DocumentServiceId } from '../src/lib/routes';

const sources: Record<DocumentServiceId, ServicePageContent> = {
  survey: { ...survey, serviceId: 'survey' },
  questionnaire: { ...questionnaire, serviceId: 'questionnaire' },
  update: { ...update, serviceId: 'update' },
};
export function getServiceContent(
  service: DocumentServiceId,
  content: SiteContent,
) {
  return resolvePriceTokens(sources[service], content.services);
}
