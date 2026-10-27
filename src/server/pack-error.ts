/** Every reason `livelocale pack`, `livelocale build` or the Vite share step can stop. */
export type PackErrorCode =
  | 'USAGE'
  | 'BAD_BASE'
  | 'LOCALES_NOT_FOUND'
  | 'NO_LOCALES'
  | 'SOURCE_LOCALE_NOT_FOUND'
  | 'INVALID_LOCALE_FILE'
  | 'OUT_DIR_NOT_FOUND'
  | 'STUDIO_NOT_FOUND'
  | 'SHARE_DIR_TAKEN'
  | 'NEXT_EXPORT_POST_ROUTE'
  | 'OUTPUT_NOT_FOUND';

/** A pack failure with a stable code and a message that names the fix. */
export class PackError extends Error {
  readonly code: PackErrorCode;

  constructor(code: PackErrorCode, message: string) {
    super(message);
    this.name = 'PackError';
    this.code = code;
  }
}
