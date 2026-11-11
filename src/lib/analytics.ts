import { attribution } from './attribution';
export { attribution } from './attribution';

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
type Metrika = ((...args: unknown[]) => void) & {
  a?: ArrayLike<unknown>[];
  l?: number;
};
declare global {
  interface Window {
    ym?: Metrika;
    dataLayer?: Record<string, string>[];
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
