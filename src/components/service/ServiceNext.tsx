import type { ServiceSection } from '@/lib/service-page-types';
import { Arrow } from '../site/primitives';
import AccessDiagram from './AccessDiagram';
export default function ServiceNext({ section }: { section: ServiceSection }) {
  return (
    <section className="section service-next">
      <div className="container service-next__grid">
        <div className="service-prose">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
          {section.paragraphs?.map((text) => (
            <p key={text}>{text}</p>
          ))}
          <p className="service-next__price">{section.note}</p>
          <a href="/" className="text-link">
            {section.action}
            <Arrow />
          </a>
        </div>
        <div className="service-next__visual reveal" aria-hidden="true">
          <AccessDiagram />
          <div className="service-next__connection">
            <span>Акт обследования ОСИ</span>
            <Arrow diagonal={false} />
            <span>Паспорт доступности ОСИ</span>
          </div>
        </div>
      </div>
    </section>
  );
}
