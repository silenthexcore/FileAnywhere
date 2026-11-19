import type { FsItem } from '../types';
import type { SortDirection, SortKey } from './preferences';

export type FileKind =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'pdf'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'code'
  | 'text'
  | 'executable'
  | 'font'
  | 'diskImage'
  | 'shortcut'
  | 'config'
  | 'other';

const imageExtensions = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif', 'heic', 'heif', 'tif', 'tiff',
]);
const videoExtensions = new Set(['mp4', 'webm', 'ogv', 'mov', 'mkv', 'avi', 'm4v', 'wmv', 'flv', '3gp']);
const audioExtensions = new Set(['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'opus', 'aiff']);
const documentExtensions = new Set(['doc', 'docx', 'odt', 'rtf', 'pages']);
const spreadsheetExtensions = new Set(['xls', 'xlsx', 'ods', 'csv', 'tsv', 'numbers']);
const presentationExtensions = new Set(['ppt', 'pptx', 'odp', 'key']);
const archiveExtensions = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'cab', 'lz4', 'zst']);
const codeExtensions = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less',
  'vue', 'svelte', 'php', 'py', 'pyw', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'hpp',
  'cs', 'swift', 'lua', 'pl', 'r', 'dart', 'scala', 'clj', 'ex', 'exs', 'hs', 'sh', 'bash', 'zsh',
  'ps1', 'psm1', 'bat', 'cmd', 'sql', 'graphql', 'gql', 'proto', 'asm',
]);
const textExtensions = new Set([
  'txt', 'log', 'md', 'markdown', 'nfo', 'readme', 'csv', 'tsv', 'rtf', 'tex', 'srt', 'vtt', 'm3u',
]);
const configExtensions = new Set([
  'json', 'jsonc', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties', 'plist',
  'reg', 'editorconfig', 'gitignore', 'gitattributes', 'npmrc', 'nvmrc',
]);
const executableExtensions = new Set(['exe', 'msi', 'msix', 'appx', 'com', 'scr', 'apk', 'ipa', 'app', 'dmg']);
const fontExtensions = new Set(['ttf', 'otf', 'woff', 'woff2', 'eot']);
const diskImageExtensions = new Set(['iso', 'img', 'vhd', 'vhdx', 'vmdk', 'qcow2', 'dmg']);
const shortcutExtensions = new Set(['lnk', 'url', 'webloc']);

const textFilenames = new Set([
  'license', 'licence', 'readme', 'changelog', 'dockerfile', 'makefile', 'rakefile', 'gemfile',
  'procfile', 'hosts', 'nginx.conf', 'web.config', 'app.config',
]);

export function fileKind(item: Pick<FsItem, 'isDir' | 'ext' | 'name'>): FileKind {
  if (item.isDir) return 'folder';
  const ext = item.ext.toLowerCase();
  if (imageExtensions.has(ext)) return 'image';
  if (videoExtensions.has(ext)) return 'video';
  if (audioExtensions.has(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (documentExtensions.has(ext)) return 'document';
  if (spreadsheetExtensions.has(ext)) return 'spreadsheet';
  if (presentationExtensions.has(ext)) return 'presentation';
  if (archiveExtensions.has(ext)) return 'archive';
  if (configExtensions.has(ext)) return 'config';
  if (codeExtensions.has(ext)) return 'code';
  if (executableExtensions.has(ext)) return 'executable';
  if (fontExtensions.has(ext)) return 'font';
  if (diskImageExtensions.has(ext)) return 'diskImage';
  if (shortcutExtensions.has(ext)) return 'shortcut';
  if (textExtensions.has(ext)) return 'text';
  return 'other';
}

export function typeLabelKey(kind: FileKind): string {
  return `type.${kind}`;
}

export function isImage(item: Pick<FsItem, 'isDir' | 'ext'>): boolean {
  return !item.isDir && imageExtensions.has(item.ext.toLowerCase());
}

export function isVideo(item: Pick<FsItem, 'isDir' | 'ext'>): boolean {
  return !item.isDir && videoExtensions.has(item.ext.toLowerCase());
}

export function isAudio(item: Pick<FsItem, 'isDir' | 'ext'>): boolean {
  return !item.isDir && audioExtensions.has(item.ext.toLowerCase());
}

export function isPdf(item: Pick<FsItem, 'isDir' | 'ext'>): boolean {
  return !item.isDir && item.ext.toLowerCase() === 'pdf';
}

export function isTextLike(item: Pick<FsItem, 'isDir' | 'ext' | 'name'>): boolean {
  if (item.isDir) return false;
  const ext = item.ext.toLowerCase();
  const lowerName = item.name.toLowerCase();
  return (
    codeExtensions.has(ext) ||
    textExtensions.has(ext) ||
    configExtensions.has(ext) ||
    textFilenames.has(lowerName) ||
    (lowerName.startsWith('.') && !lowerName.startsWith('..'))
  );
}

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'none';

export function previewKind(item: Pick<FsItem, 'isDir' | 'ext' | 'name'>): PreviewKind {
  if (item.isDir) return 'none';
  if (isImage(item)) return 'image';
  if (isVideo(item)) return 'video';
  if (isAudio(item)) return 'audio';
  if (isPdf(item)) return 'pdf';
  if (isTextLike(item)) return 'text';
  return 'none';
}

export function editorLanguage(ext: string): string {
  const value = ext.toLowerCase();
  if (['ts', 'tsx'].includes(value)) return value === 'tsx' ? 'typescript-jsx' : 'typescript';
  if (['js', 'jsx', 'mjs', 'cjs'].includes(value)) return value === 'jsx' ? 'javascript-jsx' : 'javascript';
  if (['json', 'jsonc'].includes(value)) return 'json';
  if (['html', 'htm', 'xhtml'].includes(value)) return 'html';
  if (['css', 'scss', 'sass', 'less'].includes(value)) return 'css';
  if (['md', 'markdown'].includes(value)) return 'markdown';
  if (['py', 'pyw'].includes(value)) return 'python';
  if (['xml', 'svg', 'plist', 'csproj', 'props'].includes(value)) return 'xml';
  if (value === 'sql') return 'sql';
  return 'plain';
}

export function formatBytes(bytes: number | null | undefined, locale: string): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes === 0) return `0 B`;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  const maximumFractionDigits = index === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value)} ${units[index]}`;
}

export function formatDate(mtimeMs: number | null | undefined, locale: string, compact = false): string {
  if (!mtimeMs) return '—';
  const date = new Date(mtimeMs);
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: compact ? '2-digit' : 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(ms, 1)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function baseName(filePath: string): string {
  const cleaned = filePath.replace(/[\\/]+$/, '');
  const index = Math.max(cleaned.lastIndexOf('\\'), cleaned.lastIndexOf('/'));
  return index >= 0 ? cleaned.slice(index + 1) : cleaned;
}

export function parentPath(filePath: string): string | null {
  const cleaned = filePath.replace(/[\\/]+$/, '');
  if (/^[A-Za-z]:$/.test(cleaned)) return null;
  if (/^[A-Za-z]:\\?$/.test(filePath)) return null;
  const index = Math.max(cleaned.lastIndexOf('\\'), cleaned.lastIndexOf('/'));
  if (index < 0) return null;
  if (index === 2 && cleaned[1] === ':') return `${cleaned.slice(0, 2)}\\`;
  return cleaned.slice(0, index) || null;
}

export function joinPath(directory: string, name: string): string {
  return `${directory.replace(/[\\/]+$/, '')}\\${name}`;
}

export function samePath(a: string, b: string): boolean {
  return a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();
}

export function isPathInside(parent: string, child: string): boolean {
  const p = parent.replace(/[\\/]+$/, '').toLowerCase();
  const c = child.replace(/[\\/]+$/, '').toLowerCase();
  return c === p || c.startsWith(`${p}\\`);
}

export function shortenMiddle(text: string, maxLength = 80): string {
  if (text.length <= maxLength) return text;
  const head = Math.ceil((maxLength - 3) * 0.6);
  const tail = Math.floor((maxLength - 3) * 0.4);
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export function highlightParts(text: string, query: string): Array<{ text: string; match: boolean }> {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerNeedle, cursor);
    if (index === -1) {
      parts.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (index > cursor) parts.push({ text: text.slice(cursor, index), match: false });
    parts.push({ text: text.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
  }
  return parts;
}

export function sortItems(
  items: FsItem[],
  sortBy: SortKey,
  direction: SortDirection,
  locale: string,
): FsItem[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const sorted = [...items].sort((a, b) => {
    // Folders always stay above files, like Explorer.
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    let result = 0;
    if (sortBy === 'modified') {
      result = (a.mtimeMs || 0) - (b.mtimeMs || 0);
    } else if (sortBy === 'size') {
      result = (a.size || 0) - (b.size || 0);
    } else if (sortBy === 'type') {
      result = collator.compare(a.ext || '', b.ext || '');
    }
    if (result === 0) result = collator.compare(a.name, b.name);
    return direction === 'asc' ? result : -result;
  });
  return sorted;
}

export function quickFolderIconKey(key: string): 'home' | 'desktop' | 'documents' | 'downloads' | 'pictures' | 'videos' | 'music' {
  if (['home', 'desktop', 'documents', 'downloads', 'pictures', 'videos', 'music'].includes(key)) {
    return key as 'home' | 'desktop' | 'documents' | 'downloads' | 'pictures' | 'videos' | 'music';
  }
  return 'home';
}
