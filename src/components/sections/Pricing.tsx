import { serviceHref } from '@/lib/routes';
import type { Section, Service } from '@/lib/content-types';
import { price } from '@/lib/content-types';
import { Heading, OrderLink, Arrow } from '../site/primitives';
export default function Pricing({
  section,
  services,
}: {
  section: Section;
  services: Service[];
}) {
  return (
    <section className="section pricing" id="pricing">
      <div className="container">
        <Heading section={section} />
        <div className="pricing-grid">
          {services
            .filter((service) => service.showInPricing !== false)
            .map((x, i) => (
              <article
                key={x.id}
                className={
                  'price-card reveal' +
                  (x.id === 'full' ? ' price-card--full' : '')
                }
              >
                <div className="item-meta">
                  <span>0{i + 1}</span>
                  <span>{x.label}</span>
                </div>
                <h3>
                  {serviceHref(x.id) ? (
                    <a className="service-title-link" href={serviceHref(x.id)}>
                      {x.title}
                    </a>
                  ) : (
                    x.title
                  )}
                </h3>
                <p>{x.description}</p>
                <div className="price-card__footer">
                  <div className="price-value">{price(x)}</div>
                  <span className="price-note">{x.note}</span>
                  <OrderLink
                    service={x.id}
                    className={
                      'button ' +
                      (x.id === 'full' ? 'button-light' : 'button-outline')
                    }
                  >
                    {x.action}
                  </OrderLink>
                </div>
              </article>
            ))}
        </div>
        <div className="pricing-advice">
          <span className="advice-mark" aria-hidden="true">
            ↗
          </span>
          <div>
            <h3>{section.noteTitle}</h3>
            <p>{section.note}</p>
            <p>{section.noteText}</p>
          </div>
          <a href="#quiz" className="text-link">
            Пройти экспресс-проверку
            <Arrow />
          </a>
        </div>
      </div>
    </section>
  );
}
