import {
  AppWindow,
  Archive,
  Clapperboard,
  Disc3,
  Download,
  File,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  HardDrive,
  Home,
  Image,
  Link2,
  Monitor,
  Music,
  Network,
  Presentation,
  Settings2,
  Type,
  Usb,
  type LucideIcon,
} from 'lucide-react';
import type { DriveInfo, FsItem } from '../types';
import { fileKind, type FileKind } from '../lib/files';

const kindMeta: Record<FileKind, { icon: LucideIcon; tone: string; fill?: boolean }> = {
  folder: { icon: Folder, tone: 'amber', fill: true },
  image: { icon: FileImage, tone: 'rose' },
  video: { icon: FileVideo, tone: 'violet' },
  audio: { icon: FileAudio, tone: 'teal' },
  document: { icon: FileText, tone: 'blue' },
  pdf: { icon: FileText, tone: 'red' },
  spreadsheet: { icon: FileSpreadsheet, tone: 'green' },
  presentation: { icon: Presentation, tone: 'orange' },
  archive: { icon: Archive, tone: 'amber' },
  code: { icon: FileCode2, tone: 'indigo' },
  text: { icon: FileText, tone: 'slate' },
  executable: { icon: AppWindow, tone: 'cool' },
  font: { icon: Type, tone: 'pink' },
  diskImage: { icon: Disc3, tone: 'slate' },
  shortcut: { icon: Link2, tone: 'sky' },
  config: { icon: Settings2, tone: 'slate' },
  other: { icon: File, tone: 'slate' },
};

export function FileIcon({
  item,
  size = 38,
  className = '',
}: {
  item: Pick<FsItem, 'isDir' | 'ext' | 'name'>;
  size?: number;
  className?: string;
}) {
  const kind = fileKind(item);
  const meta = kindMeta[kind];
  const Icon = meta.icon;
  const iconSize = Math.round(size * 0.52);
  return (
    <span
      className={`file-icon tone-${meta.tone} ${kind === 'folder' ? 'is-folder' : ''} ${className}`}
      style={{ width: size, height: size, borderRadius: Math.max(9, Math.round(size * 0.28)) }}
      aria-hidden="true"
    >
      <Icon size={iconSize} strokeWidth={1.8} fill={meta.fill ? 'currentColor' : 'none'} />
    </span>
  );
}

const driveIcons: Record<DriveInfo['type'], LucideIcon> = {
  fixed: HardDrive,
  removable: Usb,
  network: Network,
  cdrom: Disc3,
  ramdisk: HardDrive,
  unknown: HardDrive,
};

export function DriveIcon({ drive, size = 34 }: { drive: DriveInfo; size?: number }) {
  const Icon = driveIcons[drive.type] || HardDrive;
  return (
    <span
      className={`nav-icon tone-drive ${drive.type === 'network' ? 'is-network' : ''}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={1.8} />
    </span>
  );
}

const quickIcons: Record<string, LucideIcon> = {
  home: Home,
  desktop: Monitor,
  documents: FileText,
  downloads: Download,
  pictures: Image,
  videos: Clapperboard,
  music: Music,
};

export function QuickIcon({ kind, size = 34 }: { kind: string; size?: number }) {
  const Icon = quickIcons[kind] || Home;
  return (
    <span
      className={`nav-icon tone-quick tone-quick-${kind}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.8} />
    </span>
  );
}
