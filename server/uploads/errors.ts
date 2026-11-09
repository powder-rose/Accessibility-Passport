export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: 'ATTACHMENT_QUOTA',
  ) {
    super(message);
  }
}
