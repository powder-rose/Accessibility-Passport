import type { Section } from '@/lib/content-types';
import { Heading, Arrow, Note } from '../site/primitives';
export default function Regulations({ section }: { section: Section }) {
  return (
    <section className="section regulations" id="regulations">
      <div className="container">
        <Heading section={section} />
        <div className="regulation-table" role="table" aria-label="Нормативная структура">
          <div role="row" className="regulation-table__head">
            <span role="columnheader">Нормативный документ</span>
            <span role="columnheader">Что регулирует</span>
          </div>
          {section.items?.map((x, i) => (
            <div role="row" className="regulation-row" key={x.title}>
              <div role="cell">
                <span className="row-index">0{i + 1}</span>
                <h3>
                  {x.url ? (
                    <a href={x.url}>
                      {x.title}
                      <Arrow />
                    </a>
                  ) : (
                    x.title
                  )}
                </h3>
              </div>
              <p role="cell">{x.text}</p>
            </div>
          ))}
        </div>
        <Note>{section.note}</Note>
      </div>
    </section>
  );
}
