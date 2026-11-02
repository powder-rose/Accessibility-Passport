import type { Section, Service } from '@/lib/content-types';
import { price } from '@/lib/content-types';
import { Heading, CheckList, OrderLink, Note } from '../site/primitives';
export default function Documents({
  section,
  services,
}: {
  section: Section;
  services: Service[];
}) {
  return (
    <section className="section documents" id="documents">
      <div className="container">
        <Heading section={section} />
        <div className="documents-grid">
          {section.items?.map((x, i) => (
            <article key={x.title} className="document-card reveal">
              <div className="item-meta">
                <span>0{i + 1}</span>
                <span>{x.label}</span>
              </div>
              <div className={'document-symbol symbol-' + i} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h3>{x.title}</h3>
              <CheckList items={x.points || []} />
              <div className="document-card__bottom">
                <span>{price(services.find((s) => s.id === x.service)!)}</span>
                <OrderLink service={x.service}>{x.action}</OrderLink>
              </div>
            </article>
          ))}
        </div>
        <Note>{section.note}</Note>
      </div>
    </section>
  );
}
