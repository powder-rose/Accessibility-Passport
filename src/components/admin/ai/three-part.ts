import type { TextResult } from './result';

export type ThreePartRun = {
  version: 1;
  id: string;
  scope: string;
  prompt: string;
  seeded?: boolean;
  parts: TextResult[];
  state: 'ready' | 'sending' | 'complete';
};

export type RunStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type SendPart = (prompt: string) => Promise<TextResult>;

const PREFIX = 'article-ai:three-part:v1:';
const PROMPT_LIMIT = 120_000;
const ARTICLE_LIMIT = 300_000;

export function runKey(scope: string): string {
  return PREFIX + scope;
}

function validResult(value: unknown): value is TextResult {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<TextResult>;
  const m = item.metadata;
  return (
    typeof item.text === 'string' &&
    !!item.text.trim() &&
    typeof item.safeHtml === 'string' &&
    !!item.safeHtml.trim() &&
    item.safeHtml.length <= ARTICLE_LIMIT &&
    !!m &&
    typeof m.title === 'string' &&
    typeof m.slug === 'string' &&
    typeof m.seoTitle === 'string' &&
    typeof m.seoDescription === 'string' &&
    typeof m.imageAlt === 'string' &&
    typeof m.clusterTopic === 'string' &&
    typeof m.category === 'string' &&
    Array.isArray(m.inlineImageAlts) &&
    m.inlineImageAlts.length === 3 &&
    m.inlineImageAlts.every((value) => typeof value === 'string')
  );
}

export function loadThreePart(
  storage: RunStorage,
  scope: string,
): ThreePartRun | null {
  const raw = storage.getItem(runKey(scope));
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object')
    throw new Error('Не удалось прочитать сохранённые блоки.');
  const run = value as ThreePartRun;
  if (
    run.version !== 1 ||
    typeof run.id !== 'string' ||
    !run.id ||
    run.scope !== scope ||
    typeof run.prompt !== 'string' ||
    !run.prompt.trim() ||
    run.prompt.length > PROMPT_LIMIT ||
    (run.seeded !== undefined && typeof run.seeded !== 'boolean') ||
    !Array.isArray(run.parts) ||
    run.parts.length > 3 ||
    !run.parts.every(validResult) ||
    !['ready', 'sending', 'complete'].includes(run.state) ||
    (run.state === 'complete' && run.parts.length !== 3) ||
    (run.state !== 'complete' && run.parts.length === 3)
  )
    throw new Error(
      'Сохранённые блоки повреждены. Не начинайте повторную генерацию до проверки.',
    );
  return run;
}

export function saveThreePart(storage: RunStorage, run: ThreePartRun): void {
  storage.setItem(runKey(run.scope), JSON.stringify(run));
}

export function promptForPart(run: ThreePartRun): string {
  const part = run.parts.length + 1;
  if (part < 1 || part > 3) throw new Error('Все три блока уже созданы.');
  const earlier = run.parts
    .map((item, index) => `ГОТОВЫЙ БЛОК ${index + 1}:\n${item.safeHtml}`)
    .join('\n\n');
  const stage = [
    'Напиши только первый блок: введение и разделы плана, относящиеся к первой трети статьи. Не пиши остальные блоки и заключение.',
    'Напиши только второй блок: продолжи план с первого ещё не раскрытого раздела до конца второй трети. Не повторяй введение и уже написанные разделы.',
    'Напиши только третий блок: раскрой все оставшиеся разделы плана, включая FAQ и заключение, если они предусмотрены. Не повторяй предыдущие блоки.',
  ][part - 1];
  const prompt = [
    run.prompt,
    earlier &&
      `Уже написанные части приведены только для связности и исключения повторов. Не переписывай их:\n${earlier}`,
    `ТЕКУЩАЯ ЗАДАЧА — БЛОК ${part} ИЗ 3:\n${stage}\nЕсли в SEO-плане явно указаны три блока, следуй именно их границам. Иначе раздели предусмотренные планом разделы H2 по порядку примерно на три равные части, не разрывая раздел H2 и его подразделы. Сохрани все относящиеся к этому блоку заголовки и требования плана. Ничего не пропускай и не заменяй следующий блок общим выводом. Верни articleHtml только для текущего блока, без служебных подписей «Блок 1/2/3». Остальные обязательные поля JSON заполни для всей статьи.`,
  ]
    .filter(Boolean)
    .join('\n\n');
  if (prompt.length > PROMPT_LIMIT)
    throw new Error(
      'Материалы и готовые блоки не помещаются в один запрос. Сохраните результат и сократите исходные материалы.',
    );
  return prompt;
}

export function combineThreePart(run: ThreePartRun): TextResult {
  if (run.state !== 'complete' || run.parts.length !== 3)
    throw new Error('Статья ещё не завершена.');
  const html = run.parts.map((item) => item.safeHtml).join('\n');
  if (html.length > ARTICLE_LIMIT)
    throw new Error(
      'Общий текст превышает размер редактора. Скачайте готовые блоки.',
    );
  return {
    text: html,
    safeHtml: html,
    metadata: run.parts[run.seeded ? 1 : 0].metadata,
  };
}

export async function continueThreePart(
  initial: ThreePartRun,
  storage: RunStorage,
  send: SendPart,
  onChange: (run: ThreePartRun) => void,
  allowUnconfirmed = false,
): Promise<ThreePartRun> {
  let run = initial;
  if (run.state === 'complete') return run;
  if (run.state === 'sending') {
    if (!allowUnconfirmed)
      throw new Error(
        'Результат прошлого запроса неизвестен. Проверьте расходы перед повтором.',
      );
    run = { ...run, state: 'ready' };
    saveThreePart(storage, run);
    onChange(run);
  }
  while (run.parts.length < 3) {
    const prompt = promptForPart(run);
    run = { ...run, state: 'sending' };
    saveThreePart(storage, run);
    onChange(run);
    const response = await send(prompt);
    if (!validResult(response))
      throw new Error('Сервис не вернул пригодный текст блока.');
    if (
      run.parts.some(
        (part) => part.safeHtml.trim() === response.safeHtml.trim(),
      )
    )
      throw new Error(
        'Модель повторила готовый блок. Проверьте результат перед повтором.',
      );
    const parts = [...run.parts, response];
    const htmlLength =
      parts.reduce((sum, item) => sum + item.safeHtml.length, 0) +
      parts.length -
      1;
    run = { ...run, parts, state: parts.length === 3 ? 'complete' : 'ready' };
    // Keep the received response in memory even if browser storage is full.
    onChange(run);
    saveThreePart(storage, run);
    if (htmlLength > ARTICLE_LIMIT)
      throw new Error(
        'Общий текст превышает размер редактора. Скачайте готовые блоки.',
      );
  }
  return run;
}
