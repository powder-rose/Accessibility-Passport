import type { ServiceSection } from '@/lib/service-page-types';
import { Arrow } from '../site/primitives';
import ServiceGlyph from './ServiceGlyph';
export default function ServicePackage({ section }: { section: ServiceSection }) {
  return (
    <section className="section service-package">
      <div className="container">
        <div className="service-package__heading">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
          <p>{section.description}</p>
        </div>
        <div className="service-package__grid">
          <ul className="service-package__services">
            {section.benefits?.map((text, index) => (
              <li key={text} className="reveal">
                <ServiceGlyph
                  name={(['check', 'document', 'building', 'people'] as const)[index]}
                />
                <p>{text}</p>
              </li>
            ))}
          </ul>
          <div className="service-package__offer">
            <p className="service-package__price">{section.priceNote}</p>
            <p>{section.note}</p>
            <p>{section.noteText}</p>
            <a href="/?service=full#contact" className="button button-teal">
              {section.action}
              <Arrow />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
