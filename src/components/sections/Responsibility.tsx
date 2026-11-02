import type { Section } from '@/lib/content-types';
import { Arrow, Note } from '../site/primitives';
export default function Responsibility({ section }: { section: Section }) {
  return (
    <section className="section responsibility" id="responsibility">
      <div className="container responsibility-grid">
        <div>
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
          <a className="text-link" href="#quiz">
            Проверить объект
            <Arrow />
          </a>
        </div>
        <div>
          {section.paragraphs?.map((x) => (
            <p key={x}>{x}</p>
          ))}
          <Note title={section.noteTitle}>{section.note}</Note>
        </div>
      </div>
    </section>
  );
}
