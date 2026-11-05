import type { ServiceSection } from '@/lib/service-page-types';
import { Arrow } from '../site/primitives';
import AccessDiagram from './AccessDiagram';
import { publishedHref } from '@/lib/routes';
export default function ServiceNext({
  section,
  documentLabel,
}: {
  section: ServiceSection;
  documentLabel: string;
}) {
  return (
    <section className="section service-next">
      <div className="container service-next__grid">
        <div className="service-prose">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
          {section.paragraphs?.map((text) => (
            <p key={text}>{text}</p>
          ))}
          {section.note && (
            <p className="service-next__price">{section.note}</p>
          )}
          {section.relatedLinks && (
            <ul className="service-next__related">
              {section.relatedLinks.map((link) => (
                <li key={link.href}>
                  <a href={publishedHref(link.href)}>{link.text}</a>
                </li>
              ))}
            </ul>
          )}
          <a href="/" className="text-link">
            {section.action}
            <Arrow />
          </a>
        </div>
        <div className="service-next__visual reveal" aria-hidden="true">
          <AccessDiagram />
          <div className="service-next__connection">
            <span>{documentLabel}</span>
            <Arrow diagonal={false} />
            <span>Паспорт доступности ОСИ</span>
          </div>
        </div>
      </div>
    </section>
  );
}
