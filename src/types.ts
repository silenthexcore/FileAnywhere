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

export interface Breadcrumb {
  name: string;
  path: string;
}

export interface Listing {
  path: string;
  parent: string | null;
  name: string;
  root: string;
  breadcrumbs: Breadcrumb[];
  items: FsItem[];
  truncated: boolean;
  total: number;
  directoryProtected: boolean;
  disk: { total: number; free: number } | null;
}

export interface DriveInfo {
  path: string;
  letter: string;
  label: string;
  filesystem: string;
  type: 'fixed' | 'removable' | 'network' | 'cdrom' | 'ramdisk' | 'unknown';
  total: number;
  free: number;
}

export interface KnownFolder {
  key: string;
  path: string;
  exists: boolean;
}

export interface SystemInfo {
  hostname: string;
  username: string;
  platform: string;
  version: string;
  port: number;
  localUrl: string;
  hostnameUrl: string;
  lanAddresses: Array<{ address: string; url: string; family: string; name: string }>;
  drives: DriveInfo[];
  knownFolders: KnownFolder[];
  dataDir: string;
}

export interface Health {
  ok: boolean;
  app: string;
  version: string;
  setupRequired: boolean;
  remoteCodeRequired: boolean;
  isLocal: boolean;
  platform: string;
}

export interface TunnelStatus {
  supported: boolean;
  installed: boolean;
  installing: boolean;
  running: boolean;
  starting: boolean;
  url: string | null;
  error: string | null;
  autoStart: boolean;
  path: string | null;
}

export interface TextContent {
  path: string;
  name: string;
  content: string;
  encoding: string;
  bom: boolean;
  size: number;
  mtimeMs: number;
  eol: 'CRLF' | 'LF';
  writable: boolean;
  protected: boolean;
}

export interface OperationResult {
  path: string;
  ok: boolean;
  destination?: string;
  error?: string;
  renamed?: boolean;
}

export interface UploadItem {
  path: string;
  name: string;
  size: number;
  renamed: boolean;
}

export interface UploadResponse {
  items: UploadItem[];
  renamedCount: number;
}

export interface SearchResponse {
  results: FsItem[];
  truncated: boolean;
  scanned: number;
  elapsedMs: number;
}

export interface StatResponse {
  path: string;
  isDir: boolean;
  isFile: boolean;
  size: number;
  mtimeMs: number;
  protected: boolean;
  system: boolean;
  reason: string | null;
  critical: boolean;
}
