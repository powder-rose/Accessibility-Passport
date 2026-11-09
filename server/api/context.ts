import type { Store } from '../db/store';
import type { Config } from '../config';
import type { Diagnostics } from '../diagnostics';
export interface ApiContext {
  store: Store;
  config: Config;
  clientIp: string;
  diagnostics: Diagnostics;
}
export type ApiHandler = (
  request: Request,
  context: ApiContext,
) => Promise<Response>;
