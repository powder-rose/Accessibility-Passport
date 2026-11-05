const documentationServices: Readonly<Record<string, string>> = {
  passport: 'passport',
  survey: 'survey',
  questionnaire: 'questionnaire',
  documents: 'full',
  update: 'update',
};
export function serviceFromAnswers(documentation: string[] = []) {
  return documentation.length === 1
    ? documentationServices[documentation[0]]
    : undefined;
}
export function documentationForService(service?: string) {
  return Object.entries(documentationServices).find(
    ([, id]) => id === service,
  )?.[0];
}
