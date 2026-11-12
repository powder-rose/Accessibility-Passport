import { articleJson, articleRequest } from '../articles/api';

export type SourceDocument = {
  id: string;
  name: string;
  text: string;
  emptyPages: number;
};
export type AssistantDraft = {
  topic: string;
  style: string;
  sources: string;
  instruction: string;
  chatUrl: string;
  chatContext: string;
  chatEnabled: boolean;
  chatOmittedParts: number;
  documents: SourceDocument[];
  examples: SourceDocument[];
  photos: [string, string];
};
export const emptyDraft = (): AssistantDraft => ({
  topic: '',
  style:
    'Подробная практическая статья на русском языке: сначала суть и ключевое правило, затем вопросные H2/H3 с процедурами, условиями, сроками, участниками, частыми ошибками и последствиями. Короткие абзацы, примеры, списки, сравнительные таблицы и FAQ. Важные разграничения оформляй отдельными врезками.',
  sources: '',
  instruction: '',
  chatUrl: '',
  chatContext: '',
  chatEnabled: true,
  chatOmittedParts: 0,
  documents: [],
  examples: [],
  photos: ['', ''],
});
type Materials = Omit<AssistantDraft, 'photos'>;
type MaterialsRecord = { revision: number | null; value: Materials | null };
type PhotoRecord = { revision: number | null; dataUrl: string | null };
export type DraftRevision = {
  materials: number | null;
  photo1: number | null;
  photo2: number | null;
  savedMaterials: string;
  savedPhotos: [string, string];
};
export type StoredDraft = { revision: DraftRevision; value: AssistantDraft };
// Earlier saved profiles predate chat support. Preserve their contents while
// filling in the newly introduced fields, including recovery copies.
export function normalizeDraft(value: Partial<AssistantDraft>): AssistantDraft {
  return {
    ...emptyDraft(),
    ...value,
    chatUrl: typeof value.chatUrl === 'string' ? value.chatUrl : '',
    chatContext: typeof value.chatContext === 'string' ? value.chatContext : '',
    chatEnabled: value.chatEnabled !== false,
    chatOmittedParts:
      Number.isSafeInteger(value.chatOmittedParts) &&
      (value.chatOmittedParts ?? 0) >= 0
        ? (value.chatOmittedParts ?? 0)
        : 0,
  };
}
function materialValue(value: AssistantDraft): Materials {
  const { photos: _photos, ...materials } = value;
  return materials;
}
export async function readDraft(): Promise<StoredDraft> {
  const [materials, photo1, photo2] = await Promise.all([
    articleRequest<MaterialsRecord>('/api/admin/ai/materials'),
    articleRequest<PhotoRecord>('/api/admin/ai/photo1'),
    articleRequest<PhotoRecord>('/api/admin/ai/photo2'),
  ]);
  const value: AssistantDraft = normalizeDraft({
    ...(materials.value || {}),
    photos: [photo1.dataUrl || '', photo2.dataUrl || ''],
  });
  return {
    revision: {
      materials: materials.revision,
      photo1: photo1.revision,
      photo2: photo2.revision,
      savedMaterials: JSON.stringify(materialValue(value)),
      savedPhotos: [...value.photos],
    },
    value,
  };
}
// Independent CAS revisions are updated immediately after each successful write.
// If a later photo fails, retrying preserves the already-saved revisions.
export async function writeDraft(
  value: AssistantDraft,
  revision: DraftRevision,
): Promise<DraftRevision> {
  const materials = materialValue(value);
  const serialized = JSON.stringify(materials);
  if (serialized.length > 1_000_000)
    throw new Error(
      'Общий объём материалов превышает 1 миллион символов. Уберите лишние документы.',
    );
  if (serialized !== revision.savedMaterials) {
    const result = await articleRequest<{ revision: number }>(
      '/api/admin/ai/materials',
      articleJson('POST', { revision: revision.materials, value: materials }),
    );
    revision.materials = result.revision;
    revision.savedMaterials = serialized;
  }
  for (const index of [0, 1] as const) {
    if (value.photos[index] !== revision.savedPhotos[index]) {
      const key = index === 0 ? 'photo1' : 'photo2';
      const result = await articleRequest<{ revision: number | null }>(
        `/api/admin/ai/${key}`,
        articleJson('POST', {
          revision: revision[key],
          dataUrl: value.photos[index] || null,
        }),
      );
      revision[key] = result.revision;
      revision.savedPhotos[index] = value.photos[index];
    }
  }
  return revision;
}
