import type { Item } from '@/lib/content-types';
import ServiceGlyph from '../service/ServiceGlyph';

export default function QuestionnaireAdvantages({ items }: { items: Item[] }) {
  return (
    <section
      className="questionnaire-advantages"
      aria-label="Преимущества подготовки документа"
    >
      <ol className="container questionnaire-advantages__grid">
        {items.map((item, index) => (
          <li key={item.title} className="reveal">
            <ServiceGlyph
              name={(['document', 'check', 'people'] as const)[index]}
            />
            <div>
              <p className="questionnaire-advantages__title">{item.title}</p>
              <p>{item.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
