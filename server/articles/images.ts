import sharp from 'sharp';
import type { ApiContext } from '../api/context';
import { ArticleError } from './repository';

export async function uploadArticleImage(
  request: Request,
  context: ApiContext,
) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ArticleError('Не удалось прочитать изображение.');
  }
  const files = form.getAll('image');
  const names = form.getAll('seoName');
  if (
    files.length !== 1 ||
    !(files[0] instanceof File) ||
    names.length > 1 ||
    (names.length === 1 &&
      (typeof names[0] !== 'string' ||
        !names[0].trim() ||
        names[0].length > 500)) ||
    [...form.keys()].some((key) => key !== 'image' && key !== 'seoName')
  )
    throw new ArticleError('Выберите одно изображение.');
  const file = files[0];
  const extension = file.name.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  if (
    !extension ||
    !types[extension] ||
    ![types[extension], 'application/octet-stream', ''].includes(file.type)
  )
    throw new ArticleError('Разрешены только JPG, PNG и WEBP.', 415);
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw new ArticleError(
      'Размер изображения должен быть от 1 байта до 5 МБ.',
      413,
    );
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = sharp(bytes, {
      limitInputPixels: 40000000,
      failOn: 'warning',
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      !['jpeg', 'png', 'webp'].includes(metadata.format || '') ||
      (metadata.pages || 1) !== 1 ||
      metadata.format !== (extension === 'jpg' ? 'jpeg' : extension)
    )
      throw new Error('Unsupported image');
    const result = await image
      .rotate()
      .resize({
        width: 1920,
        height: 1920,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return Response.json({
      ok: true,
      ...context.store.articles.addImage(
        result.data,
        result.info.width,
        result.info.height,
        names[0] as string | undefined,
      ),
    });
  } catch (error) {
    if (error instanceof ArticleError) throw error;
    throw new ArticleError(
      'Содержимое файла не соответствует изображению или изображение повреждено.',
      415,
    );
  }
}
