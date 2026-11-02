import type { Section } from '@/lib/content-types';
import { Heading, Arrow } from '../site/primitives';
export default function SourceData({ section }: { section: Section }) {
  return (
    <section className="section source-data" id="source-data">
      <div className="container">
        <Heading section={section} />
        <div className="source-grid">
          {section.items?.map((x, i) => (
            <article className="source-item reveal" key={x.title}>
              <span>0{i + 1}</span>
              <div>
                <h3>{x.title}</h3>
                <p>{x.text}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="source-advice">
          <div>
            <h3>{section.noteTitle}</h3>
            <p>{section.note}</p>
          </div>
          <a href="#contact" className="text-link">
            Уточнить перечень
            <Arrow />
          </a>
        </div>
      </div>
    </section>
  );
}
