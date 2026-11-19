import type { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function mapFsError(error: unknown): AppError {
  const err = error as NodeJS.ErrnoException;
  switch (err?.code) {
    case 'ENOENT':
      return new AppError('NOT_FOUND', 'The item no longer exists.', 404);
    case 'EACCES':
    case 'EPERM':
      return new AppError('ACCESS_DENIED', 'Permission denied.', 403);
    case 'ENOTDIR':
      return new AppError('NOT_A_DIRECTORY', 'This path is not a folder.', 400);
    case 'EISDIR':
      return new AppError('IS_A_DIRECTORY', 'This path is a folder.', 400);
    case 'EEXIST':
      return new AppError('NAME_CONFLICT', 'An item with this name already exists.', 409);
    case 'ENOSPC':
      return new AppError('DISK_FULL', 'There is not enough free space on the disk.', 507);
    case 'EBUSY':
      return new AppError('FILE_BUSY', 'The item is in use by another program.', 409);
    case 'ENAMETOOLONG':
      return new AppError('NAME_TOO_LONG', 'The path is too long.', 400);
    case 'EXDEV':
      return new AppError('CROSS_DEVICE', 'The item cannot be moved across this boundary.', 400);
    default:
      return new AppError('FS_ERROR', err?.message || 'The file operation failed.', 500);
  }
}

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  const err = error as { type?: string; code?: string; message?: string };
  if (err?.type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'BODY_TOO_LARGE', message: 'The request body is too large.' },
    });
    return;
  }
  console.error('[server] Unhandled error:', error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
}
