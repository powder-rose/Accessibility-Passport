import type { Service } from '@/lib/content-types';
import type { ServiceSection } from '@/lib/service-page-types';
import { price } from '@/lib/content-types';
import { OrderLink } from '../site/primitives';

export default function QuestionnairePrice({
  section,
  service,
}: {
  section: ServiceSection;
  service: Service;
}) {
  return (
    <section className="section questionnaire-price" id="pricing">
      <div className="container">
        <p className="eyebrow">{section.eyebrow}</p>
        <h2>{section.title}</h2>
        <div className="questionnaire-price__grid">
          <div>
            <p className="questionnaire-price__value">{price(service)}</p>
            <p>{section.priceNote}</p>
          </div>
          <div className="questionnaire-price__copy">
            <p>{section.description}</p>
            <OrderLink
              service={service.id}
              className="button questionnaire-price__button"
            >
              {section.action}
            </OrderLink>
          </div>
        </div>
        <p className="questionnaire-price__condition">{section.noteText}</p>
      </div>
    </section>
  );
}
