import { price } from '@/lib/content-types';
import type { HeroViewProps } from '../service/presentation-types';
import { OrderLink } from '../site/primitives';
import QuizLink from '../site/QuizLink';
import ServiceHeroTitle from '../service/ServiceHeroTitle';

export default function QuestionnaireHero({
  page,
  service,
  site,
}: HeroViewProps) {
  const hero = page.hero;
  const portrait = hero.image;
  return (
    <section
      className="questionnaire-hero"
      id="top"
      aria-labelledby="questionnaire-title"
    >
      <div className="container">
        <div className="questionnaire-hero__grid">
          <div className="questionnaire-hero__copy">
            <p className="eyebrow">{hero.eyebrow}</p>
            <ServiceHeroTitle hero={hero} id="questionnaire-title" />
            <p className="questionnaire-hero__description">
              {hero.description}
            </p>
            <p className="questionnaire-hero__region">{hero.region}</p>
            <div className="questionnaire-hero__offer">
              <div className="questionnaire-hero__price">
                <span>{hero.priceLabel}</span>
                <p className="questionnaire-hero__price-value">
                  {price(service)}
                </p>
              </div>
              <p className="questionnaire-hero__price-note">{hero.priceNote}</p>
            </div>
            <div className="questionnaire-hero__actions">
              <OrderLink
                service={service.id}
                className="button button-contrast"
              >
                {hero.action}
              </OrderLink>
              <QuizLink service={service.id}>{hero.quizAction}</QuizLink>
            </div>
          </div>
          <figure className="questionnaire-portrait">
            <div className="questionnaire-portrait__media">
              <img
                src={portrait?.src || site.heroImage}
                width={portrait?.width || 800}
                height={portrait?.height || 1204}
                alt="Николай Бойков, руководитель БОЙКОВГРУПП"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <figcaption>
              <span>Николай Бойков</span>Руководитель БОЙКОВГРУПП
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
