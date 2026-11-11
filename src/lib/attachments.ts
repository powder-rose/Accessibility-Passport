export const MiB = 1024 * 1024;
export const attachmentKinds = ['passport', 'survey', 'questionnaire'] as const;
export type AttachmentKind = (typeof attachmentKinds)[number];
export const attachmentLabels: Record<AttachmentKind, string> = {
  passport: 'Прикрепить действующий паспорт',
  survey: 'Прикрепить акт обследования',
  questionnaire: 'Прикрепить анкету ОСИ',
};
export const attachmentExtensions = [
  'pdf',
  'docx',
  'xlsx',
  'jpg',
  'jpeg',
  'png',
] as const;
export interface AttachmentLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}
export const defaultAttachmentLimits: Readonly<AttachmentLimits> =
  Object.freeze({
    maxFiles: 6,
    maxFileBytes: 5 * MiB,
    maxTotalBytes: 20 * MiB,
  });
export interface AttachmentMetadata {
  id: string;
  kind: AttachmentKind;
  name: string;
  size: number;
  contentType: string;
  sha256: string;
}
export interface SelectedAttachment {
  file: File;
  kind: AttachmentKind;
  key: string;
}
export function attachmentSelectionError(
  files: SelectedAttachment[],
  limits: AttachmentLimits,
) {
  if (files.length > limits.maxFiles)
    return `Допустимо не более ${limits.maxFiles} файлов.`;
  if (files.some(({ file }) => !file.size || file.size > limits.maxFileBytes))
    return `Размер каждого файла должен быть от 1 байта до ${limits.maxFileBytes / MiB} МБ.`;
  if (
    files.reduce((size, { file }) => size + file.size, 0) > limits.maxTotalBytes
  )
    return `Общий размер файлов — не более ${limits.maxTotalBytes / MiB} МБ.`;
  if (
    files.some(
      ({ file }) =>
        !attachmentExtensions.includes(
          file.name
            .split('.')
            .pop()
            ?.toLowerCase() as (typeof attachmentExtensions)[number],
        ),
    )
  )
    return 'Допустимые форматы: PDF, DOCX, XLSX, JPG и PNG.';
  return '';
}
