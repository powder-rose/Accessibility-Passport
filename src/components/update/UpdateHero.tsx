import type { ServicePageContent } from '@/lib/service-page-types';
import type { SiteContent, Service } from '@/lib/content-types';
import { price } from '@/lib/content-types';
import Breadcrumbs from '../site/Breadcrumbs';
import UpdateAction from './UpdateAction';

export default function UpdateHero({
  page,
  site,
  service,
}: {
  page: ServicePageContent;
  site: SiteContent['site'];
  service: Service;
}) {
  const hero = page.hero;
  return (
    <section className="update-hero" id="top">
      <Breadcrumbs current={page.breadcrumb} />
      <div className="container update-hero__grid">
        <div className="update-hero__copy">
          <p className="eyebrow">{hero.eyebrow}</p>
          <h1>
            <span>{hero.accent}</span>
            {hero.title.slice(hero.accent.length)}
          </h1>
          <p className="update-hero__description">{hero.description}</p>
          <p className="update-hero__region">{hero.region}</p>
          <div className="update-hero__actions">
            <UpdateAction className="button button-light">
              {hero.action}
            </UpdateAction>
            <UpdateAction review>{hero.quizAction}</UpdateAction>
          </div>
          <div className="update-hero__offer">
            <div>
              <span>{hero.priceLabel}</span>
              <p>{price(service)}</p>
            </div>
            <p>{hero.priceNote}</p>
          </div>
        </div>
        <figure className="update-portrait">
          <div className="update-portrait__media">
            <span aria-hidden="true" className="update-portrait__orbit" />
            <img
              src={hero.image?.src || site.heroImage}
              width={hero.image?.width || 800}
              height={hero.image?.height || 1204}
              alt="Николай Бойков, руководитель БОЙКОВГРУПП"
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <figcaption>
            <strong>Николай Бойков</strong>
            <span>Руководитель БОЙКОВГРУПП</span>
          </figcaption>
        </figure>
      </div>
      <div className="container update-advantages">
        {page.advantages.map((item, index) => (
          <div key={item.title}>
            <span className="update-index">0{index + 1}</span>
            <div>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
