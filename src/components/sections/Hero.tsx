import type { SiteContent } from '@/lib/content-types';
import { price } from '@/lib/content-types';
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
            <a className="button button-teal" href="#pricing">
              Рассчитать стоимость
              <Arrow />
            </a>
            <a className="hero-quiz-link" href="#quiz">
              Пройти экспресс-проверку<span className="step-count">6</span>
            </a>
          </div>
        </div>
        <figure className="hero-portrait">
          <div className="portrait-media">
            <span className="portrait-label">БОЙКОВГРУПП / ОСИ</span>
            <div className="portrait-rule" aria-hidden="true" />
            <img
              src={content.site.heroImage}
              width="800"
              height="1204"
              alt="Николай Бойков, руководитель БОЙКОВГРУПП"
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <figcaption>
            <span className="portrait-name">Николай Бойков</span>
            <span>Руководитель БОЙКОВГРУПП</span>
            <span>Эксперт по комплексной безопасности</span>
          </figcaption>
        </figure>
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
