import type { Service, SiteContent } from '@/lib/content-types';
import type { ServicePageContent } from '@/lib/service-page-types';
import { price } from '@/lib/content-types';
import { OrderLink } from '../site/primitives';
import ExpertPortrait from '../site/ExpertPortrait';
import QuizLink from '../site/QuizLink';
import ServiceHeroTitle from './ServiceHeroTitle';

export default function ServiceHero({
  page,
  service,
  site,
}: {
  page: ServicePageContent;
  service: Service;
  site: SiteContent['site'];
}) {
  const hero = page.hero;
  const titleId = service.id + '-title';
  return (
    <section className="service-hero" id="top" aria-labelledby={titleId}>
      <div className="container service-hero__grid">
        <div className="service-hero__copy">
          <p className="eyebrow">{hero.eyebrow}</p>
          <ServiceHeroTitle hero={hero} id={titleId} />
          <p className="service-hero__description">{hero.description}</p>
          <p className="service-hero__region">{hero.region}</p>
          <div className="service-hero__offer">
            <div>
              <span>{hero.priceLabel}</span>
              <p>{price(service)}</p>
            </div>
            <p>{hero.priceNote}</p>
          </div>
          <div className="service-actions">
            <OrderLink service={service.id} className="button button-contrast">
              {hero.action}
            </OrderLink>
            <QuizLink service={service.id}>{hero.quizAction}</QuizLink>
          </div>
        </div>
        <ExpertPortrait site={site} showExpertTitle={false} />
      </div>
    </section>
  );
}
