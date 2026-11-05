import type { ServiceSection } from '@/lib/service-page-types';
import type { Service } from '@/lib/content-types';
import { price } from '@/lib/content-types';
import UpdateAction from './UpdateAction';

export default function UpdatePrice({
  section,
  service,
}: {
  section: ServiceSection;
  service: Service;
}) {
  return (
    <section className="section update-price" id="pricing">
      <div className="container">
        <div className="update-price__grid">
          <div>
            <p className="eyebrow">{section.eyebrow}</p>
            <h2>{section.title}</h2>
            <p className="update-price__description">{section.description}</p>
            <strong className="update-price__value">{price(service)}</strong>
            <UpdateAction className="button button-light">
              {section.action}
            </UpdateAction>
          </div>
          <ul className="update-price__factors">
            {section.benefits?.map((text, index) => (
              <li key={text}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="update-price__explanation">
          <h3>{section.noteTitle}</h3>
          <div>
            {section.paragraphs?.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
