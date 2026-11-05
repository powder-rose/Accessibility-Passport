export const routes = {
  home: '/',
  survey: '/akt-obsledovaniya-osi/',
  questionnaire: '/anketa-osi/',
  update: '/aktualizaciya-pasporta-dostupnosti/',
} as const;
export const servicePaths = {
  survey: routes.survey,
  questionnaire: routes.questionnaire,
  update: routes.update,
} as const satisfies Readonly<Record<string, string>>;
export type DocumentServiceId = keyof typeof servicePaths;
export function serviceForPath(path: string): DocumentServiceId | undefined {
  return (Object.keys(servicePaths) as DocumentServiceId[]).find(
    (service) => servicePaths[service] === path,
  );
}
export function serviceHref(service?: string) {
  return service && Object.hasOwn(servicePaths, service)
    ? servicePaths[service as DocumentServiceId]
    : undefined;
}
const publishedPaths = new Set<string>([
  routes.home,
  routes.survey,
  routes.questionnaire,
  routes.update,
  '/blog/',
  '/privacy/',
  '/personal-data/',
]);
export function publishedHref(value?: string) {
  if (!value) return undefined;
  const path = value.split(/[?#]/)[0];
  return publishedPaths.has(path) ? value : undefined;
}
