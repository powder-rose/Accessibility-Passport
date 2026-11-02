import { useEffect } from 'react';
import { track, initializeMetrika } from '@/lib/analytics';
export default function Interactions({ metrikaId }: { metrikaId: string }) {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.08 },
    );
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    const handleClick = (event: MouseEvent) => {
      const a = (event.target as Element).closest<HTMLAnchorElement>('a');
      if (!a) return;
      if (a.getAttribute('href')?.endsWith('#requisites')) {
        const details = document.getElementById('requisites');
        if (details instanceof HTMLDetailsElement) details.open = true;
      }
      const href = a.getAttribute('href');
      if (location.pathname === '/' && href?.startsWith('/#')) {
        event.preventDefault();
        document.getElementById(href.slice(2))?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
        history.replaceState(null, '', href.slice(1));
      }
      if (a.hasAttribute('data-order')) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('select-service', { detail: a.dataset.order }));
        document.getElementById('contact')?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
        history.replaceState(null, '', '#contact');
      }
      if (a.hasAttribute('data-object') && !a.getAttribute('href')?.startsWith('/')) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('select-object', { detail: a.dataset.object }));
        document.getElementById('quiz')?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
        history.replaceState(null, '', '#quiz');
      }
      if (a.getAttribute('href')?.startsWith('tel:'))
        track('phone_click', location.pathname, metrikaId);
      if (a.getAttribute('href')?.endsWith('#pricing'))
        track('pricing_view', location.pathname, metrikaId);
      if (a.getAttribute('href')?.includes('#contact'))
        track('commercial_click', location.pathname, metrikaId);
    };
    document.addEventListener('click', handleClick);
    initializeMetrika(metrikaId);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleClick);
    };
  }, [metrikaId]);
  return null;
}
