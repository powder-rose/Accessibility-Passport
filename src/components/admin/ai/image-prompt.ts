/** Build the same editable default whether the helper button or generation is used. */
export function defaultImagePrompt(
  topic: string,
  title: string,
  scene = '',
): string {
  const articleTitle = title.trim().slice(0, 300);
  const cluster = topic.trim().slice(0, 700);
  const subject = articleTitle || cluster;
  if (!subject) return '';
  const context =
    articleTitle && cluster && articleTitle !== cluster
      ? ` Контекст кластера: ${cluster}.`
      : '';
  const illustration = scene.trim().slice(0, 500);
  const sceneText = illustration
    ? ` Сюжет этой иллюстрации: ${illustration}.`
    : '';
  return `Создай фотореалистичную иллюстрацию для статьи «${subject}».${context}${sceneText} Николай — главный участник сцены, сохрани его узнаваемые черты по обеим фотографиям. Изобрази ситуацию по теме статьи, без текста и логотипов.`;
}

export function nextImageScene(
  slot: 'cover' | 'inline',
  index: number,
  coverAlt: string,
  inlineAlts: string[],
  headings: string[],
): string {
  if (slot === 'cover') return coverAlt.trim();
  const proposed = (inlineAlts[index] || '').trim();
  if (proposed) return proposed;
  if (!headings.length) return '';
  const position = Math.min(
    headings.length - 1,
    Math.floor(((index + 1) * headings.length) / 4),
  );
  return (headings[position] || '').trim();
}

export function chooseImagePrompt(
  current: string,
  automatic: string | null,
  topic: string,
  title: string,
  scene: string,
): { prompt: string; automatic: string | null } {
  if (current.trim() && current !== automatic)
    return { prompt: current.trim(), automatic: null };
  const prompt = defaultImagePrompt(topic, title, scene);
  return { prompt, automatic: prompt || null };
}
