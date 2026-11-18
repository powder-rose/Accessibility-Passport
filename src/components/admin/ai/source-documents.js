import mammothScript from 'mammoth/mammoth.browser.js?url';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Extract source material locally and only when a user selects a file. No source
// is sent to the model until the user explicitly starts generation.
export const DOCUMENT_LIMITS = Object.freeze({
  fileBytes: 15 * 1024 * 1024,
  pdfPages: 150,
  textChars: 500000,
  docxEntries: 2500,
  docxExpandedBytes: 40 * 1024 * 1024,
});
let mammothLoading;

function fileName(value) {
  return [...String(value || 'Документ')]
    .map((character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
        ? ' '
        : character,
    )
    .join('')
    .slice(0, 240);
}
function kindOf(name) {
  const ext = String(name)
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/)?.[1];
  return ['txt', 'md', 'markdown', 'pdf', 'docx'].includes(ext) ? ext : '';
}
function validateFile(file) {
  if (
    !file ||
    typeof file.arrayBuffer !== 'function' ||
    !Number.isFinite(file.size)
  )
    throw new Error('Не удалось прочитать выбранный файл.');
  if (file.size <= 0) throw new Error('Файл пуст.');
  if (file.size > DOCUMENT_LIMITS.fileBytes)
    throw new Error('Файл больше 15 МБ. Разделите документ на части.');
  const kind = kindOf(file.name);
  if (!kind) throw new Error('Поддерживаются документы TXT, MD, PDF и DOCX.');
  return kind;
}
function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}
function trimText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(String.fromCharCode(0))
    .join('')
    .trim();
}
function bounded(text) {
  const clean = trimText(text);
  if (!clean) return { text: '', truncated: false };
  if (clean.length <= DOCUMENT_LIMITS.textChars)
    return { text: clean, truncated: false };
  return { text: clean.slice(0, DOCUMENT_LIMITS.textChars), truncated: true };
}

// Examine the ZIP central directory before handing DOCX to a decompressor.
// This blocks oversized archives, encryption, ZIP64 and malformed offsets.
export function validateDocxArchive(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const fail = () => {
    throw new Error(
      'Не удалось открыть DOCX: файл повреждён или защищён паролем.',
    );
  };
  if (b.length < 22 || view.getUint32(0, true) !== 0x04034b50) fail();
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === b.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0) fail();
  const disk = view.getUint16(end + 4, true),
    directoryDisk = view.getUint16(end + 6, true),
    diskCount = view.getUint16(end + 8, true),
    count = view.getUint16(end + 10, true),
    length = view.getUint32(end + 12, true),
    offset = view.getUint32(end + 16, true);
  if (
    disk ||
    directoryDisk ||
    diskCount !== count ||
    count === 0xffff ||
    offset === 0xffffffff ||
    length === 0xffffffff ||
    offset + length > end
  )
    fail();
  if (count > DOCUMENT_LIMITS.docxEntries)
    throw new Error('В DOCX слишком много вложенных файлов.');
  let p = offset,
    total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > end || view.getUint32(p, true) !== 0x02014b50) fail();
    const flags = view.getUint16(p + 8, true),
      method = view.getUint16(p + 10, true),
      size = view.getUint32(p + 24, true),
      name = view.getUint16(p + 28, true),
      extra = view.getUint16(p + 30, true),
      comment = view.getUint16(p + 32, true);
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      size === 0xffffffff ||
      p + 46 + name + extra + comment > end
    )
      fail();
    total += size;
    if (total > DOCUMENT_LIMITS.docxExpandedBytes)
      throw new Error(
        'DOCX слишком большой после распаковки. Разделите документ на части.',
      );
    p += 46 + name + extra + comment;
  }
  if (p !== offset + length) fail();
}
async function loadMammoth() {
  if (globalThis.mammoth?.extractRawText) return globalThis.mammoth;
  if (!mammothLoading)
    mammothLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = mammothScript;
      script.async = true;
      script.onload = () =>
        globalThis.mammoth?.extractRawText
          ? resolve(globalThis.mammoth)
          : reject(new Error('Не удалось подготовить чтение DOCX.'));
      script.onerror = () =>
        reject(
          new Error(
            'Не удалось загрузить модуль DOCX. Проверьте установку приложения.',
          ),
        );
      document.head.append(script);
    }).catch((error) => {
      mammothLoading = null;
      throw error;
    });
  return mammothLoading;
}
async function loadPdf() {
  try {
    const pdf = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
    pdf.GlobalWorkerOptions.workerSrc = pdfWorker;
    return pdf;
  } catch {
    throw new Error(
      'Не удалось загрузить модуль PDF. Проверьте установку приложения.',
    );
  }
}

export async function extractSourceDocument(
  file,
  { pdfLoader = loadPdf, docxLoader = loadMammoth } = {},
) {
  const kind = validateFile(file),
    name = fileName(file.name),
    bytes = new Uint8Array(await file.arrayBuffer());
  let value,
    pages,
    pagesProcessed = 0,
    emptyPages = 0,
    stoppedEarly = false;
  if (['txt', 'md', 'markdown'].includes(kind)) value = decodeText(bytes);
  else if (kind === 'docx') {
    validateDocxArchive(bytes);
    try {
      const mammoth = await docxLoader();
      const result = await mammoth.extractRawText({
        arrayBuffer: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      });
      value = result.value;
    } catch {
      throw new Error(
        'Не удалось извлечь текст DOCX. Проверьте файл и защиту паролем.',
      );
    }
  } else {
    if (
      bytes.length < 5 ||
      String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-'
    )
      throw new Error('Это не распознанный PDF-файл.');
    const pdf = await pdfLoader();
    let task, document;
    try {
      task = pdf.getDocument({
        data: bytes,
        isEvalSupported: false,
        useSystemFonts: true,
        enableXfa: false,
      });
      document = await task.promise;
      pages = document.numPages;
      if (!Number.isInteger(pages) || pages < 1)
        throw new Error('В PDF нет страниц.');
      if (pages > DOCUMENT_LIMITS.pdfPages)
        throw new Error(
          'В PDF больше 150 страниц. Разделите документ на части.',
        );
      const parts = [];
      let chars = 0;
      for (let i = 1; i <= pages; i++) {
        const page = await document.getPage(i);
        try {
          const content = await page.getTextContent();
          const text = content.items
            .map((item) =>
              typeof item.str === 'string'
                ? item.str + (item.hasEOL ? '\n' : ' ')
                : '',
            )
            .join('');
          parts.push(text);
          const meaningful = trimText(text);
          if (!meaningful) emptyPages++;
          chars += meaningful.length;
          pagesProcessed++;
        } finally {
          page.cleanup();
        }
        if (chars > DOCUMENT_LIMITS.textChars) {
          stoppedEarly = i < pages;
          break;
        }
      }
      value = parts.join('\n\n');
    } catch (error) {
      if (/больше 150 страниц|нет страниц/.test(error?.message || ''))
        throw error;
      throw new Error(
        'Не удалось открыть PDF. Проверьте файл и защиту паролем.',
        { cause: error },
      );
    } finally {
      try {
        if (document) await document.destroy();
        else if (task) await task.destroy();
      } catch {
        /* preserve the extraction result */
      }
    }
  }
  const result = bounded(value);
  result.truncated ||= stoppedEarly;
  if (!result.text)
    throw new Error(
      kind === 'pdf'
        ? 'В PDF не найден текстовый слой. Похоже, это скан: сначала распознайте текст (OCR).'
        : 'В документе не найден текст.',
    );
  return {
    name,
    kind: kind === 'markdown' ? 'md' : kind,
    text: result.text,
    truncated: result.truncated,
    ...(pages ? { pages, pagesProcessed, emptyPages } : {}),
  };
}
