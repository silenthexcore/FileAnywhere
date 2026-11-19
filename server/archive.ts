import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import type { Response } from 'express';
import { AppError } from './errors';
import { isDeniedPath, normalizePath } from './paths';

interface Ticket {
  paths: string[];
  createdAt: number;
}

const tickets = new Map<string, Ticket>();
const TICKET_TTL = 10 * 60 * 1000;
const MAX_TICKETS = 40;

function pruneTickets(): void {
  const now = Date.now();
  for (const [key, ticket] of tickets) {
    if (now - ticket.createdAt > TICKET_TTL) tickets.delete(key);
  }
  while (tickets.size > MAX_TICKETS) {
    const oldest = tickets.keys().next().value;
    if (oldest === undefined) break;
    tickets.delete(oldest);
  }
}

export function createArchiveTicket(paths: unknown): string {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new AppError('INVALID_REQUEST', 'No items were selected.', 400);
  }
  if (paths.length > 1000) {
    throw new AppError('TOO_MANY_ITEMS', 'Too many items for one archive.', 400);
  }
  const normalized = Array.from(new Set(paths.map((item) => normalizePath(item))));
  for (const item of normalized) {
    if (isDeniedPath(item)) throw new AppError('FORBIDDEN_PATH', 'This path is reserved.', 403);
    if (!fs.existsSync(item)) throw new AppError('NOT_FOUND', `The item no longer exists: ${item}`, 404);
  }
  pruneTickets();
  const token = crypto.randomBytes(24).toString('base64url');
  tickets.set(token, { paths: normalized, createdAt: Date.now() });
  return token;
}

export function getArchiveTicket(token: string): string[] | null {
  pruneTickets();
  const ticket = tickets.get(token);
  if (!ticket) return null;
  if (Date.now() - ticket.createdAt > TICKET_TTL) {
    tickets.delete(token);
    return null;
  }
  return ticket.paths;
}

function safeBaseName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'download';
}

function uniqueRootName(name: string, used: Set<string>): string {
  let candidate = safeBaseName(name);
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${safeBaseName(name)} (${index})`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function zipFallbackName(name: string): string {
  return name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
}

export function contentDisposition(type: 'attachment' | 'inline', filename: string): string {
  const fallback = zipFallbackName(filename);
  const encoded = encodeURIComponent(filename).replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function addPathToArchive(
  archive: archiver.Archiver,
  source: string,
  entryName: string,
  depth = 0,
): Promise<void> {
  if (depth > 40) return;
  if (isDeniedPath(source)) return;
  let stats: fs.Stats;
  try {
    stats = await fs.promises.lstat(source);
  } catch {
    return;
  }
  if (stats.isSymbolicLink()) return; // Avoid following links outside the selected tree.
  if (stats.isFile()) {
    archive.file(source, { name: entryName });
    return;
  }
  if (!stats.isDirectory()) return;
  let children: string[] = [];
  try {
    children = await fs.promises.readdir(source);
  } catch {
    return;
  }
  if (children.length === 0) {
    archive.append(Buffer.alloc(0), { name: `${entryName}/` });
    return;
  }
  for (const child of children) {
    const childPath = path.win32.join(source, child);
    if (isDeniedPath(childPath)) continue;
    await addPathToArchive(archive, childPath, `${entryName}/${child}`, depth + 1);
  }
}

export async function streamZip(
  res: Response,
  paths: string[],
  options: { downloadName?: string } = {},
): Promise<void> {
  const roots = paths.map((item) => normalizePath(item));
  if (roots.length === 0) throw new AppError('INVALID_REQUEST', 'No items were selected.', 400);
  const used = new Set<string>();
  const entries: Array<{ source: string; name: string }> = [];
  for (const source of roots) {
    const parsed = path.win32.parse(source);
    const isRoot = path.win32.normalize(source).toLowerCase() === path.win32.normalize(parsed.root).toLowerCase();
    const base = isRoot ? `${parsed.root.replace(/[:\\/]/g, '') || 'drive'}_drive` : path.win32.basename(source);
    entries.push({ source, name: uniqueRootName(base, used) });
  }

  const fallbackName =
    options.downloadName ||
    (entries.length === 1 ? `${entries[0].name}.zip` : `FileAnywhere-${new Date().toISOString().slice(0, 10)}.zip`);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', contentDisposition('attachment', fallbackName));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (error) => {
    console.error('[archive]', error);
    res.destroy(error);
  });
  archive.pipe(res);
  for (const entry of entries) {
    await addPathToArchive(archive, entry.source, entry.name);
  }
  await archive.finalize();
}
