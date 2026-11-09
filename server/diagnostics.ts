import { randomUUID } from 'node:crypto';

type Operation = 'lead_submission' | 'http_request';
export interface FailureEvent {
  timestamp: string;
  level: 'error';
  event: 'operation_failed';
  operation: Operation;
  code: string;
  incidentId: string;
  operationFailuresTotal: number;
  codeFailuresTotal: number;
}

const sqliteCodes: Readonly<Record<number, string>> = {
  1: 'SQLITE_ERROR',
  5: 'SQLITE_BUSY',
  6: 'SQLITE_LOCKED',
  8: 'SQLITE_READONLY',
  10: 'SQLITE_IOERR',
  11: 'SQLITE_CORRUPT',
  13: 'SQLITE_FULL',
  14: 'SQLITE_CANTOPEN',
  19: 'SQLITE_CONSTRAINT',
  26: 'SQLITE_NOTADB',
};
const allowedCodes = new Set([
  ...Object.values(sqliteCodes),
  'ERR_INVALID_STATE',
  'ENOSPC',
  'EACCES',
  'EPERM',
  'EIO',
  'EMFILE',
  'ENFILE',
  'ATTACHMENT_QUOTA',
]);

function errorCode(error: unknown): string {
  try {
    if (!error || typeof error !== 'object') return 'UNKNOWN';
    const { code, errcode } = error as { code?: unknown; errcode?: unknown };
    if (
      code === 'ERR_SQLITE_ERROR' &&
      typeof errcode === 'number' &&
      Number.isInteger(errcode) &&
      errcode > 0 &&
      errcode <= 0x7fffffff
    )
      return sqliteCodes[errcode & 0xff] || 'SQLITE_ERROR';
    return typeof code === 'string' && allowedCodes.has(code)
      ? code
      : 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

export class Diagnostics {
  private readonly operations: Record<Operation, number> = {
    lead_submission: 0,
    http_request: 0,
  };
  private readonly codes = new Map<string, number>();
  private logWriteFailuresTotal = 0;

  constructor(
    private readonly write: (line: string) => void = (line) =>
      console.error(line),
  ) {}

  failure(operation: Operation, error: unknown): string {
    const code = errorCode(error);
    const key = operation + ':' + code;
    const codeFailuresTotal = (this.codes.get(key) || 0) + 1;
    this.codes.set(key, codeFailuresTotal);
    const event: FailureEvent = {
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'operation_failed',
      operation,
      code,
      incidentId: randomUUID(),
      operationFailuresTotal: ++this.operations[operation],
      codeFailuresTotal,
    };
    try {
      this.write(JSON.stringify(event));
    } catch {
      // A failed log sink must not change the result of a business operation.
      this.logWriteFailuresTotal++;
    }
    return event.incidentId;
  }

  snapshot() {
    return {
      operationFailuresTotal: { ...this.operations },
      codeFailuresTotal: Object.fromEntries(this.codes),
      logWriteFailuresTotal: this.logWriteFailuresTotal,
    };
  }
}
