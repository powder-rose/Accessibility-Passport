import type { DatabaseSync } from 'node:sqlite';

export const aiMaterialsSchema = `
  CREATE TABLE ai_materials (
    key TEXT PRIMARY KEY NOT NULL CHECK(key IN ('materials','photo1','photo2')),
    revision INTEGER NOT NULL CHECK(revision > 0),
    value BLOB,
    mime TEXT,
    deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
    CHECK ((deleted = 1 AND value IS NULL AND mime IS NULL) OR
      (deleted = 0 AND key = 'materials' AND typeof(value) = 'text' AND mime IS NULL) OR
      (deleted = 0 AND key IN ('photo1','photo2') AND typeof(value) = 'blob'
       AND mime IN ('image/png','image/jpeg','image/webp')))
  )`;

export type AiMaterialKey = 'materials' | 'photo1' | 'photo2';
export interface AiRecord {
  key: AiMaterialKey;
  revision: number;
  value: string | Uint8Array;
  mime: string | null;
}
export class AiStorageConflict extends Error {
  constructor() {
    super(
      'Материалы изменились в другом браузере. Обновите страницу и повторите.',
    );
    this.name = 'AiStorageConflict';
  }
}

function validateKey(key: string): asserts key is AiMaterialKey {
  if (!['materials', 'photo1', 'photo2'].includes(key))
    throw new Error('Неизвестный материал.');
}
function validateValue(
  key: AiMaterialKey,
  value: string | Uint8Array,
  mime?: string | null,
) {
  if (key === 'materials') {
    if (typeof value !== 'string' || value.length > 1_000_000 || mime)
      throw new Error('Материалы слишком большие или имеют неверный формат.');
    try {
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error();
    } catch {
      throw new Error('Материалы должны быть объектом JSON.');
    }
    return;
  }
  if (
    !(value instanceof Uint8Array) ||
    !value.length ||
    value.length > 5 * 1024 * 1024
  )
    throw new Error('Фото должно быть не больше 5 МБ.');
  const b = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  const valid =
    mime === 'image/png'
      ? b.length >= 8 &&
        b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === 'image/jpeg'
        ? b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255
        : mime === 'image/webp'
          ? b.length >= 12 &&
            b.toString('ascii', 0, 4) === 'RIFF' &&
            b.toString('ascii', 8, 12) === 'WEBP'
          : false;
  if (!valid)
    throw new Error('Фото должно быть корректным PNG, JPEG или WebP.');
}
function validateRevision(revision: number | null) {
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 1))
    throw new Error('Неверная версия материала.');
}

export class AiMaterialsRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(key: AiMaterialKey): AiRecord | null {
    validateKey(key);
    return (
      (this.db
        .prepare(
          'SELECT key,revision,value,mime FROM ai_materials WHERE key=? AND deleted=0',
        )
        .get(key) as unknown as AiRecord | undefined) || null
    );
  }

  put(
    key: AiMaterialKey,
    value: string | Uint8Array,
    expectedRevision: number | null,
    mime?: string | null,
  ): AiRecord {
    validateKey(key);
    validateRevision(expectedRevision);
    validateValue(key, value, mime);
    const stored = typeof value === 'string' ? value : Buffer.from(value);
    const row =
      expectedRevision === null
        ? this.db
            .prepare(
              `INSERT INTO ai_materials (key,revision,value,mime,deleted) VALUES (?,1,?,?,0)
          ON CONFLICT(key) DO UPDATE SET revision=revision+1,value=excluded.value,mime=excluded.mime,deleted=0
          WHERE deleted=1 RETURNING key,revision,value,mime`,
            )
            .get(key, stored, mime || null)
        : this.db
            .prepare(
              `UPDATE ai_materials SET revision=revision+1,value=?,mime=?
          WHERE key=? AND revision=? AND deleted=0 RETURNING key,revision,value,mime`,
            )
            .get(stored, mime || null, key, expectedRevision);
    if (!row) throw new AiStorageConflict();
    return row as unknown as AiRecord;
  }

  delete(key: AiMaterialKey, expectedRevision: number): void {
    validateKey(key);
    validateRevision(expectedRevision);
    // Keep revision tombstones so deletion/recreation cannot let a stale writer win.
    const result = this.db
      .prepare(
        'UPDATE ai_materials SET revision=revision+1,value=NULL,mime=NULL,deleted=1 WHERE key=? AND revision=? AND deleted=0',
      )
      .run(key, expectedRevision);
    if (result.changes !== 1) throw new AiStorageConflict();
  }
}
