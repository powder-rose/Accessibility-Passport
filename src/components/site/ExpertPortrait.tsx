import type { SiteContent } from '@/lib/content-types';
export default function ExpertPortrait({
  site,
  showExpertTitle = true,
}: {
  site: SiteContent['site'];
  showExpertTitle?: boolean;
}) {
  return (
    <figure className="hero-portrait">
      <div className="portrait-media">
        <span className="portrait-label">БОЙКОВГРУПП / ОСИ</span>
        <div className="portrait-rule" aria-hidden="true" />
        <img
          src={site.heroImage}
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
        {showExpertTitle && <span>Эксперт по комплексной безопасности</span>}
      </figcaption>
    </figure>
  );
}
