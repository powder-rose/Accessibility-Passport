import type { SiteContent } from '@/lib/content-types';
import { price } from '@/lib/content-types';
import ExpertPortrait from '../site/ExpertPortrait';
import { Arrow } from '../site/primitives';
export default function Hero({ content }: { content: SiteContent }) {
  const s = content.sections['1'];
  const service = content.services.find((x) => x.id === 'passport')!;
  const phrase = 'паспорта доступности ОСИ';
  const hasPhrase = s.title.endsWith(phrase);
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="container hero-grid">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow">
            <span />
            {s.eyebrow}
          </p>
          <h1 id="hero-title">
            {hasPhrase ? s.title.slice(0, -phrase.length) : s.title}
            {hasPhrase && <span>{phrase}</span>}
          </h1>
          <p className="hero-description">{s.description}</p>
          <div className="hero-offer">
            <div>
              <span>Разработка паспорта</span>
              <p>{price(service)}</p>
            </div>
            <ul>
              {s.benefits?.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="hero-actions">
            <a className="button button-contrast" href="#pricing">
              Рассчитать стоимость
              <Arrow />
            </a>
            <a className="hero-quiz-link" href="#quiz">
              Пройти экспресс-проверку<span className="step-count">6</span>
            </a>
          </div>
        </div>
        <ExpertPortrait site={content.site} />
      </div>
      <div className="container hero-bottom">
        <span>Паспорт доступности ОСИ</span>
        <a href="#experience">
          От проверки объекта до готового комплекта документации<span aria-hidden="true">↓</span>
        </a>
      </div>
    </section>
  );
}
