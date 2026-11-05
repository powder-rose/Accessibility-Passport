import type { Store } from '../db/store';
import type { Config } from '../config';
export interface ApiContext {
  store: Store;
  config: Config;
  clientIp: string;
}
export type ApiHandler = (
  request: Request,
  context: ApiContext,
) => Promise<Response>;
