import type { Section } from '@/lib/content-types';
import { Heading, Arrow, Note } from '../site/primitives';
export default function Process({
  section,
  showCta = true,
  compact = false,
}: {
  section: Section;
  showCta?: boolean;
  compact?: boolean;
}) {
  return (
    <section className={'section process' + (compact ? ' process--compact' : '')} id="process">
      <div className="container">
        <Heading section={section} />
        <ol className="process-list">
          {section.items?.map((x, i) => (
            <li key={x.title} className="process-step reveal">
              <span className="process-index">0{i + 1}</span>
              {x.label && <div className="process-step__label">{x.label}</div>}
              <div className="process-step__copy">
                <h3>{x.title}</h3>
                <p>{x.text}</p>
              </div>
              <Arrow />
            </li>
          ))}
        </ol>
        <Note>{section.note}</Note>
        {showCta && (
          <div className="section-cta">
            <p>Нужно подготовить паспорт доступности?</p>
            <a href="#pricing" className="text-link">
              Рассчитать стоимость
              <Arrow />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
