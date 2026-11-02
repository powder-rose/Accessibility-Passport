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
      const destination = href ? new URL(href, location.href) : undefined;
      const local =
        destination?.origin === location.origin && destination.pathname === location.pathname;
      const ordinaryClick =
        !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0;
      if (ordinaryClick && a.hasAttribute('data-quiz') && local) {
        event.preventDefault();
        if (a.dataset.quizService)
          window.dispatchEvent(
            new CustomEvent('select-quiz-service', { detail: a.dataset.quizService }),
          );
        if (a.dataset.object)
          window.dispatchEvent(new CustomEvent('select-object', { detail: a.dataset.object }));
        document.getElementById('quiz')?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
        history.replaceState(null, '', '#quiz');
        track('commercial_click', location.pathname, metrikaId);
      } else if (ordinaryClick && a.hasAttribute('data-order') && local) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('select-service', { detail: a.dataset.order }));
        document.getElementById('contact')?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
        history.replaceState(null, '', '#contact');
      } else if (
        ordinaryClick &&
        a.hasAttribute('data-object') &&
        local &&
        destination?.hash === '#quiz'
      ) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('select-object', { detail: a.dataset.object }));
        document.getElementById('quiz')?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
        history.replaceState(null, '', '#quiz');
      } else if (ordinaryClick && local && destination?.hash) {
        const target = document.getElementById(destination.hash.slice(1));
        if (target) {
          event.preventDefault();
          target.scrollIntoView({
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
          });
          history.replaceState(null, '', destination.hash);
        }
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
