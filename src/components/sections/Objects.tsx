import type { Section } from '@/lib/content-types';
import ObjectCards from '../site/ObjectCards';
import { Heading, Arrow } from '../site/primitives';
export default function Objects({ section }: { section: Section }) {
  return (
    <section className="section objects" id="objects">
      <div className="container">
        <Heading section={section} />
        <ObjectCards items={section.items || []} />
        <div className="section-cta">
          <p>{section.note}</p>
          <a href="#contact" className="text-link">
            Получить консультацию
            <Arrow />
          </a>
        </div>
      </div>
    </section>
  );
}
