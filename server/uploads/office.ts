import { inflateRawSync } from 'node:zlib';
import { UploadError } from './errors';

// Inspect package metadata only. Never extract user-controlled paths to disk.
export function validateOfficePackage(
  bytes: Buffer,
  extension: 'docx' | 'xlsx',
) {
  const fail = () => {
    throw new UploadError(
      'Не удалось проверить документ Office. Сохраните его повторно в DOCX или XLSX.',
    );
  };
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65557);
    offset--
  ) {
    if (
      bytes.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6))
    return fail();
  const count = bytes.readUInt16LE(end + 10);
  if (!count || count > 2000 || count !== bytes.readUInt16LE(end + 8))
    return fail();
  const centralOffset = bytes.readUInt32LE(end + 16);
  const centralSize = bytes.readUInt32LE(end + 12);
  if (centralOffset + centralSize !== end) return fail();
  const entries = new Map<
    string,
    { start: number; compressed: number; expanded: number; method: number }
  >();
  let offset = centralOffset;
  let totalExpanded = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
      return fail();
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const expanded = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const next =
      offset +
      46 +
      nameLength +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    if (
      next > end ||
      !nameLength ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      local + 30 > centralOffset ||
      bytes.readUInt32LE(local) !== 0x04034b50
    )
      return fail();
    const name = bytes
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8');
    if (
      name.startsWith('/') ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.split('/').includes('..') ||
      entries.has(name)
    )
      return fail();
    if (
      /\.(?:exe|dll|com|js|vbs|ps1|sh|hta|html?|msi|bat|cmd|bin)$/i.test(
        name,
      ) ||
      /(?:^|\/)(?:activeX|embeddings|externalLinks)\//i.test(name)
    )
      throw new UploadError(
        'Документы с макросами, вложенными объектами или исполняемыми файлами не принимаются.',
      );
    totalExpanded += expanded;
    if (
      expanded > 20 * 1024 * 1024 ||
      totalExpanded > 80 * 1024 * 1024 ||
      expanded > Math.max(compressed, 1) * 300
    )
      return fail();
    const localNameLength = bytes.readUInt16LE(local + 26);
    const start = local + 30 + localNameLength + bytes.readUInt16LE(local + 28);
    if (
      start + compressed > centralOffset ||
      bytes.readUInt16LE(local + 8) !== method ||
      bytes.readUInt16LE(local + 6) & 1
    )
      return fail();
    if (
      bytes
        .subarray(local + 30, local + 30 + localNameLength)
        .toString('utf8') !== name
    )
      return fail();
    entries.set(name, { start, compressed, expanded, method });
    offset = next;
  }
  if (offset !== end) return fail();
  const required =
    extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  const types = entries.get('[Content_Types].xml');
  if (
    !types ||
    !entries.has(required) ||
    !entries.has('_rels/.rels') ||
    types.expanded > 128 * 1024
  )
    return fail();
  let xml: string;
  try {
    const compressed = bytes.subarray(
      types.start,
      types.start + types.compressed,
    );
    const content =
      types.method === 0
        ? compressed
        : inflateRawSync(compressed, { maxOutputLength: 128 * 1024 });
    if (content.length !== types.expanded) return fail();
    xml = content.toString('utf8');
  } catch {
    return fail();
  }
  const expected =
    extension === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  if (
    !xml.includes(expected) ||
    /macroEnabled|vbaProject|activeX|<!DOCTYPE|<!ENTITY/i.test(xml)
  )
    return fail();
}
