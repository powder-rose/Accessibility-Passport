import {
  attachmentKinds,
  type AttachmentKind,
  type AttachmentLimits,
} from '../../src/lib/attachments';
import { UploadError } from './errors';
import { validateAttachment, type StoredAttachment } from './validate';

export async function parseLeadRequest(
  request: Request,
  limits: AttachmentLimits,
): Promise<{ input: unknown; attachments: StoredAttachment[] }> {
  if (request.headers.get('content-type')?.startsWith('application/json')) {
    const raw = await request.text();
    if (raw.length > 18000)
      throw new UploadError('Слишком большой запрос.', 413);
    try {
      return { input: JSON.parse(raw), attachments: [] };
    } catch {
      throw new UploadError('Некорректный JSON.');
    }
  }
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;'))
    throw new UploadError('Недопустимый формат запроса.', 415);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new UploadError('Не удалось прочитать файлы. Повторите отправку.');
  }
  const fields = form.getAll('data');
  if (
    fields.length !== 1 ||
    typeof fields[0] !== 'string' ||
    fields[0].length > 18000
  )
    throw new UploadError('Некорректные данные заявки.');
  let input: unknown;
  try {
    input = JSON.parse(fields[0]);
  } catch {
    throw new UploadError('Некорректные данные заявки.');
  }
  const files: { file: File; kind: AttachmentKind }[] = [];
  for (const [name, value] of form.entries()) {
    if (name === 'data') continue;
    const kind = name.replace(/^attachment:/, '') as AttachmentKind;
    if (
      !name.startsWith('attachment:') ||
      !attachmentKinds.includes(kind) ||
      !(value instanceof File)
    )
      throw new UploadError('Недопустимое поле вложения.');
    files.push({ file: value, kind });
  }
  if (files.length > limits.maxFiles)
    throw new UploadError(`Допустимо не более ${limits.maxFiles} файлов.`, 413);
  if (
    files.reduce((total, { file }) => total + file.size, 0) >
    limits.maxTotalBytes
  )
    throw new UploadError('Превышен общий допустимый размер файлов.', 413);
  const attachments: StoredAttachment[] = [];
  for (const { file, kind } of files)
    attachments.push(await validateAttachment(file, kind, limits));
  return { input, attachments };
}
