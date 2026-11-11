import { visitLifetime, type PageView } from '../features/statistics/model';

const storageKey = 'osi-visit-v1';

function visitToken() {
  const now = Date.now();
  let token: string = crypto.randomUUID();
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (raw && raw.length < 200) {
      const saved: unknown = JSON.parse(raw);
      if (
        saved &&
        typeof saved === 'object' &&
        'token' in saved &&
        'seen' in saved &&
        typeof saved.token === 'string' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          saved.token,
        ) &&
        typeof saved.seen === 'number' &&
        saved.seen <= now &&
        now - saved.seen < visitLifetime
      )
        token = saved.token;
    }
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({ token, seen: now }),
    );
  } catch {
    // Restricted storage must never prevent the public page from working.
  }
  return token;
}

export function recordPageView(fetcher: typeof fetch = fetch) {
  try {
    if (
      navigator.doNotTrack === '1' ||
      ('globalPrivacyControl' in navigator &&
        navigator.globalPrivacyControl === true)
    )
      return;
    const view: PageView = {
      id: crypto.randomUUID(),
      token: visitToken(),
      path: location.pathname,
    };
    if (document.referrer) {
      try {
        const host = new URL(document.referrer).hostname;
        if (/^[a-z0-9.-]{1,253}$/i.test(host)) view.referrer = host;
      } catch {
        /* An invalid referrer is treated as a direct visit. */
      }
    }
    const campaign = new URLSearchParams(location.search).get('utm_source');
    if (campaign && /^[a-z0-9_.-]{1,60}$/i.test(campaign))
      view.campaign = campaign;
    void fetcher('/api/analytics/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      keepalive: true,
      body: JSON.stringify(view),
    }).catch(() => {});
  } catch {
    // Telemetry is best-effort; blocked browser APIs must not affect forms or SSR.
  }
}
