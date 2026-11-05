import type { Section } from '@/lib/content-types';
import { Heading, Arrow, Note } from '../site/primitives';
export default function DocumentOverview({
  section,
  anatomy,
}: {
  section: Section;
  anatomy: Section;
}) {
  return (
    <>
      <section className="section about" id="about">
        <div className="container about-grid">
          <div className="document-visual reveal">
            <div className="document-sheet">
              <div className="document-sheet__top">
                <span>БОЙКОВГРУПП</span>
                <span>ОСИ</span>
              </div>
              <p className="document-sheet__title">
                Паспорт
                <br />
                доступности
              </p>
              <p className="document-sheet__subtitle">
                объекта социальной инфраструктуры
              </p>
              <div className="document-lines" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <ol>
                {anatomy.items?.map((x, i) => (
                  <li key={x.title}>
                    <span>0{i + 1}</span>
                    {x.title}
                  </li>
                ))}
              </ol>
              <div className="document-sheet__bottom">
                <span>Паспорт доступности объекта</span>
                <Arrow />
              </div>
            </div>
          </div>
          <div className="about-copy">
            <p className="eyebrow">{section.eyebrow}</p>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((x) => (
              <p key={x}>{x}</p>
            ))}
            <Note>{section.note}</Note>
            <a className="text-link" href="#quiz">
              Проверить требования для объекта
              <Arrow />
            </a>
          </div>
        </div>
      </section>
      <section className="section anatomy" id="anatomy">
        <div className="container">
          <Heading section={anatomy} />
          <div className="anatomy-grid">
            {anatomy.items?.map((x, i) => (
              <article className="anatomy-item reveal" key={x.title}>
                <span className="large-index">0{i + 1}</span>
                <h3>{x.title}</h3>
                <p>{x.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
