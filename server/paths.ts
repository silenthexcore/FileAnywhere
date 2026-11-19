import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { DATA_DIR } from './config';

const execFileAsync = promisify(execFile);

/** Convert user input into a normalized absolute Windows path. */
export function normalizePath(input: unknown): string {
  if (typeof input !== 'string') throw new Error('INVALID_PATH');
  const raw = input.trim();
  if (!raw || raw.includes('\0')) throw new Error('INVALID_PATH');
  if (raw.length > 32000) throw new Error('INVALID_PATH');
  if (!path.win32.isAbsolute(raw)) throw new Error('INVALID_PATH');
  let normalized = path.win32.normalize(raw);
  const root = path.win32.parse(normalized).root;
  if (normalized.length > root.length) normalized = normalized.replace(/[\\/]+$/, '');
  return normalized;
}

export function isSubPath(parent: string, child: string): boolean {
  const p = parent.toLowerCase().replace(/[\\/]+$/, '');
  const c = child.toLowerCase().replace(/[\\/]+$/, '');
  if (p === c) return true;
  return c.startsWith(p.endsWith('\\') ? p : `${p}\\`);
}

export function isDriveRoot(input: string): boolean {
  const root = path.win32.parse(input).root;
  return path.win32.normalize(input).toLowerCase() === path.win32.normalize(root).toLowerCase();
}

const dataDirLower = path.win32.normalize(DATA_DIR).toLowerCase();
const deniedRoots = [dataDirLower];
const deniedFiles = [path.win32.join(dataDirLower, 'config.json')];

/** The application's own credentials directory is never exposed through the API. */
export function isDeniedPath(input: string): boolean {
  const p = path.win32.normalize(input).toLowerCase();
  return deniedRoots.some((root) => isSubPath(root, p)) || deniedFiles.includes(p);
}

const systemRoot = (process.env.SystemRoot || 'C:\\Windows').toLowerCase();
const programFiles = (process.env.ProgramFiles || 'C:\\Program Files').toLowerCase();
const programFilesX86 = (process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)').toLowerCase();
const programData = (process.env.ProgramData || 'C:\\ProgramData').toLowerCase();

const protectedRoots: Array<{ root: string; reason: string }> = [
  { root: systemRoot, reason: 'windows' },
  { root: programFiles, reason: 'program' },
  { root: programFilesX86, reason: 'program' },
  { root: programData, reason: 'programData' },
];

const protectedRootNames = new Set([
  '$recycle.bin',
  'system volume information',
  'recovery',
  'boot',
  'bootmgr',
  'bootnxt',
  'ntldr',
  'bootsect.bak',
  'pagefile.sys',
  'hiberfil.sys',
  'swapfile.sys',
  'dumpstack.log',
  'dumpstack.log.tmp',
]);

/** Top-level folders that can never be moved, renamed, or deleted through the app. */
const criticalRoots = new Set([
  systemRoot.replace(/[\\/]+$/, ''),
  programFiles.replace(/[\\/]+$/, ''),
  programFilesX86.replace(/[\\/]+$/, ''),
  programData.replace(/[\\/]+$/, ''),
  'c:\\users',
  'c:\\recovery',
  'c:\\boot',
  'c:\\$recycle.bin',
  'c:\\system volume information',
]);

const hiddenNames = new Set([
  'desktop.ini',
  'thumbs.db',
  '$recycle.bin',
  'system volume information',
  'pagefile.sys',
  'hiberfil.sys',
  'swapfile.sys',
  'ntuser.dat',
  'ntuser.ini',
  'ntuser.dat.log1',
  'ntuser.dat.log2',
  'appdata',
  'application data',
  'local settings',
  'cookies',
  'nethood',
  'printhood',
  'recent',
  'sendto',
  'templates',
  'start menu',
  'dumpstack.log',
  'dumpstack.log.tmp',
]);

export function isHiddenName(name: string): boolean {
  return name.startsWith('.') || hiddenNames.has(name.toLowerCase());
}

export function protectionForPath(input: string): {
  protected: boolean;
  system: boolean;
  reason: string | null;
  critical: boolean;
} {
  const normalized = path.win32.normalize(input).toLowerCase().replace(/[\\/]+$/, '');
  const parsed = path.win32.parse(normalized);
  const root = parsed.root.replace(/[\\/]+$/, '');
  const segments = normalized.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);

  let reason: string | null = null;
  for (const item of protectedRoots) {
    if (isSubPath(item.root.replace(/[\\/]+$/, ''), normalized)) {
      reason = item.reason;
      break;
    }
  }

  const topName = segments[0]?.toLowerCase() || '';
  if (!reason && protectedRootNames.has(topName)) reason = topName === '$recycle.bin' ? 'recycleBin' : 'system';
  if (!reason && protectedRootNames.has(parsed.base.toLowerCase())) reason = 'system';

  const critical = criticalRoots.has(normalized) || isDriveRoot(input);
  return {
    protected: reason !== null,
    system: protectedRoots.some((item) => isSubPath(item.root.replace(/[\\/]+$/, ''), normalized)) ||
      protectedRootNames.has(topName),
    reason,
    critical,
  };
}

/** Check the Windows "system" attribute; used for write operations on individual files. */
const attributeCache = new Map<string, { at: number; system: boolean }>();

export async function hasSystemAttribute(filePath: string): Promise<boolean> {
  const key = filePath.toLowerCase();
  const cached = attributeCache.get(key);
  if (cached && Date.now() - cached.at < 10_000) return cached.system;
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await execFileAsync('attrib.exe', [filePath], {
      windowsHide: true,
      timeout: 2500,
      maxBuffer: 64 * 1024,
    });
    const firstLine = stdout.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
    const match = /^([A-Z ]*)\s+([A-Za-z]:\\|\\\\\\)/.exec(firstLine);
    const flags = (match?.[1] || '').replace(/\s/g, '');
    const system = flags.includes('S');
    attributeCache.set(key, { at: Date.now(), system });
    return system;
  } catch {
    return false;
  }
}

/** Protection rules for an operation, including Windows system attributes. */
export async function inspectProtection(paths: string[]): Promise<{
  protected: boolean;
  protectedPaths: string[];
  critical: boolean;
  criticalPaths: string[];
}> {
  const protectedPaths: string[] = [];
  const criticalPaths: string[] = [];
  for (const item of paths) {
    const info = protectionForPath(item);
    if (info.critical) criticalPaths.push(item);
    if (!info.protected && paths.length <= 12) {
      const systemAttr = await hasSystemAttribute(item);
      if (systemAttr) {
        protectedPaths.push(item);
        continue;
      }
    }
    if (info.protected) protectedPaths.push(item);
  }
  return {
    protected: protectedPaths.length > 0,
    protectedPaths,
    critical: criticalPaths.length > 0,
    criticalPaths,
  };
}

export function validateEntryName(name: unknown): string {
  if (typeof name !== 'string') throw new Error('INVALID_NAME');
  const value = name.trim();
  if (!value || value === '.' || value === '..') throw new Error('INVALID_NAME');
  if (value.length > 255) throw new Error('INVALID_NAME');
  if (/[<>:"/\\|?*\x00-\x1f]/.test(value)) throw new Error('INVALID_NAME');
  if (/[. ]$/.test(value)) throw new Error('INVALID_NAME');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(value)) throw new Error('INVALID_NAME');
  return value;
}

export function isSamePath(a: string, b: string): boolean {
  const normalizedA = path.win32.normalize(a).replace(/[\\/]+$/, '').toLowerCase();
  const normalizedB = path.win32.normalize(b).replace(/[\\/]+$/, '').toLowerCase();
  return normalizedA === normalizedB;
}

export function caseInsensitiveKey(input: string): string {
  return path.win32.normalize(input).toLowerCase();
}

export function exists(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}
