const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 36_000_000;
const MAX_SIDE = 16_384;
const OUTPUT_SIDE = 4_096;
const HEADER_BYTES = 2 * 1024 * 1024;

type ReferenceType = 'image/jpeg' | 'image/png' | 'image/webp';
type ReferenceHeader = { type: ReferenceType; width: number; height: number };

/** Check dimensions before asking the browser to decode a potentially large image. */
export function inspectReferenceHeader(bytes: Uint8Array): ReferenceHeader {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  let type: ReferenceType | undefined;
  let width = 0;
  let height = 0;
  if (
    bytes.length >= 24 &&
    data.getUint32(0) === 0x89504e47 &&
    data.getUint32(4) === 0x0d0a1a0a &&
    signature(12, 4) === 'IHDR'
  ) {
    type = 'image/png';
    width = data.getUint32(16);
    height = data.getUint32(20);
  } else if (
    bytes.length >= 30 &&
    signature(0, 4) === 'RIFF' &&
    signature(8, 4) === 'WEBP'
  ) {
    type = 'image/webp';
    const tag = signature(12, 4);
    if (tag === 'VP8X') {
      width = 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65_536;
      height = 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65_536;
    } else if (
      tag === 'VP8 ' &&
      bytes[23] === 0x9d &&
      bytes[24] === 1 &&
      bytes[25] === 0x2a
    ) {
      width = data.getUint16(26, true) & 0x3fff;
      height = data.getUint16(28, true) & 0x3fff;
    } else if (tag === 'VP8L' && bytes[20] === 0x2f) {
      width = 1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff);
      height =
        1 +
        (((bytes[22] >> 6) | (bytes[23] << 2) | (bytes[24] << 10)) & 0x3fff);
    }
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    type = 'image/jpeg';
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) break;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = data.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        size >= 7
      ) {
        height = data.getUint16(offset + 3);
        width = data.getUint16(offset + 5);
        break;
      }
      offset += size;
    }
  }
  if (!type || !width || !height)
    throw new Error(
      'Не удалось прочитать фото. Используйте корректный JPEG, PNG или WebP.',
    );
  checkDimensions(width, height);
  return { type, width, height };
}

function checkDimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_SIDE ||
    height > MAX_SIDE ||
    width * height > MAX_PIXELS
  )
    throw new Error(
      'Разрешение фото слишком большое: максимум 36 Мп и 16 384 пикселя по стороне.',
    );
}

/** Fit an image within bounds without stretching or enlarging it. */
export function fitReferenceDimensions(
  width: number,
  height: number,
  maxSide = OUTPUT_SIDE,
) {
  checkDimensions(width, height);
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encode(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('Браузер не смог сжать фото.'));
          else resolve(blob);
        },
        mime,
        quality,
      );
    } catch {
      reject(new Error('Браузер не смог сжать фото.'));
    }
  });
}

/** Resize large photos on the user's computer before their first upload. */
export async function prepareReference(file: File): Promise<File> {
  if (!(file instanceof File) || !file.size || file.size > MAX_INPUT_BYTES)
    throw new Error('Выберите фотографию размером от 1 байта до 20 МБ.');
  const header = inspectReferenceHeader(
    new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer()),
  );
  const objectUrl = URL.createObjectURL(file);
  let image: HTMLImageElement | undefined;
  try {
    image = new Image();
    image.src = objectUrl;
    try {
      await image.decode();
    } catch {
      throw new Error(
        'Не удалось открыть фото. Проверьте, что файл не повреждён.',
      );
    }
    checkDimensions(image.naturalWidth, image.naturalHeight);
    const name = file.name.replace(/\.[^.]*$/, '') || 'nikolay';
    if (file.size <= MAX_OUTPUT_BYTES) {
      if (file.type === header.type) return file;
      const extension =
        header.type === 'image/jpeg' ? 'jpg' : header.type.slice(6);
      return new File([file], `${name}.${extension}`, {
        type: header.type,
        lastModified: file.lastModified,
      });
    }

    let { width, height } = fitReferenceDimensions(
      image.naturalWidth,
      image.naturalHeight,
    );
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Браузер не поддерживает сжатие изображений.');
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = width;
      canvas.height = height;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      for (const quality of [0.9, 0.82, 0.74]) {
        let blob = await encode(canvas, 'image/webp', quality);
        if (blob.type !== 'image/webp') {
          // Some browsers silently return PNG when WebP encoding is unsupported.
          ctx.save();
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
          blob = await encode(canvas, 'image/jpeg', quality);
        }
        if (blob.type !== 'image/webp' && blob.type !== 'image/jpeg')
          throw new Error('Браузер не поддерживает сжатие JPEG или WebP.');
        if (blob.size > 0 && blob.size <= MAX_OUTPUT_BYTES) {
          const extension = blob.type === 'image/jpeg' ? 'jpg' : 'webp';
          return new File([blob], `${name}.${extension}`, {
            type: blob.type,
            lastModified: file.lastModified,
          });
        }
      }
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
    throw new Error(
      'Не удалось уменьшить фото до 5 МБ. Выберите другую фотографию.',
    );
  } finally {
    try {
      if (image) image.src = '';
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
