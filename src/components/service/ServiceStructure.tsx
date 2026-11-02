import type { ServiceSection } from '@/lib/service-page-types';
import { Heading, OrderLink } from '../site/primitives';
import ServiceGlyph from './ServiceGlyph';

export default function ServiceStructure({ section }: { section: ServiceSection }) {
  const items = section.items || [];
  return (
    <section className="section service-structure" id="document-structure">
      <div className="container">
        <Heading section={section} />
        <div className="service-structure__groups">
          {[0, 3, 6].map((start, group) => (
            <div className="service-structure__group reveal" key={start}>
              <ServiceGlyph name={group === 0 ? 'building' : group === 1 ? 'route' : 'check'} />
              <ol start={start + 1}>
                {items.slice(start, start + 3).map((item, index) => (
                  <li key={item.title}>
                    <span aria-hidden="true">{String(start + index + 1).padStart(2, '0')}</span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <div className="service-section-action">
          <OrderLink service="survey">{section.action}</OrderLink>
        </div>
      </div>
    </section>
  );
}
