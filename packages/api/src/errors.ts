import type { ErrorCode } from '@sophie/shared';

export class AppError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly fields?: Record<string, string[]>;
  constructor(code: ErrorCode, status: number, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
    this.name = 'AppError';
  }
}

export const validation = (msg: string, fields?: Record<string, string[]>) =>
  new AppError('VALIDATION_ERROR', 400, msg, fields);
export const notFound = (what: string) => new AppError('NOT_FOUND', 404, `${what} not found`);
export const conflictStale = () =>
  new AppError('CONFLICT_STALE', 409, 'Record modified by another client. Reload and retry.');
export const conflictUnique = (field: string) =>
  new AppError('CONFLICT_UNIQUE', 409, `${field} must be unique`, { [field]: ['must be unique'] });
export const conflictReferenced = (
  entity: string,
  count?: number,
  fields?: Record<string, string[]>,
) =>
  new AppError(
    'CONFLICT_REFERENCED',
    409,
    count != null
      ? `${entity} is referenced by ${count} item${count === 1 ? '' : 's'}`
      : `${entity} is referenced and cannot be deleted`,
    fields,
  );
export const conflictNonEmpty = (entity: string) =>
  new AppError('CONFLICT_NON_EMPTY', 409, `${entity} is not empty`);
export const semantic = (msg: string, fields?: Record<string, string[]>) =>
  new AppError('SEMANTIC_ERROR', 422, msg, fields);
export const payloadTooLarge = (msg: string) => new AppError('PAYLOAD_TOO_LARGE', 413, msg);
export const unsupportedMediaType = (msg: string) =>
  new AppError('UNSUPPORTED_MEDIA_TYPE', 415, msg);
export const magicBytesMismatch = (msg: string) =>
  new AppError('MAGIC_BYTES_MISMATCH', 415, msg);
export const schemaMismatch = (msg: string) => new AppError('SCHEMA_MISMATCH', 422, msg);
export const backupChecksumMismatch = (msg: string) =>
  new AppError('BACKUP_CHECKSUM_MISMATCH', 422, msg);
export const restoreFailed = (msg: string) => new AppError('RESTORE_FAILED', 500, msg);
export const internal = (msg: string) => new AppError('INTERNAL_ERROR', 500, msg);
