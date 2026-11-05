import type { NextViewProps } from '../service/presentation-types';
import { Arrow } from '../site/primitives';
import { publishedHref } from '@/lib/routes';

function RelatedPriceText({ text }: { text: string }) {
  const separator = text.lastIndexOf(' — ');
  if (separator < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, separator + 3)}
      <span className="questionnaire-next__amount">
        {text.slice(separator + 3)}
      </span>
    </>
  );
}

export default function QuestionnaireNext({ section }: NextViewProps) {
  return (
    <section className="section questionnaire-next">
      <div className="container">
        <div className="questionnaire-next__grid">
          <div>
            <p className="eyebrow">{section.eyebrow}</p>
            <h2>{section.title}</h2>
          </div>
          <div className="questionnaire-next__copy">
            {section.paragraphs?.map((text) => (
              <p key={text}>{text}</p>
            ))}
            <a className="text-link" href="/">
              {section.action}
              <Arrow />
            </a>
          </div>
        </div>
        <ul className="questionnaire-next__related">
          {section.relatedLinks?.map((link) => (
            <li key={link.href}>
              <a href={publishedHref(link.href)}>
                <span>
                  <RelatedPriceText text={link.text} />
                </span>
                <Arrow />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
