export const routes = { home: '/', survey: '/akt-obsledovaniya-osi/' } as const;
export const servicePaths: Readonly<Record<string, string>> = { survey: routes.survey };
const publishedPaths = new Set<string>([
  routes.home,
  routes.survey,
  '/privacy/',
  '/personal-data/',
]);
export function publishedHref(value?: string) {
  if (!value) return undefined;
  const path = value.split(/[?#]/)[0];
  return publishedPaths.has(path) ? value : undefined;
}
