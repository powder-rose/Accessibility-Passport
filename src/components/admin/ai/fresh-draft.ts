import { readDraft, type DraftRevision, type StoredDraft } from './draft-store';
import { equalBase, revisionBase } from './recovery-store';

/** Fail before a paid request if another tab changed the source materials. */
export async function ensureCurrentDraft(
  expected: DraftRevision,
  read: () => Promise<StoredDraft> = readDraft,
): Promise<void> {
  const latest = await read();
  if (!equalBase(revisionBase(expected), revisionBase(latest.revision)))
    throw new Error(
      'Материалы или фото изменились в другом браузере. Закройте и снова откройте ИИ-помощник, затем проверьте фотографии. Запрос не отправлен.',
    );
}
