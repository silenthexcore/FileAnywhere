import fs from 'node:fs';
import path from 'node:path';
import iconv from 'iconv-lite';
import { AppError, mapFsError } from './errors';
import {
  caseInsensitiveKey,
  inspectProtection,
  isDeniedPath,
  isHiddenName,
  isSamePath,
  isSubPath,
  normalizePath,
  protectionForPath,
  validateEntryName,
} from './paths';
import { driveLabelForPath, getSystemSnapshot } from './system';

const MAX_LIST_ITEMS = 10_000;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_BATCH = 1000;

export interface FsItem {
  name: string;
  path: string;
  isDir: boolean;
  isFile: boolean;
  isSymlink: boolean;
  size: number | null;
  mtimeMs: number | null;
  ext: string;
  hidden: boolean;
  protected: boolean;
  system: boolean;
}

export interface ListingResult {
  path: string;
  parent: string | null;
  name: string;
  root: string;
  breadcrumbs: Array<{ name: string; path: string }>;
  items: FsItem[];
  truncated: boolean;
  total: number;
  directoryProtected: boolean;
  disk: { total: number; free: number } | null;
}

function toFsItem(entry: fs.Dirent, directory: string, stats: fs.Stats, isDir: boolean): FsItem {
  const fullPath = path.win32.join(directory, entry.name);
  const protection = protectionForPath(fullPath);
  return {
    name: entry.name,
    path: fullPath,
    isDir,
    isFile: !isDir,
    isSymlink: entry.isSymbolicLink(),
    size: isDir ? null : Number(stats.size),
    mtimeMs: stats.mtimeMs || null,
    ext: isDir ? '' : path.win32.extname(entry.name).slice(1).toLowerCase(),
    hidden: isHiddenName(entry.name),
    protected: protection.protected,
    system: protection.system,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function buildBreadcrumbs(current: string, rootLabel: string): Array<{ name: string; path: string }> {
  const parsed = path.win32.parse(current);
  const root = parsed.root;
  const crumbs: Array<{ name: string; path: string }> = [
    { name: rootLabel, path: root },
  ];
  const relative = current.slice(root.length);
  let built = root;
  for (const segment of relative.split(/[\\/]+/).filter(Boolean)) {
    built = path.win32.join(built, segment);
    crumbs.push({ name: segment, path: built });
  }
  return crumbs;
}

async function diskUsage(target: string): Promise<{ total: number; free: number } | null> {
  try {
    const stats = await fs.promises.statfs(target);
    return {
      total: Number(stats.blocks) * Number(stats.bsize),
      free: Number(stats.bavail) * Number(stats.bsize),
    };
  } catch {
    return null;
  }
}

export async function listDirectory(input: unknown, options: { dirsOnly?: boolean } = {}): Promise<ListingResult> {
  const directory = normalizePath(input);
  if (isDeniedPath(directory)) {
    throw new AppError('FORBIDDEN_PATH', 'This folder is reserved by FileAnywhere.', 403);
  }
  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(directory);
  } catch (error) {
    throw mapFsError(error);
  }
  if (!stats.isDirectory()) throw new AppError('NOT_A_DIRECTORY', 'This path is not a folder.', 400);

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw mapFsError(error);
  }

  const truncated = entries.length > MAX_LIST_ITEMS;
  const limited = truncated ? entries.slice(0, MAX_LIST_ITEMS) : entries;
  const items = await mapWithConcurrency(limited, 32, async (entry) => {
    const fullPath = path.win32.join(directory, entry.name);
    if (isDeniedPath(fullPath)) return null;
    try {
      const lstats = await fs.promises.lstat(fullPath);
      let isDir = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          const target = await fs.promises.stat(fullPath);
          isDir = target.isDirectory();
        } catch {
          isDir = false;
        }
      }
      if (options.dirsOnly && !isDir) return null;
      return toFsItem(entry, directory, lstats, isDir);
    } catch {
      if (options.dirsOnly) return null;
      const protection = protectionForPath(fullPath);
      return {
        name: entry.name,
        path: fullPath,
        isDir: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymlink: entry.isSymbolicLink(),
        size: null,
        mtimeMs: null,
        ext: entry.isDirectory() ? '' : path.win32.extname(entry.name).slice(1).toLowerCase(),
        hidden: isHiddenName(entry.name),
        protected: protection.protected,
        system: protection.system,
      } satisfies FsItem;
    }
  });

  const snapshot = await getSystemSnapshot();
  const root = path.win32.parse(directory).root;
  const rootLabel = driveLabelForPath(snapshot, directory);
  const protection = protectionForPath(directory);
  const disk = await diskUsage(directory);
  const visibleItems = items.filter((item): item is FsItem => item !== null);

  return {
    path: directory,
    parent: isSamePath(directory, root) ? null : path.win32.dirname(directory),
    name: isSamePath(directory, root) ? rootLabel : path.win32.basename(directory),
    root,
    breadcrumbs: buildBreadcrumbs(directory, rootLabel),
    items: visibleItems,
    truncated,
    total: visibleItems.length,
    directoryProtected: protection.protected,
    disk,
  };
}

export async function ensureNotCritical(paths: string[], allowProtected: boolean): Promise<void> {
  const inspection = await inspectProtection(paths);
  if (inspection.critical) {
    throw new AppError(
      'CRITICAL_PATH',
      'This is a critical Windows location. FileAnywhere will not move, rename, or delete it.',
      403,
      { paths: inspection.criticalPaths },
    );
  }
  if (inspection.protected && !allowProtected) {
    throw new AppError(
      'PROTECTED_PATH',
      'This is a protected system location. Confirm the operation to continue.',
      403,
      { paths: inspection.protectedPaths },
    );
  }
}

export async function assertWritableProtection(targets: string[], allowProtected: boolean): Promise<void> {
  const inspection = await inspectProtection(targets);
  if (inspection.protected && !allowProtected) {
    throw new AppError(
      'PROTECTED_PATH',
      'This is a protected system location. Confirm the operation to continue.',
      403,
      { paths: inspection.protectedPaths },
    );
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.promises.lstat(target);
    return true;
  } catch {
    return false;
  }
}

async function availablePath(directory: string, name: string, isDir: boolean, reserved?: Set<string>): Promise<string> {
  let candidate = path.win32.join(directory, name);
  const ext = isDir ? '' : path.win32.extname(name);
  const base = isDir ? name : name.slice(0, name.length - ext.length);
  let index = 1;
  while (true) {
    const key = caseInsensitiveKey(candidate);
    if ((!reserved || !reserved.has(key)) && !(await pathExists(candidate))) return candidate;
    candidate = path.win32.join(directory, `${base} (${index})${ext}`);
    index += 1;
    if (index > 9999) throw new AppError('NAME_CONFLICT', 'Could not find an available name.', 409);
  }
}

export async function createFolder(parentInput: unknown, nameInput: unknown, allowProtected: boolean) {
  const parent = normalizePath(parentInput);
  const name = validateEntryName(nameInput);
  const target = path.win32.join(parent, name);
  await assertWritableProtection([parent], allowProtected);
  await assertWritableProtection([target], allowProtected);
  try {
    await fs.promises.mkdir(target);
  } catch (error) {
    throw mapFsError(error);
  }
  return target;
}

export async function createFile(parentInput: unknown, nameInput: unknown, allowProtected: boolean) {
  const parent = normalizePath(parentInput);
  const name = validateEntryName(nameInput);
  const target = path.win32.join(parent, name);
  await assertWritableProtection([parent], allowProtected);
  await assertWritableProtection([target], allowProtected);
  try {
    const handle = await fs.promises.open(target, 'wx');
    await handle.close();
  } catch (error) {
    throw mapFsError(error);
  }
  return target;
}

export async function renameItem(input: unknown, newNameInput: unknown, allowProtected: boolean) {
  const source = normalizePath(input);
  const newName = validateEntryName(newNameInput);
  if (isDeniedPath(source)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
  await ensureNotCritical([source], allowProtected);
  const parent = path.win32.dirname(source);
  const target = path.win32.join(parent, newName);
  if (isSamePath(source, target)) return target;
  await assertWritableProtection([parent, target], allowProtected);
  if (await pathExists(target)) {
    if (!isSamePath(source, target)) {
      throw new AppError('NAME_CONFLICT', 'An item with this name already exists.', 409);
    }
  }
  try {
    if (source.toLowerCase() === target.toLowerCase() && source !== target) {
      const temp = path.win32.join(parent, `.fa-rename-${Date.now().toString(36)}`);
      await fs.promises.rename(source, temp);
      await fs.promises.rename(temp, target);
    } else {
      await fs.promises.rename(source, target);
    }
  } catch (error) {
    throw mapFsError(error);
  }
  return target;
}

export interface OperationResult {
  path: string;
  ok: boolean;
  destination?: string;
  error?: string;
  renamed?: boolean;
}

function validateBatch(paths: unknown): string[] {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new AppError('INVALID_REQUEST', 'No items were selected.', 400);
  }
  if (paths.length > MAX_BATCH) {
    throw new AppError('TOO_MANY_ITEMS', `A maximum of ${MAX_BATCH} items can be processed at once.`, 400);
  }
  return paths.map((item) => normalizePath(item));
}

export async function copyOrMoveItems(
  rawPaths: unknown,
  destinationInput: unknown,
  mode: 'copy' | 'move',
  allowProtected: boolean,
): Promise<{ results: OperationResult[]; destination: string }> {
  const sources = validateBatch(rawPaths);
  const destination = normalizePath(destinationInput);
  if (isDeniedPath(destination)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
  let destinationStats: fs.Stats;
  try {
    destinationStats = await fs.promises.stat(destination);
  } catch (error) {
    throw mapFsError(error);
  }
  if (!destinationStats.isDirectory()) {
    throw new AppError('NOT_A_DIRECTORY', 'The destination is not a folder.', 400);
  }

  const checkTargets = mode === 'move' ? [...sources, destination] : [destination];
  if (mode === 'move') {
    await ensureNotCritical(sources, allowProtected);
  }
  await assertWritableProtection(checkTargets, allowProtected);
  // A source itself must be readable, but only destination writes require extra permission.
  for (const source of sources) {
    if (isDeniedPath(source)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
  }

  const results: OperationResult[] = [];
  const reserved = new Set<string>();
  for (const source of sources) {
    try {
      const stats = await fs.promises.lstat(source);
      const isDir = stats.isDirectory();
      if (isDir && isSubPath(source, destination)) {
        throw new AppError('INVALID_OPERATION', 'A folder cannot be copied or moved into itself.', 400);
      }
      if (path.win32.dirname(source).toLowerCase() === destination.toLowerCase()) {
        if (mode === 'move') {
          results.push({ path: source, ok: false, error: 'The item is already in this folder.' });
          continue;
        }
      }
      const target = await availablePath(destination, path.win32.basename(source), isDir, reserved);
      reserved.add(caseInsensitiveKey(target));
      if (mode === 'copy') {
        if (isDir) {
          await fs.promises.cp(source, target, {
            recursive: true,
            force: false,
            errorOnExist: true,
            preserveTimestamps: true,
            verbatimSymlinks: true,
          });
        } else {
          await fs.promises.copyFile(source, target, fs.constants.COPYFILE_EXCL);
        }
      } else {
        try {
          await fs.promises.rename(source, target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
          if (isDir) {
            await fs.promises.cp(source, target, {
              recursive: true,
              force: false,
              errorOnExist: true,
              preserveTimestamps: true,
              verbatimSymlinks: true,
            });
          } else {
            await fs.promises.copyFile(source, target, fs.constants.COPYFILE_EXCL);
          }
          const { recyclePaths } = await import('./recycle');
          const recycleResult = await recyclePaths([source]);
          if (!recycleResult[0]?.ok) {
            throw new AppError(
              'MOVE_INCOMPLETE',
              `Copied, but the original could not be moved to the Recycle Bin: ${recycleResult[0]?.error || 'unknown error'}`,
              500,
            );
          }
        }
      }
      results.push({
        path: source,
        ok: true,
        destination: target,
        renamed: target.toLowerCase() !== path.win32.join(destination, path.win32.basename(source)).toLowerCase(),
      });
    } catch (error) {
      const mapped = error instanceof AppError ? error : mapFsError(error);
      results.push({ path: source, ok: false, error: mapped.message });
    }
  }
  return { results, destination };
}

export async function deleteItems(
  rawPaths: unknown,
  allowProtected: boolean,
): Promise<{ results: OperationResult[] }> {
  const sources = validateBatch(rawPaths);
  for (const source of sources) {
    if (isDeniedPath(source)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
    if (!(await pathExists(source))) {
      throw new AppError('NOT_FOUND', `The item no longer exists: ${source}`, 404);
    }
  }
  await ensureNotCritical(sources, allowProtected);
  const { recyclePaths } = await import('./recycle');
  const recycled = await recyclePaths(sources);
  return {
    results: recycled.map((item) => ({
      path: item.path,
      ok: item.ok,
      error: item.error,
    })),
  };
}

function isLikelyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8192);
  if (sample.includes(0)) return true;
  let control = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte < 7 || (byte > 13 && byte < 32)) control += 1;
  }
  return sample.length > 0 && control / sample.length > 0.02;
}

export const SUPPORTED_ENCODINGS = [
  'utf8',
  'utf16le',
  'utf16be',
  'gb18030',
  'big5',
  'shift_jis',
  'windows-1252',
] as const;
export type TextEncoding = (typeof SUPPORTED_ENCODINGS)[number];

function decodeBuffer(buffer: Buffer, requested?: string): { content: string; encoding: TextEncoding; bom: boolean } {
  if (requested && requested !== 'auto') {
    const encoding = (SUPPORTED_ENCODINGS as readonly string[]).includes(requested)
      ? (requested as TextEncoding)
      : 'utf8';
    let content = iconv.decode(buffer, encoding);
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    return { content, encoding, bom: false };
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { content: iconv.decode(buffer.subarray(3), 'utf8'), encoding: 'utf8', bom: true };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { content: iconv.decode(buffer.subarray(2), 'utf16le'), encoding: 'utf16le', bom: true };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { content: iconv.decode(buffer.subarray(2), 'utf16be'), encoding: 'utf16be', bom: true };
  }
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { content, encoding: 'utf8', bom: false };
  } catch {
    // Non-UTF-8 text is common on Chinese Windows; GB18030 is the safest default.
    return { content: iconv.decode(buffer, 'gb18030'), encoding: 'gb18030', bom: false };
  }
}

export interface TextContent {
  path: string;
  name: string;
  content: string;
  encoding: TextEncoding;
  bom: boolean;
  size: number;
  mtimeMs: number;
  eol: 'CRLF' | 'LF';
  writable: boolean;
  protected: boolean;
}

export async function readTextContent(input: unknown, requestedEncoding?: string): Promise<TextContent> {
  const filePath = normalizePath(input);
  if (isDeniedPath(filePath)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(filePath);
  } catch (error) {
    throw mapFsError(error);
  }
  if (!stats.isFile()) throw new AppError('IS_A_DIRECTORY', 'Folders cannot be opened in the editor.', 400);
  if (stats.size > MAX_TEXT_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 'This file is too large to open in the editor (limit: 8 MB).', 413);
  }
  let buffer: Buffer;
  try {
    buffer = await fs.promises.readFile(filePath);
  } catch (error) {
    throw mapFsError(error);
  }
  const hasBom = (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) ||
    (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff)));
  if (!hasBom && isLikelyBinary(buffer)) {
    throw new AppError('BINARY_FILE', 'This file appears to be binary and cannot be edited as text.', 400);
  }
  const decoded = decodeBuffer(buffer, requestedEncoding);
  let writable = true;
  try {
    await fs.promises.access(filePath, fs.constants.W_OK);
  } catch {
    writable = false;
  }
  return {
    path: filePath,
    name: path.win32.basename(filePath),
    content: decoded.content,
    encoding: decoded.encoding,
    bom: decoded.bom,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    eol: decoded.content.includes('\r\n') ? 'CRLF' : 'LF',
    writable,
    protected: protectionForPath(filePath).protected,
  };
}

export async function writeTextContent(
  input: unknown,
  content: unknown,
  encodingInput: unknown,
  bomInput: unknown,
  expectedMtimeMs: unknown,
  allowProtected: boolean,
): Promise<{ path: string; mtimeMs: number; size: number }> {
  const filePath = normalizePath(input);
  if (isDeniedPath(filePath)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
  if (typeof content !== 'string') throw new AppError('INVALID_REQUEST', 'File content is required.', 400);
  const encoding = (SUPPORTED_ENCODINGS as readonly string[]).includes(String(encodingInput))
    ? (String(encodingInput) as TextEncoding)
    : 'utf8';
  const bom = Boolean(bomInput);
  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(filePath);
  } catch (error) {
    throw mapFsError(error);
  }
  if (!stats.isFile()) throw new AppError('IS_A_DIRECTORY', 'This path is a folder.', 400);
  if (typeof expectedMtimeMs === 'number' && expectedMtimeMs > 0) {
    if (Math.abs(stats.mtimeMs - expectedMtimeMs) > 1) {
      throw new AppError('FILE_CHANGED', 'The file was changed by another program after it was opened.', 409, {
        mtimeMs: stats.mtimeMs,
        size: stats.size,
      });
    }
  }
  await assertWritableProtection([filePath], allowProtected);
  const encoded = iconv.encode(content, encoding);
  const BOM: Record<string, Buffer> = {
    utf8: Buffer.from([0xef, 0xbb, 0xbf]),
    utf16le: Buffer.from([0xff, 0xfe]),
    utf16be: Buffer.from([0xfe, 0xff]),
  };
  const data = bom && BOM[encoding] ? Buffer.concat([BOM[encoding], encoded]) : encoded;
  const temporary = path.win32.join(
    path.win32.dirname(filePath),
    `.fa-save-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  try {
    await fs.promises.writeFile(temporary, data);
    await fs.promises.rename(temporary, filePath);
    const updated = await fs.promises.stat(filePath);
    return { path: filePath, mtimeMs: updated.mtimeMs, size: updated.size };
  } catch (error) {
    try {
      await fs.promises.rm(temporary, { force: true });
    } catch {
      /* ignore */
    }
    throw mapFsError(error);
  }
}

export async function saveUploadedFile(
  destinationInput: unknown,
  upload: { tempPath: string; filename: string; size: number },
  allowProtected: boolean,
  reserved: Set<string>,
): Promise<{ path: string; name: string; size: number; renamed: boolean }> {
  const destination = normalizePath(destinationInput);
  await assertWritableProtection([destination], allowProtected);
  const safeName = path.win32.basename(upload.filename).replace(/[\x00-\x1f]/g, '').trim();
  if (!safeName) throw new AppError('INVALID_NAME', 'The uploaded file has an invalid name.', 400);
  const target = await availablePath(destination, safeName, false, reserved);
  reserved.add(caseInsensitiveKey(target));
  try {
    await fs.promises.rename(upload.tempPath, target);
  } catch (error) {
    throw mapFsError(error);
  }
  return {
    path: target,
    name: path.win32.basename(target),
    size: upload.size,
    renamed: path.win32.basename(target).toLowerCase() !== safeName.toLowerCase(),
  };
}

export async function searchFiles(
  baseInput: unknown,
  queryInput: unknown,
  options: { recursive: boolean; includeHidden: boolean; limit?: number },
): Promise<{
  results: FsItem[];
  truncated: boolean;
  scanned: number;
  elapsedMs: number;
}> {
  const base = normalizePath(baseInput);
  const query = typeof queryInput === 'string' ? queryInput.trim() : '';
  if (query.length < 2) return { results: [], truncated: false, scanned: 0, elapsedMs: 0 };
  if (isDeniedPath(base)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
  const lowerQuery = query.toLowerCase();
  const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 500);
  const started = Date.now();
  const results: FsItem[] = [];
  let scanned = 0;
  let truncated = false;
  let queue: Array<{ dir: string; depth: number }> = [{ dir: base, depth: 0 }];
  const maxDepth = options.recursive ? 12 : 1;

  while (queue.length > 0) {
    if (Date.now() - started > 8000 || results.length >= limit) {
      truncated = true;
      break;
    }
    const current = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (results.length >= limit) {
        truncated = true;
        break;
      }
      const fullPath = path.win32.join(current.dir, entry.name);
      if (isDeniedPath(fullPath)) continue;
      const hidden = isHiddenName(entry.name);
      if (hidden && !options.includeHidden) continue;
      scanned += 1;
      let isDir = entry.isDirectory();
      try {
        const stats = await fs.promises.lstat(fullPath);
        if (entry.isSymbolicLink()) {
          try {
            isDir = (await fs.promises.stat(fullPath)).isDirectory();
          } catch {
            isDir = false;
          }
        }
        if (entry.name.toLowerCase().includes(lowerQuery)) {
          results.push(toFsItem(entry, current.dir, stats, isDir));
        }
        if (isDir && current.depth < maxDepth && !entry.isSymbolicLink()) {
          queue.push({ dir: fullPath, depth: current.depth + 1 });
        }
      } catch {
        /* unreadable entry */
      }
    }
    if (!options.recursive) {
      queue = [];
    }
  }
  return { results, truncated, scanned, elapsedMs: Date.now() - started };
}

export function normalizeMany(input: unknown): string[] {
  return validateBatch(input);
}
