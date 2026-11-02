import type { ServiceSection } from '@/lib/service-page-types';
import { Heading, Note, OrderLink } from '../site/primitives';
import ServiceGlyph from './ServiceGlyph';
export default function ServiceContents({
  section,
  id,
}: {
  section: ServiceSection;
  id: string;
}) {
  return (
    <section className="section service-contents" id={id}>
      <div className="container">
        <Heading section={section} />
        <ol className="service-deliverables">
          {section.items?.map((item, index) => (
            <li key={item.title} className="reveal" data-featured={index === 6}>
              <div className="service-deliverables__mark" aria-hidden="true">
                <span>{String(index + 1).padStart(2, '0')}</span>
                {index >= 6 && <ServiceGlyph name={index === 6 ? 'document' : 'check'} />}
              </div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ol>
        {section.note && <Note>{section.note}</Note>}
        {section.action && (
          <div className="service-section-action">
            <OrderLink service="survey">{section.action}</OrderLink>
          </div>
        )}
      </div>
    </section>
  );
}
