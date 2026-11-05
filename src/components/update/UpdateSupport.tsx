import type { ServiceSection } from '@/lib/service-page-types';
import { OrderLink } from '../site/primitives';

export default function UpdateSupport({
  section,
}: {
  section: ServiceSection;
}) {
  return (
    <section className="section update-support" id="support">
      <div className="container update-support__grid">
        <div>
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
        </div>
        <div>
          {section.paragraphs?.map((text) => (
            <p key={text}>{text}</p>
          ))}
          <p className="update-support__price">{section.priceNote}</p>
          <p className="update-support__note">{section.note}</p>
          <OrderLink service="support">{section.action}</OrderLink>
        </div>
      </div>
    </section>
  );
}
