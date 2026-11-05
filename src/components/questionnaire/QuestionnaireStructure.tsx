import type { ServiceSection } from '@/lib/service-page-types';
import { Heading, Note, OrderLink } from '../site/primitives';
import ServiceGlyph from '../service/ServiceGlyph';

export default function QuestionnaireStructure({
  section,
  service,
}: {
  section: ServiceSection;
  service: string;
}) {
  return (
    <section
      className="section questionnaire-structure"
      id="document-structure"
    >
      <div className="container">
        <Heading section={section} />
        <ol className="questionnaire-structure__grid">
          {section.items?.map((item, index) => (
            <li
              className="questionnaire-structure__card reveal"
              key={item.title}
            >
              <div className="questionnaire-structure__mark" aria-hidden="true">
                <ServiceGlyph
                  name={
                    (['building', 'people', 'route', 'check'] as const)[index]
                  }
                />
                <span>{String(index + 1).padStart(2, '0')}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ol>
        <div className="service-overview__footer">
          <Note>{section.note}</Note>
          <OrderLink service={service}>{section.action}</OrderLink>
        </div>
      </div>
    </section>
  );
}
