import type { DatabaseSync } from 'node:sqlite';

export interface AdminCredential {
  passwordHash: string | null;
  generation: number;
}

export class AdminRepository {
  constructor(private readonly db: DatabaseSync) {}

  configure(sourceHash: string, initialPasswordHash: string | null) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.db
        .prepare('SELECT source_hash FROM admin_credentials WHERE id=1')
        .get();
      if (previous?.source_hash !== sourceHash) {
        this.db
          .prepare(
            'INSERT INTO admin_credentials(id,source_hash,password_hash,generation) VALUES (1,?,?,1) ON CONFLICT(id) DO UPDATE SET source_hash=excluded.source_hash,password_hash=excluded.password_hash,generation=admin_credentials.generation+1',
          )
          .run(sourceHash, initialPasswordHash);
        this.revokeAll();
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  credential(sourceHash: string): AdminCredential | undefined {
    return this.db
      .prepare(
        'SELECT password_hash AS passwordHash,generation FROM admin_credentials WHERE id=1 AND source_hash=?',
      )
      .get(sourceHash) as AdminCredential | undefined;
  }

  upgradePassword(
    sourceHash: string,
    generation: number,
    passwordHash: string,
  ) {
    return (
      this.db
        .prepare(
          'UPDATE admin_credentials SET password_hash=? WHERE id=1 AND source_hash=? AND generation=? AND password_hash IS NULL',
        )
        .run(passwordHash, sourceHash, generation).changes === 1
    );
  }

  createSession(
    sourceHash: string,
    credential: AdminCredential,
    id: string,
    verifierHash: string,
    expiresAt: number,
    now: number,
  ) {
    this.db.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').run(now);
    // Credential validation and insertion form one atomic statement. A login
    // that verified an older credential cannot issue a session after rotation.
    return (
      this.db
        .prepare(
          'INSERT INTO admin_sessions(id,verifier_hash,generation,expires_at) SELECT ?,?,?,? FROM admin_credentials WHERE id=1 AND source_hash=? AND generation=? AND password_hash=?',
        )
        .run(
          id,
          verifierHash,
          credential.generation,
          expiresAt,
          sourceHash,
          credential.generation,
          credential.passwordHash,
        ).changes === 1
    );
  }

  session(sourceHash: string, id: string, now: number) {
    return this.db
      .prepare(
        'SELECT s.verifier_hash AS verifierHash FROM admin_sessions s JOIN admin_credentials c ON c.id=s.credential_id AND c.generation=s.generation WHERE s.id=? AND c.source_hash=? AND c.password_hash IS NOT NULL AND s.expires_at>?',
      )
      .get(id, sourceHash, now) as { verifierHash: string } | undefined;
  }

  revokeSession(id: string, verifierHash: string) {
    this.db
      .prepare('DELETE FROM admin_sessions WHERE id=? AND verifier_hash=?')
      .run(id, verifierHash);
  }

  revokeAll() {
    this.db.exec('DELETE FROM admin_sessions');
  }
}
