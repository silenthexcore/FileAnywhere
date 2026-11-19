import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import Busboy from 'busboy';
import mime from 'mime-types';
import { appConfig, appPort, tunnel } from './context';
import {
  APP_NAME,
  APP_VERSION,
  DATA_DIR,
  saveConfig,
} from './config';
import {
  checkLoginThrottle,
  clearLoginFailures,
  clearSessionCookie,
  clientIp,
  createSessionToken,
  getSession,
  getSetupCode,
  hashPassword,
  isLoopback,
  recordLoginFailure,
  requireAuth,
  rotateSecret,
  setSessionCookie,
  verifyPassword,
  verifySetupCode,
} from './auth';
import { audit } from './audit';
import { AppError, asyncHandler, errorMiddleware, mapFsError } from './errors';
import {
  assertWritableProtection,
  copyOrMoveItems,
  createFile,
  createFolder,
  deleteItems,
  listDirectory,
  readTextContent,
  renameItem,
  saveUploadedFile,
  searchFiles,
  writeTextContent,
} from './files';
import {
  contentDisposition,
  createArchiveTicket,
  getArchiveTicket,
  streamZip,
} from './archive';
import { getLanAddresses, getHostnameUrl, getSystemSnapshot } from './system';
import { isDeniedPath, normalizePath, protectionForPath } from './paths';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    );
    res.setHeader('X-FileAnywhere-Version', APP_VERSION);
    next();
  });
  app.use(express.json({ limit: '25mb' }));

  // Same-origin check and CSRF guard for state-changing API calls.
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('x-fileanywhere') !== '1') {
        res.status(403).json({ error: { code: 'CSRF', message: 'Missing request header.' } });
        return;
      }
      const origin = req.get('origin');
      if (origin) {
        try {
          if (new URL(origin).host !== req.get('host')) {
            res.status(403).json({ error: { code: 'CSRF', message: 'Cross-origin request rejected.' } });
            return;
          }
        } catch {
          res.status(403).json({ error: { code: 'CSRF', message: 'Invalid origin.' } });
          return;
        }
      }
      const fetchSite = req.get('sec-fetch-site');
      if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
        res.status(403).json({ error: { code: 'CSRF', message: 'Cross-site request rejected.' } });
        return;
      }
    }
    next();
  });

  const config = appConfig;
  const auth = requireAuth(config);

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      app: APP_NAME,
      version: APP_VERSION,
      setupRequired: !config.password,
      remoteCodeRequired: !config.password && !isLoopback(req),
      isLocal: isLoopback(req),
      platform: process.platform,
    });
  });

  app.post(
    '/api/setup',
    asyncHandler(async (req, res) => {
      if (config.password) throw new AppError('ALREADY_CONFIGURED', 'FileAnywhere is already configured.', 409);
      const ipKey = `setup:${clientIp(req)}`;
      const throttle = checkLoginThrottle(ipKey);
      if (!throttle.allowed) {
        res.status(429).json({
          error: {
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Too many attempts. Please wait before trying again.',
            details: { retryAfter: throttle.retryAfter },
          },
        });
        return;
      }
      if (!isLoopback(req) && !verifySetupCode(req.body?.setupCode)) {
        recordLoginFailure(ipKey);
        throw new AppError('SETUP_CODE_REQUIRED', 'The setup code from the server console is required.', 403);
      }
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (password.length < 8 || password.length > 200) {
        throw new AppError('WEAK_PASSWORD', 'Use a password between 8 and 200 characters.', 400);
      }
      config.password = await hashPassword(password);
      config.createdAt = new Date().toISOString();
      saveConfig(config);
      clearLoginFailures(ipKey);
      const token = createSessionToken(config.sessionSecret, true);
      setSessionCookie(res, token, true);
      audit(req, 'setup', {});
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/auth/login',
    asyncHandler(async (req, res) => {
      if (!config.password) throw new AppError('SETUP_REQUIRED', 'FileAnywhere is not configured yet.', 409);
      const ipKey = `login:${clientIp(req)}`;
      const throttle = checkLoginThrottle(ipKey);
      if (!throttle.allowed) {
        res.status(429).json({
          error: {
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Too many attempts. Please wait before trying again.',
            details: { retryAfter: throttle.retryAfter },
          },
        });
        return;
      }
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const valid = await verifyPassword(password, config.password);
      if (!valid) {
        recordLoginFailure(ipKey);
        await new Promise((resolve) => setTimeout(resolve, 350));
        throw new AppError('INVALID_PASSWORD', 'Incorrect password.', 401);
      }
      clearLoginFailures(ipKey);
      const remember = Boolean(req.body?.remember);
      const token = createSessionToken(config.sessionSecret, remember);
      setSessionCookie(res, token, remember);
      audit(req, 'login', { remember });
      res.json({ ok: true });
    }),
  );

  app.get('/api/auth/me', auth, (req, res) => {
    const session = getSession(req, config);
    res.json({
      authenticated: true,
      version: APP_VERSION,
      app: APP_NAME,
      expiresAt: session.expiresAt,
    });
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.post(
    '/api/auth/password',
    auth,
    asyncHandler(async (req, res) => {
      const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const next = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      if (!(await verifyPassword(current, config.password))) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        throw new AppError('INVALID_PASSWORD', 'The current password is incorrect.', 401);
      }
      if (next.length < 8 || next.length > 200) {
        throw new AppError('WEAK_PASSWORD', 'Use a password between 8 and 200 characters.', 400);
      }
      config.password = await hashPassword(next);
      rotateSecret(config);
      saveConfig(config);
      const token = createSessionToken(config.sessionSecret, true);
      setSessionCookie(res, token, true);
      audit(req, 'password-changed', {});
      res.json({ ok: true });
    }),
  );

  app.post('/api/auth/logout-all', auth, (req, res) => {
    rotateSecret(config);
    saveConfig(config);
    clearSessionCookie(res);
    audit(req, 'logout-all', {});
    res.json({ ok: true });
  });

  app.get(
    '/api/system/info',
    auth,
    asyncHandler(async (req, res) => {
      const snapshot = await getSystemSnapshot(req.query.refresh === '1');
      res.json({
        hostname: os.hostname(),
        username: os.userInfo().username,
        platform: process.platform,
        version: APP_VERSION,
        port: appPort,
        localUrl: `http://localhost:${appPort}`,
        hostnameUrl: getHostnameUrl(appPort),
        lanAddresses: getLanAddresses(appPort),
        drives: snapshot.drives,
        knownFolders: snapshot.folders,
        dataDir: DATA_DIR,
      });
    }),
  );

  app.get(
    '/api/system/tunnel',
    auth,
    asyncHandler(async (_req, res) => {
      res.json(await tunnel.status());
    }),
  );
  app.post(
    '/api/system/tunnel/start',
    auth,
    asyncHandler(async (req, res) => {
      const status = await tunnel.start();
      audit(req, 'tunnel-start', { url: status.url });
      res.json(status);
    }),
  );
  app.post(
    '/api/system/tunnel/stop',
    auth,
    asyncHandler(async (req, res) => {
      const status = await tunnel.stop();
      audit(req, 'tunnel-stop', {});
      res.json(status);
    }),
  );
  app.post(
    '/api/system/tunnel/install',
    auth,
    asyncHandler(async (req, res) => {
      const status = await tunnel.install();
      audit(req, 'tunnel-install', {});
      res.json(status);
    }),
  );
  app.post(
    '/api/system/tunnel/settings',
    auth,
    asyncHandler(async (req, res) => {
      const status = await tunnel.setAutoStart(Boolean(req.body?.autoStart));
      audit(req, 'tunnel-settings', { autoStart: Boolean(req.body?.autoStart) });
      res.json(status);
    }),
  );

  app.get(
    '/api/fs/list',
    auth,
    asyncHandler(async (req, res) => {
      const listing = await listDirectory(req.query.path, { dirsOnly: req.query.dirsOnly === '1' });
      res.json(listing);
    }),
  );

  app.get(
    '/api/fs/stat',
    auth,
    asyncHandler(async (req, res) => {
      const target = normalizePath(req.query.path);
      if (isDeniedPath(target)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
      try {
        const stats = await fs.promises.stat(target);
        res.json({
          path: target,
          isDir: stats.isDirectory(),
          isFile: stats.isFile(),
          size: stats.size,
          mtimeMs: stats.mtimeMs,
          ...protectionForPath(target),
        });
      } catch (error) {
        throw mapFsError(error);
      }
    }),
  );

  app.get(
    '/api/fs/content',
    auth,
    asyncHandler(async (req, res) => {
      const content = await readTextContent(req.query.path, String(req.query.encoding || 'auto'));
      res.json(content);
    }),
  );

  app.put(
    '/api/fs/content',
    auth,
    asyncHandler(async (req, res) => {
      const result = await writeTextContent(
        req.body?.path,
        req.body?.content,
        req.body?.encoding,
        req.body?.bom,
        req.body?.expectedMtimeMs,
        Boolean(req.body?.allowProtected),
      );
      audit(req, 'save-file', { path: req.body?.path, size: result.size, allowProtected: Boolean(req.body?.allowProtected) });
      res.json(result);
    }),
  );

  app.get(
    '/api/fs/download',
    auth,
    asyncHandler(async (req, res) => {
      const target = normalizePath(req.query.path);
      if (isDeniedPath(target)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
      let stats: fs.Stats;
      try {
        stats = await fs.promises.stat(target);
      } catch (error) {
        throw mapFsError(error);
      }
      if (stats.isDirectory()) {
        await streamZip(res, [target], { downloadName: `${path.win32.basename(target) || 'drive'}.zip` });
        return;
      }
      await sendRawFile(req, res, target, stats, false);
    }),
  );

  app.get(
    '/api/fs/raw',
    auth,
    asyncHandler(async (req, res) => {
      const target = normalizePath(req.query.path);
      if (isDeniedPath(target)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
      let stats: fs.Stats;
      try {
        stats = await fs.promises.stat(target);
      } catch (error) {
        throw mapFsError(error);
      }
      if (!stats.isFile()) throw new AppError('IS_A_DIRECTORY', 'This path is a folder.', 400);
      const inline = req.query.inline === '1';
      await sendRawFile(req, res, target, stats, inline);
    }),
  );

  app.post(
    '/api/fs/archive',
    auth,
    asyncHandler(async (req, res) => {
      const token = createArchiveTicket(req.body?.paths);
      res.json({ ticket: token });
    }),
  );

  app.get(
    '/api/fs/archive/:token',
    auth,
    asyncHandler(async (req, res) => {
      const paths = getArchiveTicket(req.params.token);
      if (!paths) throw new AppError('TICKET_EXPIRED', 'This download link has expired.', 410);
      await streamZip(res, paths);
    }),
  );

  app.post(
    '/api/fs/upload',
    auth,
    asyncHandler(async (req, res) => {
      const destination = normalizePath(req.query.dest);
      if (isDeniedPath(destination)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
      let stats: fs.Stats;
      try {
        stats = await fs.promises.stat(destination);
      } catch (error) {
        throw mapFsError(error);
      }
      if (!stats.isDirectory()) throw new AppError('NOT_A_DIRECTORY', 'Upload destination is not a folder.', 400);
      await assertWritableProtection([destination], req.query.allowProtected === '1');

      const result = await receiveUploads(req, destination, req.query.allowProtected === '1');
      audit(req, 'upload', {
        destination,
        files: result.items.map((item) => item.name),
        allowProtected: req.query.allowProtected === '1',
      });
      res.status(201).json(result);
    }),
  );

  app.post(
    '/api/fs/folder',
    auth,
    asyncHandler(async (req, res) => {
      const allowProtected = Boolean(req.body?.allowProtected);
      const target = await createFolder(req.body?.parent, req.body?.name, allowProtected);
      audit(req, 'create-folder', { path: target, allowProtected });
      res.status(201).json({ path: target });
    }),
  );

  app.post(
    '/api/fs/file',
    auth,
    asyncHandler(async (req, res) => {
      const allowProtected = Boolean(req.body?.allowProtected);
      const target = await createFile(req.body?.parent, req.body?.name, allowProtected);
      audit(req, 'create-file', { path: target, allowProtected });
      res.status(201).json({ path: target });
    }),
  );

  app.post(
    '/api/fs/rename',
    auth,
    asyncHandler(async (req, res) => {
      const allowProtected = Boolean(req.body?.allowProtected);
      const target = await renameItem(req.body?.path, req.body?.newName, allowProtected);
      audit(req, 'rename', { from: req.body?.path, to: target, allowProtected });
      res.json({ path: target });
    }),
  );

  app.post(
    '/api/fs/move',
    auth,
    asyncHandler(async (req, res) => {
      const allowProtected = Boolean(req.body?.allowProtected);
      const result = await copyOrMoveItems(req.body?.paths, req.body?.destination, 'move', allowProtected);
      audit(req, 'move', {
        sources: req.body?.paths,
        destination: req.body?.destination,
        allowProtected,
        succeeded: result.results.filter((item) => item.ok).length,
      });
      res.json(result);
    }),
  );

  app.post(
    '/api/fs/copy',
    auth,
    asyncHandler(async (req, res) => {
      const allowProtected = Boolean(req.body?.allowProtected);
      const result = await copyOrMoveItems(req.body?.paths, req.body?.destination, 'copy', allowProtected);
      audit(req, 'copy', {
        sources: req.body?.paths,
        destination: req.body?.destination,
        allowProtected,
        succeeded: result.results.filter((item) => item.ok).length,
      });
      res.json(result);
    }),
  );

  app.post(
    '/api/fs/delete',
    auth,
    asyncHandler(async (req, res) => {
      const allowProtected = Boolean(req.body?.allowProtected);
      const result = await deleteItems(req.body?.paths, allowProtected);
      audit(req, 'recycle', {
        paths: req.body?.paths,
        allowProtected,
        succeeded: result.results.filter((item) => item.ok).length,
      });
      res.json(result);
    }),
  );

  app.get(
    '/api/fs/search',
    auth,
    asyncHandler(async (req, res) => {
      const result = await searchFiles(req.query.path, req.query.q, {
        recursive: req.query.recursive !== '0',
        includeHidden: req.query.hidden === '1',
        limit: Number(req.query.limit) || 200,
      });
      res.json(result);
    }),
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } });
  });

  const clientDir = path.resolve(__dirname, '..', 'client');
  if (fs.existsSync(clientDir)) {
    app.use(
      '/assets',
      express.static(path.join(clientDir, 'assets'), {
        immutable: true,
        maxAge: '1y',
        fallthrough: false,
      }),
    );
    app.use(express.static(clientDir, { index: false, maxAge: 0, etag: true }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(clientDir, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('text/plain')
        .send('FileAnywhere API is running. Start the Vite dev server with "npm run dev" or build the app with "npm run build".');
    });
  }

  app.use(errorMiddleware);
  return app;
}

async function receiveUploads(
  req: Request,
  destination: string,
  allowProtected: boolean,
): Promise<{ items: Array<{ path: string; name: string; size: number; renamed: boolean }>; renamedCount: number }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const temporaryFiles: string[] = [];
    const writePromises: Array<Promise<{ tempPath: string; filename: string; size: number }>> = [];
    const reserved = new Set<string>();
    let busboy: Busboy.Busboy;

    const cleanupTemps = async () => {
      await Promise.all(
        temporaryFiles.map((item) => fs.promises.rm(item, { force: true }).catch(() => undefined)),
      );
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanupTemps().finally(() => {
        if (error instanceof AppError) reject(error);
        else reject(mapFsError(error));
      });
    };

    try {
      busboy = Busboy({
        headers: req.headers,
        defParamCharset: 'utf8',
        limits: { files: 50, fields: 10, fileSize: 1024 * 1024 * 1024 * 1024 },
      });
    } catch {
      reject(new AppError('INVALID_UPLOAD', 'The upload request is invalid.', 400));
      return;
    }

    busboy.on('file', (_field, file, info) => {
      if (settled) {
        file.resume();
        return;
      }
      const tempPath = path.win32.join(
        destination,
        `.fa-upload-${process.pid}-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`,
      );
      temporaryFiles.push(tempPath);
      const writePromise = new Promise<{ tempPath: string; filename: string; size: number }>((fileResolve, fileReject) => {
        const output = fs.createWriteStream(tempPath, { flags: 'wx' });
        let bytes = 0;
        file.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
        });
        file.on('limit', () => {
          fileReject(new AppError('FILE_TOO_LARGE', 'The uploaded file is too large.', 413));
        });
        file.on('error', (error) => {
          output.destroy();
          fileReject(error);
        });
        output.on('error', (error) => fileReject(error));
        output.on('finish', () => {
          fileResolve({ tempPath, filename: info.filename || 'upload', size: bytes });
        });
        file.pipe(output);
      });
      writePromises.push(writePromise);
      writePromise.catch(fail);
    });

    busboy.on('error', fail);
    busboy.on('close', () => {
      if (settled) return;
      (async () => {
        try {
          const received = await Promise.all(writePromises);
          if (received.length === 0) {
            throw new AppError('NO_FILES', 'No files were uploaded.', 400);
          }
          const items: Array<{ path: string; name: string; size: number; renamed: boolean }> = [];
          for (const upload of received) {
            const saved = await saveUploadedFile(destination, upload, allowProtected, reserved);
            items.push(saved);
          }
          settled = true;
          resolve({ items, renamedCount: items.filter((item) => item.renamed).length });
        } catch (error) {
          fail(error);
        }
      })();
    });

    req.on('aborted', () => {
      fail(new AppError('UPLOAD_ABORTED', 'The upload was cancelled.', 400));
    });
    req.on('error', fail);
    req.pipe(busboy);
  });
}

const INLINE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/mp4',
  'audio/aac',
  'application/pdf',
]);

async function sendRawFile(
  req: Request,
  res: Response,
  filePath: string,
  stats: fs.Stats,
  inline: boolean,
): Promise<void> {
  const mimeType = (mime.lookup(filePath) || 'application/octet-stream') as string;
  const canInline = inline && INLINE_TYPES.has(mimeType);
  const disposition = canInline && inline ? 'inline' : 'attachment';
  const filename = path.win32.basename(filePath);
  res.setHeader('Content-Type', canInline ? mimeType : mimeType.startsWith('text/') ? 'text/plain; charset=utf-8' : mimeType);
  res.setHeader('Content-Disposition', contentDisposition(disposition, filename));
  res.setHeader('Content-Length', String(stats.size));
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  const etag = `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
  res.setHeader('ETag', etag);
  if (mimeType === 'image/svg+xml' && canInline) {
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
  }
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  let start = 0;
  let end = stats.size > 0 ? stats.size - 1 : 0;
  let status = 200;
  const rangeHeader = req.headers.range;
  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      res.status(416).setHeader('Content-Range', `bytes */${stats.size}`).end();
      return;
    }
    const hasStart = match[1] !== '';
    const hasEnd = match[2] !== '';
    if (!hasStart && hasEnd) {
      const suffix = Number(match[2]);
      start = Math.max(stats.size - suffix, 0);
      end = stats.size - 1;
    } else {
      start = Number(match[1]);
      end = hasEnd ? Math.min(Number(match[2]), stats.size - 1) : stats.size - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stats.size) {
      res.status(416).setHeader('Content-Range', `bytes */${stats.size}`).end();
      return;
    }
    status = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
    res.setHeader('Content-Length', String(end - start + 1));
  }
  res.status(status);
  if (stats.size === 0) {
    res.end();
    return;
  }
  const stream = fs.createReadStream(filePath, { start, end });
  stream.on('error', (error) => {
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.destroy(error);
    }
  });
  stream.pipe(res);
}

export function setupCodeForDisplay(): string | null {
  return appConfig.password ? null : getSetupCode();
}
