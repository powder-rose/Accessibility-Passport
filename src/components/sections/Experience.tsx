import type { Section } from '@/lib/content-types';
import { Heading, OrderLink } from '../site/primitives';
export default function Experience({ section }: { section: Section }) {
  return (
    <section className="section experience" id="experience">
      <div className="container">
        <Heading section={section} />
        <div className="experience-grid">
          {section.items?.map((item, i) => (
            <article key={item.title} className="experience-item reveal">
              <div className="item-meta">
                <span>0{i + 1}</span>
                <span>{item.label}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <OrderLink service={item.service}>{item.action}</OrderLink>
            </article>
          ))}
        </div>
        <ol className="process-strip">
          {section.flow?.map((x, i) => (
            <li className={i === 4 ? 'additional' : ''} key={x}>
              <span className="strip-dot" />
              {x}
              {i === 4 && <span className="optional-label">При наличии процедуры</span>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
