import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

export interface SystemSnapshot {
  drives: DriveInfo[];
  folders: KnownFolder[];
  fetchedAt: number;
}

let cache: SystemSnapshot | null = null;
let pending: Promise<SystemSnapshot> | null = null;

const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$driveItems = @()
foreach ($d in Get-CimInstance Win32_LogicalDisk) {
  $driveItems += [PSCustomObject]@{
    path = [string]$d.DeviceID + '\'
    letter = [string]$d.DeviceID
    label = [string]$d.VolumeName
    filesystem = [string]$d.FileSystem
    type = [int]$d.DriveType
    total = [double]$d.Size
    free = [double]$d.FreeSpace
  }
}
$profilePath = [Environment]::GetFolderPath('UserProfile')
$folderItems = @(
  [PSCustomObject]@{ key='home'; path=$profilePath },
  [PSCustomObject]@{ key='desktop'; path=[Environment]::GetFolderPath('Desktop') },
  [PSCustomObject]@{ key='documents'; path=[Environment]::GetFolderPath('MyDocuments') },
  [PSCustomObject]@{ key='downloads'; path=(Join-Path $profilePath 'Downloads') },
  [PSCustomObject]@{ key='pictures'; path=[Environment]::GetFolderPath('MyPictures') },
  [PSCustomObject]@{ key='videos'; path=[Environment]::GetFolderPath('MyVideos') },
  [PSCustomObject]@{ key='music'; path=[Environment]::GetFolderPath('MyMusic') }
) | Where-Object { $_.path -and (Test-Path -LiteralPath $_.path) }
[PSCustomObject]@{ drives=@($driveItems); folders=@($folderItems) } | ConvertTo-Json -Depth 4 -Compress
`;

type RawDrive = {
  path: string;
  letter: string;
  label: string;
  filesystem: string;
  type: number;
  total: number;
  free: number;
};
type RawFolder = { key: string; path: string };

function mapDriveType(type: number): DriveInfo['type'] {
  switch (type) {
    case 2:
      return 'removable';
    case 3:
      return 'fixed';
    case 4:
      return 'network';
    case 5:
      return 'cdrom';
    case 6:
      return 'ramdisk';
    default:
      return 'unknown';
  }
}

async function fallbackSnapshot(): Promise<SystemSnapshot> {
  const drives: DriveInfo[] = [];
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    const drivePath = `${letter}:\\`;
    try {
      fs.accessSync(drivePath);
      const stats = await fs.promises.statfs(drivePath);
      drives.push({
        path: drivePath,
        letter: `${letter}:`,
        label: '',
        filesystem: '',
        type: 'unknown',
        total: Number(stats.blocks) * Number(stats.bsize),
        free: Number(stats.bavail) * Number(stats.bsize),
      });
    } catch {
      /* not available */
    }
  }
  const home = os.homedir();
  const folders: KnownFolder[] = [
    { key: 'home', path: home },
    ...['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music'].map((name) => ({
      key: name.toLowerCase(),
      path: path.join(home, name),
    })),
  ].map((folder) => ({ ...folder, exists: fs.existsSync(folder.path) }));
  return { drives, folders, fetchedAt: Date.now() };
}

export async function getSystemSnapshot(force = false): Promise<SystemSnapshot> {
  if (!force && cache && Date.now() - cache.fetchedAt < 60_000) return cache;
  if (pending) return pending;
  pending = (async () => {
    if (process.platform !== 'win32') return fallbackSnapshot();
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
      );
      const raw = JSON.parse(stdout.trim()) as { drives: RawDrive[]; folders: RawFolder[] };
      const drives = (raw.drives || []).map((drive) => ({
        path: drive.path,
        letter: drive.letter,
        label: drive.label || '',
        filesystem: drive.filesystem || '',
        type: mapDriveType(drive.type),
        total: Number(drive.total) || 0,
        free: Number(drive.free) || 0,
      }));
      const folders = (raw.folders || []).map((folder) => ({
        key: folder.key,
        path: folder.path,
        exists: fs.existsSync(folder.path),
      }));
      cache = { drives, folders, fetchedAt: Date.now() };
      return cache;
    } catch {
      cache = await fallbackSnapshot();
      return cache;
    }
  })().finally(() => {
    pending = null;
  });
  return pending;
}

export function driveLabelForPath(snapshot: SystemSnapshot, input: string): string {
  const parsed = path.win32.parse(input);
  const root = parsed.root;
  const drive = snapshot.drives.find((item) => item.path.toLowerCase() === root.toLowerCase());
  if (!drive) return root.replace(/\\$/, '');
  return drive.label ? `${drive.label} (${drive.letter})` : `Local Disk (${drive.letter})`;
}

export interface NetworkAddress {
  address: string;
  url: string;
  family: 'IPv4';
  name: string;
}

export function getLanAddresses(port: number): NetworkAddress[] {
  const result: NetworkAddress[] = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      result.push({
        address: entry.address,
        url: `http://${entry.address}:${port}`,
        family: 'IPv4',
        name,
      });
    }
  }
  const score = (name: string, ip: string) => {
    // 虚拟网卡通常无法被手机访问，排在真实局域网网卡之后
    const virtual = /vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|bridge|singbox|tailscale|zerotier|\btun\b|\btap\b|loopback|bluetooth/i.test(
      name,
    );
    const physical = /wi-?fi|wlan|wireless|ethernet|以太网|无线/i.test(name);
    const ipScore = ip.startsWith('192.168.')
      ? 0
      : ip.startsWith('10.')
        ? 1
        : /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
          ? 2
          : 3;
    return (virtual ? 50 : 0) + (physical ? 0 : 10) + ipScore;
  };
  return result.sort((a, b) => score(a.name, a.address) - score(b.name, b.address));
}

export function getHostnameUrl(port: number): string {
  const host = os.hostname().replace(/[^a-zA-Z0-9-]/g, '');
  return host ? `http://${host}:${port}` : '';
}
