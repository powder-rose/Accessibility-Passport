import type { ServicePageContent } from '@/lib/service-page-types';

export default function ServiceHeroTitle({
  hero,
  id,
}: {
  hero: ServicePageContent['hero'];
  id: string;
}) {
  return (
    <h1 id={id}>
      {hero.title.startsWith(hero.accent) ? (
        <>
          <span>{hero.accent}</span>
          <span>{hero.title.slice(hero.accent.length)}</span>
        </>
      ) : (
        hero.title
      )}
    </h1>
  );
}
