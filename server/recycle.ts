import { spawn } from 'node:child_process';

interface RecycleResult {
  path: string;
  ok: boolean;
  error?: string;
}

const script = String.raw`
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$payload = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8).ReadToEnd()
$paths = @($payload | ConvertFrom-Json)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class FileAnywhereRecycle {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct SHFILEOPSTRUCT {
    public IntPtr hwnd;
    public uint wFunc;
    [MarshalAs(UnmanagedType.LPWStr)] public string pFrom;
    [MarshalAs(UnmanagedType.LPWStr)] public string pTo;
    public ushort fFlags;
    [MarshalAs(UnmanagedType.Bool)] public bool fAnyOperationsAborted;
    public IntPtr hNameMappings;
    [MarshalAs(UnmanagedType.LPWStr)] public string lpszProgressTitle;
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  private static extern int SHFileOperation(ref SHFILEOPSTRUCT op);

  public static int Delete(string path) {
    const uint FO_DELETE = 3;
    const ushort FOF_SILENT = 0x0004;
    const ushort FOF_NOCONFIRMATION = 0x0010;
    const ushort FOF_ALLOWUNDO = 0x0040;
    const ushort FOF_NOERRORUI = 0x0400;

    var op = new SHFILEOPSTRUCT();
    op.wFunc = FO_DELETE;
    op.pFrom = path + "\0\0";
    op.fFlags = (ushort)(FOF_SILENT | FOF_NOCONFIRMATION | FOF_ALLOWUNDO | FOF_NOERRORUI);
    return SHFileOperation(ref op);
  }
}
"@
$results = @()
foreach ($item in $paths) {
  try {
    $code = [FileAnywhereRecycle]::Delete([string]$item)
    $ok = ($code -eq 0)
    $results += [PSCustomObject]@{ path = [string]$item; ok = $ok; code = $code }
  } catch {
    $results += [PSCustomObject]@{ path = [string]$item; ok = $false; code = -1; error = $_.Exception.Message }
  }
}
[PSCustomObject]@{ results = @($results) } | ConvertTo-Json -Depth 4 -Compress
`;

const ERROR_MESSAGES: Record<number, string> = {
  2: 'The file could not be found.',
  5: 'Access was denied.',
  7: 'The operation was cancelled.',
  31: 'The file is in use by another program.',
  32: 'The file is in use by another program.',
  122: 'The path is too long to move to the Recycle Bin.',
  0x402: 'The Recycle Bin is not available for this location.',
  0x7c: 'The operation was cancelled.',
};

/**
 * Move paths to the Windows Recycle Bin via SHFileOperation.
 * Nothing is ever permanently deleted; failures are reported back to the caller.
 */
export function recyclePaths(paths: string[]): Promise<RecycleResult[]> {
  if (paths.length === 0) return Promise.resolve([]);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (results: RecycleResult[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(results);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      finish(paths.map((item) => ({ path: item, ok: false, error: 'The operation timed out.' })));
    }, 120_000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      finish(paths.map((item) => ({ path: item, ok: false, error: error.message })));
    });
    child.on('close', (code) => {
      if (settled) return;
      try {
        const parsed = JSON.parse(stdout.trim()) as {
          results?: Array<{ path: string; ok: boolean; code?: number; error?: string }>;
        };
        const results: RecycleResult[] = (parsed.results || []).map((entry) => ({
          path: entry.path,
          ok: entry.ok,
          error: entry.ok
            ? undefined
            : entry.error || ERROR_MESSAGES[entry.code || -1] || `Could not move the item to the Recycle Bin (code ${entry.code}).`,
        }));
        finish(results);
      } catch {
        finish(
          paths.map((item) => ({
            path: item,
            ok: false,
            error:
              stderr.trim() ||
              (code === 0 ? 'The Recycle Bin operation returned an unexpected response.' : `Recycle Bin operation failed (${code}).`),
          })),
        );
      }
    });

    child.stdin.write(JSON.stringify(paths), 'utf8');
    child.stdin.end();
  });
}
