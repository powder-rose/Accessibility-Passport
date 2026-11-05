import type { Section } from '@/lib/content-types';
import { serviceHref } from '@/lib/routes';
import { Heading, OrderLink } from '../site/primitives';
export default function OtherServices({ section }: { section: Section }) {
  return (
    <section className="section other-services" id="other-services">
      <div className="container">
        <Heading section={section} />
        <div className="other-services-grid">
          {section.items?.map((x, i) => (
            <article className="other-service reveal" key={x.title}>
              <span className="row-index">0{i + 1}</span>
              <h3>
                {serviceHref(x.service) ? (
                  <a
                    className="service-title-link"
                    href={serviceHref(x.service)}
                  >
                    {x.title}
                  </a>
                ) : (
                  x.title
                )}
              </h3>
              <p>{x.text}</p>
              <OrderLink service={x.service}>{x.action}</OrderLink>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
