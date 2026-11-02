import initial from '../src/content/home.json';
import { contentSchema } from '../src/lib/content-schema';
import { resolveContent } from '../src/lib/resolve-content';

const content = resolveContent(contentSchema.parse(initial));

export function getSiteContent() {
  return content;
}
