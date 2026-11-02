import type { Service } from '@/lib/content-types';
import type { ServiceSection } from '@/lib/service-page-types';
import { price } from '@/lib/content-types';
import { OrderLink } from '../site/primitives';
export default function ServicePrice({
  section,
  service,
}: {
  section: ServiceSection;
  service: Service;
}) {
  return (
    <section className="section service-price" id="pricing">
      <div className="container">
        <div className="service-price__grid">
          <div>
            <p className="eyebrow">{section.eyebrow}</p>
            <h2>{section.title}</h2>
            <p className="service-price__description">{section.description}</p>
          </div>
          <div className="service-price__offer">
            <p className="service-price__value">{price(service)}</p>
            <p className="service-price__caption">{section.priceNote}</p>
            <p>{section.note}</p>
            <OrderLink service={service.id} className="button button-teal">
              {section.action}
            </OrderLink>
          </div>
        </div>
        <p className="service-price__condition">{section.noteText}</p>
      </div>
    </section>
  );
}
