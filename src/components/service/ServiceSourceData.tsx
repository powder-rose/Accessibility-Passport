import type { ServiceSection } from '@/lib/service-page-types';
import { Heading, OrderLink } from '../site/primitives';
import ServiceGlyph from './ServiceGlyph';
export default function ServiceSourceData({
  section,
  service,
}: {
  section: ServiceSection;
  service: string;
}) {
  return (
    <section className="section service-source" id="source-data">
      <div className="container">
        <Heading section={section} />
        <div className="service-source__groups">
          {section.groups?.map((group, index) => (
            <article className="service-source__group reveal" key={group.title}>
              <ServiceGlyph
                name={(['building', 'route', 'capture'] as const)[index]}
              />
              <h3>{group.title}</h3>
              <ul>
                {group.indices.map((itemIndex) => (
                  <li key={itemIndex}>{section.benefits?.[itemIndex]}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="service-source__advice">
          <div>
            <h3>{section.noteTitle}</h3>
            <p>{section.note}</p>
          </div>
          <OrderLink service={service} className="button button-contrast">
            {section.action}
          </OrderLink>
        </div>
      </div>
    </section>
  );
}
