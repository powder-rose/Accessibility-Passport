import type { Answers } from './content-types';
export function classify(answers: Answers) {
  const intent = answers.documentation || [];
  const previous = answers.existingPassport?.[0];
  const selected = intent.includes('update')
    ? 'Актуализация документации ОСИ.'
    : intent.includes('documents')
      ? 'Полный комплекс документации.'
      : intent.some((x) => ['passport', 'survey', 'questionnaire'].includes(x))
        ? 'Разработка отдельного документа.'
        : intent.includes('consultation')
          ? 'Определение необходимого состава документации.'
          : previous === 'first'
            ? 'Первичная разработка документации ОСИ.'
            : previous === 'update'
              ? 'Актуализация документации ОСИ.'
              : 'Определение необходимого состава документации.';
  const clarification =
    (previous === 'update' &&
      intent.some((x) =>
        ['passport', 'survey', 'questionnaire', 'documents'].includes(x),
      )) ||
    (previous === 'first' && intent.includes('update'));
  return {
    type: selected,
    clarification,
    context:
      previous === 'first'
        ? 'Первичная разработка'
        : previous === 'update'
          ? 'Требуется актуализация'
          : 'Требуется уточнение',
    includesApprovalSupport: false,
  };
}
