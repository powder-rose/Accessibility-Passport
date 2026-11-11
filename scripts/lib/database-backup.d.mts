export class RecoveryError extends Error {}
export interface BackupMetadata {
  directory: string;
  formatVersion: 1;
  schemaVersion: 3 | 4 | 5;
  createdAt: string;
  size: number;
  sha256: string;
  counts: Record<string, number>;
}
export function createBackup(
  databasePath: string,
  destination: string,
): Promise<BackupMetadata>;
export function verifyBackup(snapshotPath: string): Promise<BackupMetadata>;
export function restoreBackup(
  snapshotPath: string,
  destination: string,
): Promise<BackupMetadata & { databasePath: string }>;
