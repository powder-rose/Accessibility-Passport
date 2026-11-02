import type { ServiceSection } from '@/lib/service-page-types';
import { Note, OrderLink } from '../site/primitives';
import AccessDiagram from './AccessDiagram';
export default function ServiceOverview({ section }: { section: ServiceSection }) {
  return (
    <section className="section service-overview" id="about">
      <div className="container">
        <div className="service-overview__heading">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
        </div>
        <div className="service-overview__grid">
          <div className="service-overview__lead reveal">
            <p>{section.paragraphs?.[0]}</p>
            <AccessDiagram />
          </div>
          <div className="service-overview__details">
            {section.paragraphs?.slice(1).map((text) => (
              <p className="reveal" key={text}>
                {text}
              </p>
            ))}
          </div>
        </div>
        <div className="service-overview__footer">
          <Note>{section.note}</Note>
          <OrderLink service="survey">{section.action}</OrderLink>
        </div>
      </div>
    </section>
  );
}
