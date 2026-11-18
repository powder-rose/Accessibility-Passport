import type { AssistantDraft, DraftRevision } from './draft-store';
export type RevisionBase = Pick<
  DraftRevision,
  'materials' | 'photo1' | 'photo2'
>;
export type RecoveryDraft = { base: RevisionBase; value: AssistantDraft };
export function revisionBase(value: DraftRevision): RevisionBase {
  return {
    materials: value.materials,
    photo1: value.photo1,
    photo2: value.photo2,
  };
}
export function equalBase(a: RevisionBase, b: RevisionBase): boolean {
  return (
    a.materials === b.materials &&
    a.photo1 === b.photo1 &&
    a.photo2 === b.photo2
  );
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('accessibility-ai-recovery', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('Не удалось открыть аварийное хранилище браузера.'));
    request.onblocked = () =>
      reject(new Error('Аварийное хранилище заблокировано другой вкладкой.'));
  });
}
async function access<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('drafts', mode);
      const request = run(transaction.objectStore('drafts'));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () =>
        reject(new Error('Не удалось сохранить аварийную копию в браузере.'));
    });
  } finally {
    db.close();
  }
}
export function loadRecovery(): Promise<RecoveryDraft | undefined> {
  return access<RecoveryDraft | undefined>('readonly', (store) =>
    store.get('profile'),
  );
}
export async function saveRecovery(value: RecoveryDraft): Promise<void> {
  await access<IDBValidKey>('readwrite', (store) =>
    store.put(value, 'profile'),
  );
}
export async function clearRecovery(): Promise<void> {
  await access<undefined>('readwrite', (store) => store.delete('profile'));
}
