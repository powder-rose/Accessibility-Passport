import { createHash, randomUUID } from 'node:crypto';
import type {
  AttachmentKind,
  AttachmentLimits,
  AttachmentMetadata,
} from '../../src/lib/attachments';
import { attachmentExtensions } from '../../src/lib/attachments';
import { UploadError } from './errors';
import { validateOfficePackage } from './office';

export interface StoredAttachment extends AttachmentMetadata {
  bytes: Uint8Array;
}
const contentTypes: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
export async function validateAttachment(
  file: File,
  kind: AttachmentKind,
  limits: AttachmentLimits,
): Promise<StoredAttachment> {
  if (!file.size || file.size > limits.maxFileBytes)
    throw new UploadError(
      'Превышен допустимый размер файла или файл пуст.',
      413,
    );
  if (
    /[\\/:<>\x00-\x1f\x7f]/.test(file.name) ||
    file.name.length > 160 ||
    file.name.startsWith('.') ||
    file.name.includes('..') ||
    /\.(?:exe|dll|com|js|vbs|ps1|sh|hta|msi|bat|cmd)(?:\.|$)/i.test(file.name)
  )
    throw new UploadError(
      'Недопустимое имя файла. Переименуйте документ и повторите отправку.',
    );
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (
    !attachmentExtensions.includes(
      extension as (typeof attachmentExtensions)[number],
    )
  )
    throw new UploadError(
      'Допустимые форматы: PDF, DOCX, XLSX, JPG и PNG.',
      415,
    );
  if (
    file.type &&
    file.type !== 'application/octet-stream' &&
    file.type !== contentTypes[extension]
  )
    throw new UploadError('Формат файла не соответствует его расширению.', 415);
  const bytes = Buffer.from(await file.arrayBuffer());
  let valid = false;
  if (extension === 'pdf')
    valid =
      bytes.subarray(0, 5).toString('ascii') === '%PDF-' &&
      bytes.subarray(-1024).includes(Buffer.from('%%EOF'));
  if (extension === 'jpg' || extension === 'jpeg')
    valid =
      bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff &&
      bytes[bytes.length - 2] === 0xff &&
      bytes[bytes.length - 1] === 0xd9;
  if (extension === 'png')
    valid =
      bytes.length >= 45 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.readUInt32BE(8) === 13 &&
      bytes.subarray(12, 16).toString('ascii') === 'IHDR' &&
      bytes.readUInt32BE(16) > 0 &&
      bytes.readUInt32BE(20) > 0 &&
      bytes.subarray(-8, -4).toString('ascii') === 'IEND';
  if (extension === 'docx' || extension === 'xlsx') {
    validateOfficePackage(bytes, extension);
    valid = true;
  }
  if (!valid)
    throw new UploadError(
      'Содержимое файла не соответствует выбранному формату.',
      415,
    );
  return {
    id: randomUUID(),
    kind,
    name: file.name.normalize('NFC'),
    size: bytes.length,
    contentType: contentTypes[extension],
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
  };
}
