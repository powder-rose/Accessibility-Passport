type EventName =
  | 'commercial_click'
  | 'phone_click'
  | 'pricing_view'
  | 'document_sample_open'
  | 'express_check_start'
  | 'express_check_submit'
  | 'lead_submit'
  | 'update_order_click'
  | 'update_review_click'
  | 'document_file_selected'
  | 'document_upload_success'
  | `express_check_step_${number}`;
type Metrika = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
declare global {
  interface Window {
    ym?: Metrika;
    dataLayer?: Record<string, string>[];
  }
}
export function initializeMetrika(id: string) {
  if (!/^\d+$/.test(id)) return;
  if (!window.ym) {
    const queue: Metrika = (...args) => {
      queue.a = queue.a || [];
      queue.a.push(args);
    };
    queue.l = Date.now();
    window.ym = queue;
  }
  window.ym(Number(id), 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false,
  });
  if (
    !document.querySelector('script[src="https://mc.yandex.ru/metrika/tag.js"]')
  ) {
    const script = document.createElement('script');
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    script.async = true;
    document.head.appendChild(script);
  }
}
export function track(name: EventName, page: string, metrikaId: string) {
  const params = {
    page: page.split('?')[0],
    url: location.origin + location.pathname,
    ...attribution(),
  };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: name, ...params });
  if (/^\d+$/.test(metrikaId) && window.ym)
    window.ym(Number(metrikaId), 'reachGoal', name, params);
}
export function attribution() {
  const params = new URLSearchParams(location.search);
  const result: Record<string, string> = {};
  for (const key of [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
  ]) {
    const value = params.get(key);
    if (value) result[key] = value.slice(0, 300);
  }
  return result;
}
